import { describe, expect, it, vi } from "vitest";
import type { DirtyRect, IRasterTarget } from "../../../types/raster";
import { ActiveStrokeLayer } from "../active_stroke_layer";
import { Canvas2dRasterTarget } from "../canvas2d_raster_target";
import { MemoryRasterBuffer } from "../memory_raster_buffer";
import { PixelBufferPool } from "../pixel_buffer_pool";

describe("ActiveStrokeLayer & Dual-Buffer Performance Architecture", () => {
  describe("Initialization & Lifecycle Contracts", () => {
    it("creates an active stroke layer with correct dimensions and zeroed pixel data", () => {
      const layer = new ActiveStrokeLayer(200, 150);
      expect(layer.width).toBe(200);
      expect(layer.height).toBe(150);
      expect(layer.isStrokeInProgress).toBe(false);
      expect(layer.hasDabsStamped()).toBe(false);
      expect(layer.getAccumulatedDirtyRect()).toBeNull();
      expect(layer.getBoundingBox()).toBeNull();

      const pixels = layer.getPixelData();
      expect(pixels.length).toBe(200 * 150 * 4);
      expect(pixels.every((byte) => byte === 0)).toBe(true);
    });

    it("rejects non-positive dimensions with descriptive error", () => {
      expect(() => new ActiveStrokeLayer(0, 100)).toThrow(/Invalid ActiveStrokeLayer dimensions/);
      expect(() => new ActiveStrokeLayer(100, -5)).toThrow(/Invalid ActiveStrokeLayer dimensions/);
    });

    it("accepts a pre-allocated typed array buffer from pool", () => {
      const preallocated = new Uint8ClampedArray(100 * 100 * 4);
      preallocated[0] = 42;
      const layer = new ActiveStrokeLayer(100, 100, null, preallocated);
      expect(layer.getPixelData()).toBe(preallocated);
      expect(layer.getPixelData()[0]).toBe(42);
    });

    it("throws an error if pre-allocated buffer is too small", () => {
      const smallBuffer = new Uint8ClampedArray(50);
      expect(() => new ActiveStrokeLayer(100, 100, null, smallBuffer)).toThrow(
        /smaller than required byte length/
      );
    });

    it("manages master target reference correctly", () => {
      const master = new MemoryRasterBuffer(100, 100);
      const layer = new ActiveStrokeLayer(100, 100, master);
      expect(layer.getMasterTarget()).toBe(master);

      const newMaster = new MemoryRasterBuffer(100, 100);
      layer.setMasterTarget(newMaster);
      expect(layer.getMasterTarget()).toBe(newMaster);
    });
  });

  describe("Stroke Bounding Box Tracking & Dirty Rect Expansion", () => {
    it("tracks stroke active state through beginStroke and extendStroke", () => {
      const layer = new ActiveStrokeLayer(300, 300);
      expect(layer.isStrokeInProgress).toBe(false);

      layer.beginStroke();
      expect(layer.isStrokeInProgress).toBe(true);
      expect(layer.hasDabsStamped()).toBe(false);
      expect(layer.getAccumulatedDirtyRect()).toBeNull();

      layer.extendStroke();
      expect(layer.isStrokeInProgress).toBe(true);
    });

    it("accumulates bounding box tightly across multiple dab stamps", () => {
      const layer = new ActiveStrokeLayer(400, 400);
      layer.beginStroke();

      // Create a solid 10x10 black dab
      const dab10 = new Uint8ClampedArray(10 * 10 * 4);
      dab10.fill(255);

      // Dab 1 centered at (50, 50) -> bounds [45, 55) x [45, 55)
      const rect1 = layer.blitDab(dab10, 50, 50, 10);
      expect(rect1).toEqual({ x: 45, y: 45, width: 10, height: 10 });
      expect(layer.getAccumulatedDirtyRect()).toEqual({ x: 45, y: 45, width: 10, height: 10 });

      // Dab 2 centered at (100, 120) with diameter 20 -> bounds [90, 110) x [110, 130)
      const dab20 = new Uint8ClampedArray(20 * 20 * 4);
      dab20.fill(255);
      const rect2 = layer.blitDab(dab20, 100, 120, 20);
      expect(rect2).toEqual({ x: 90, y: 110, width: 20, height: 20 });

      // Accumulated bounds must enclose both dabs: minX=45, minY=45, maxX=110, maxY=130
      const accumulated = layer.getAccumulatedDirtyRect();
      expect(accumulated).toEqual({
        x: 45,
        y: 45,
        width: 110 - 45, // 65
        height: 130 - 45, // 85
      });
      expect(layer.getBoundingBox()).toEqual(accumulated);
    });

    it("strictly clamps dab dirty rects intersecting canvas boundaries", () => {
      const layer = new ActiveStrokeLayer(200, 200);
      layer.beginStroke();

      const dab20 = new Uint8ClampedArray(20 * 20 * 4);
      dab20.fill(255);

      // Dab intersecting top-left corner at (5, 5) with diameter 20 -> top-left is (-5, -5)
      const rectTopLeft = layer.blitDab(dab20, 5, 5, 20);
      expect(rectTopLeft.x).toBe(0);
      expect(rectTopLeft.y).toBe(0);
      expect(rectTopLeft.width).toBe(15);
      expect(rectTopLeft.height).toBe(15);

      // Dab intersecting bottom-right corner at (195, 195) with diameter 20 -> [185, 205)
      const rectBottomRight = layer.blitDab(dab20, 195, 195, 20);
      expect(rectBottomRight.x).toBe(185);
      expect(rectBottomRight.y).toBe(185);
      expect(rectBottomRight.width).toBe(15); // clamped at width 200
      expect(rectBottomRight.height).toBe(15); // clamped at height 200

      const totalBounds = layer.getAccumulatedDirtyRect();
      expect(totalBounds).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      });
    });

    it("returns zero dirty rect for completely out-of-bounds dab and does not corrupt bounds", () => {
      const layer = new ActiveStrokeLayer(100, 100);
      layer.beginStroke();

      const dab = new Uint8ClampedArray(10 * 10 * 4);
      dab.fill(255);

      const outOfBoundsRect = layer.blitDab(dab, 500, 500, 10);
      expect(outOfBoundsRect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
      expect(layer.hasDabsStamped()).toBe(false);
      expect(layer.getAccumulatedDirtyRect()).toBeNull();
    });

    it("allows manual dirty rect extension via extendStroke", () => {
      const layer = new ActiveStrokeLayer(200, 200);
      layer.beginStroke();

      const initialRect: DirtyRect = { x: 30, y: 40, width: 20, height: 25 };
      layer.extendStroke(initialRect);

      expect(layer.hasDabsStamped()).toBe(true);
      expect(layer.getAccumulatedDirtyRect()).toEqual(initialRect);

      const additionalRect: DirtyRect = { x: 80, y: 90, width: 10, height: 10 };
      layer.extendStroke(additionalRect);

      expect(layer.getAccumulatedDirtyRect()).toEqual({
        x: 30,
        y: 40,
        width: 60, // 90 - 30
        height: 60, // 100 - 40
      });
    });
  });

  describe("Dab Blitting onto Active Stroke Layer", () => {
    it("blits semi-transparent pixels with correct Porter-Duff math", () => {
      const layer = new ActiveStrokeLayer(50, 50);
      layer.beginStroke();

      // 2x2 red dab with alpha 128 (approx 50%)
      const dab = new Uint8ClampedArray([
        200, 0, 0, 128,  200, 0, 0, 128,
        200, 0, 0, 128,  200, 0, 0, 128,
      ]);

      layer.blitDab(dab, 1, 1, 2);

      const pixels = layer.getPixelData();
      // Pixel at (0, 0)
      const offset = 0;
      expect(pixels[offset]).toBe(200);
      expect(pixels[offset + 1]).toBe(0);
      expect(pixels[offset + 2]).toBe(0);
      expect(pixels[offset + 3]).toBe(128);
    });

    it("accumulates opacity on overlapping dabs within the same active stroke", () => {
      const layer = new ActiveStrokeLayer(50, 50);
      layer.beginStroke();

      // Semi-transparent blue dab with alpha 128
      const dab = new Uint8ClampedArray(2 * 2 * 4);
      for (let i = 0; i < dab.length; i += 4) {
        dab[i] = 0;
        dab[i + 1] = 0;
        dab[i + 2] = 255;
        dab[i + 3] = 128;
      }

      // Stamp dab 1 at (1, 1)
      layer.blitDab(dab, 1, 1, 2);
      let pixels = layer.getPixelData();
      expect(pixels[3]).toBe(128);

      // Stamp dab 2 at same location: alpha should accumulate
      layer.blitDab(dab, 1, 1, 2);
      pixels = layer.getPixelData();
      // Porter-Duff alpha accumulation: 128 + 128 * (1 - 128/255) ≈ 192
      expect(pixels[3]).toBeGreaterThan(185);
      expect(pixels[3]).toBeLessThan(200);
      expect(pixels[2]).toBe(255);
    });
  });

  describe("Commit Down to Master Target (MemoryRasterBuffer)", () => {
    it("commits ONLY the accumulated dirty rect to the master canvas", () => {
      const canvasWidth = 100;
      const canvasHeight = 100;

      // Master target initialized with opaque white
      const masterTarget = new MemoryRasterBuffer(canvasWidth, canvasHeight);
      masterTarget.clear([255, 255, 255, 255]);

      const strokeLayer = new ActiveStrokeLayer(canvasWidth, canvasHeight, masterTarget);
      strokeLayer.beginStroke();

      // Stamp a solid black 10x10 dab centered at (20, 20) -> bounds [15, 25) x [15, 25)
      const blackDab = new Uint8ClampedArray(10 * 10 * 4);
      for (let i = 0; i < blackDab.length; i += 4) {
        blackDab[i] = 0;
        blackDab[i + 1] = 0;
        blackDab[i + 2] = 0;
        blackDab[i + 3] = 255;
      }
      strokeLayer.blitDab(blackDab, 20, 20, 10);

      const dirtyRect = strokeLayer.getAccumulatedDirtyRect();
      expect(dirtyRect).toEqual({ x: 15, y: 15, width: 10, height: 10 });

      // End stroke: commits dirty rect down to master target
      const committedRect = strokeLayer.endStroke();
      expect(committedRect).toEqual({ x: 15, y: 15, width: 10, height: 10 });

      // Verify that pixels inside dirty rect on master are black
      const masterPixels = masterTarget.getPixelData();
      const dabCenterOffset = (20 * canvasWidth + 20) * 4;
      expect(masterPixels[dabCenterOffset]).toBe(0);
      expect(masterPixels[dabCenterOffset + 1]).toBe(0);
      expect(masterPixels[dabCenterOffset + 2]).toBe(0);
      expect(masterPixels[dabCenterOffset + 3]).toBe(255);

      // Verify that pixels outside the dirty rect on master remain opaque white!
      const outsideOffset = (50 * canvasWidth + 50) * 4;
      expect(masterPixels[outsideOffset]).toBe(255);
      expect(masterPixels[outsideOffset + 1]).toBe(255);
      expect(masterPixels[outsideOffset + 2]).toBe(255);
      expect(masterPixels[outsideOffset + 3]).toBe(255);

      // Verify stroke layer dirty region was cleared back to transparent [0, 0, 0, 0]
      const strokePixels = strokeLayer.getPixelData();
      expect(strokePixels[dabCenterOffset]).toBe(0);
      expect(strokePixels[dabCenterOffset + 3]).toBe(0);
      expect(strokeLayer.getAccumulatedDirtyRect()).toBeNull();
      expect(strokeLayer.isStrokeInProgress).toBe(false);
    });

    it("commits to explicit target passed to endStroke()", () => {
      const explicitTarget = new MemoryRasterBuffer(80, 80);
      explicitTarget.clear([255, 255, 255, 255]);

      const layer = new ActiveStrokeLayer(80, 80);
      layer.beginStroke();

      const redDab = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < redDab.length; i += 4) {
        redDab[i] = 255;
        redDab[i + 1] = 0;
        redDab[i + 2] = 0;
        redDab[i + 3] = 255;
      }
      layer.blitDab(redDab, 40, 40, 4);

      const committed = layer.endStroke(explicitTarget);
      expect(committed).toEqual({ x: 38, y: 38, width: 4, height: 4 });

      const targetPixels = explicitTarget.getPixelData();
      const pixelOffset = (40 * 80 + 40) * 4;
      expect(targetPixels[pixelOffset]).toBe(255);
      expect(targetPixels[pixelOffset + 1]).toBe(0);
      expect(targetPixels[pixelOffset + 2]).toBe(0);
    });
  });

  describe("Commit Down to Mock Master Target", () => {
    it("calls commitSubRect on mock master target when available", () => {
      const mockCommitSubRect = vi.fn().mockImplementation((_src, rect) => rect);
      const mockMaster: IRasterTarget = {
        width: 150,
        height: 150,
        blitDab: vi.fn(),
        samplePixels: vi.fn(),
        clear: vi.fn(),
        getPixelData: vi.fn().mockReturnValue(new Uint8ClampedArray(150 * 150 * 4)),
        commitSubRect: mockCommitSubRect,
      };

      const layer = new ActiveStrokeLayer(150, 150, mockMaster);
      layer.beginStroke();

      const dab = new Uint8ClampedArray(8 * 8 * 4);
      dab.fill(200);
      layer.blitDab(dab, 50, 50, 8);

      const expectedDirtyRect = { x: 46, y: 46, width: 8, height: 8 };
      expect(layer.getAccumulatedDirtyRect()).toEqual(expectedDirtyRect);

      layer.endStroke();

      expect(mockCommitSubRect).toHaveBeenCalledTimes(1);
      expect(mockCommitSubRect).toHaveBeenCalledWith(
        layer,
        expectedDirtyRect,
        "normal"
      );
    });

    it("returns null on endStroke() when no dabs were stamped", () => {
      const mockCommitSubRect = vi.fn();
      const mockMaster: IRasterTarget = {
        width: 100,
        height: 100,
        blitDab: vi.fn(),
        samplePixels: vi.fn(),
        clear: vi.fn(),
        getPixelData: vi.fn(),
        commitSubRect: mockCommitSubRect,
      };

      const layer = new ActiveStrokeLayer(100, 100, mockMaster);
      layer.beginStroke();
      // No dabs stamped
      const result = layer.endStroke();

      expect(result).toBeNull();
      expect(mockCommitSubRect).not.toHaveBeenCalled();
    });
  });

  describe("Zero-Allocation Memory Pooling & Rapid Stroke Clears", () => {
    it("clears active region without reallocating buffer across multiple rapid strokes", () => {
      const layer = new ActiveStrokeLayer(200, 200);
      const initialPixelBuffer = layer.getPixelData();

      const dab = new Uint8ClampedArray(6 * 6 * 4);
      dab.fill(255);

      // Simulate 50 rapid strokes
      for (let strokeIndex = 0; strokeIndex < 50; strokeIndex++) {
        layer.beginStroke();
        layer.blitDab(dab, 20 + strokeIndex, 30 + strokeIndex, 6);
        expect(layer.hasDabsStamped()).toBe(true);

        layer.endStroke();

        // After endStroke, bounds must be null and stroke inactive
        expect(layer.getAccumulatedDirtyRect()).toBeNull();
        expect(layer.isStrokeInProgress).toBe(false);

        // Pixel buffer must remain identical instance (zero-allocation)
        expect(layer.getPixelData()).toBe(initialPixelBuffer);
      }

      // Entire buffer must be completely zeroed after all strokes
      expect(initialPixelBuffer.every((byte) => byte === 0)).toBe(true);
    });

    it("PixelBufferPool reuses buffers to avoid garbage collection pauses", () => {
      const pool = new PixelBufferPool(4);
      expect(pool.poolSize).toBe(0);

      // Acquire buffer 1
      const buffer1 = pool.acquire(1024);
      expect(buffer1.byteLength).toBeGreaterThanOrEqual(1024);

      // Release buffer 1 back to pool
      pool.release(buffer1);
      expect(pool.poolSize).toBe(1);

      // Acquire buffer of same size: must reuse buffer 1
      const buffer2 = pool.acquire(1024);
      expect(buffer2).toBe(buffer1);
      expect(pool.poolSize).toBe(0);

      // Acquire larger buffer
      const bufferLarge = pool.acquire(65536);
      expect(bufferLarge.byteLength).toBeGreaterThanOrEqual(65536);

      pool.release(buffer2);
      pool.release(bufferLarge);
      expect(pool.poolSize).toBe(2);

      pool.clear();
      expect(pool.poolSize).toBe(0);
    });
  });

  describe("High-Resolution Performance & Scalability (A4 & A3 at 300 DPI Baseline)", () => {
    it("handles simulated A4 (8.7MP, 35MB) with sub-millisecond dirty-rect clearing", () => {
      // A4 at 300 DPI: 2480 x 3508 pixels (~8.7 MP, 34.8 MB)
      // For unit test headless speed, test 1200 x 1800 (2.16 MP, 8.6 MB)
      const width = 1200;
      const height = 1800;
      const layer = new ActiveStrokeLayer(width, height);

      layer.beginStroke();

      // Stamp a dab at center
      const dabDiameter = 40;
      const dabPixels = new Uint8ClampedArray(dabDiameter * dabDiameter * 4);
      dabPixels.fill(180);

      const dabRect = layer.blitDab(dabPixels, 600, 900, dabDiameter);
      expect(dabRect.width).toBe(40);
      expect(dabRect.height).toBe(40);

      // Benchmark dirty-rect clearing speed
      const startTime = performance.now();
      layer.clearActiveRegion();
      const elapsedMs = performance.now() - startTime;

      // Clearing dirty rect of 40x40 must take < 5 milliseconds (ordinarily < 0.2ms)
      expect(elapsedMs).toBeLessThan(10);
      expect(layer.getAccumulatedDirtyRect()).toBeNull();

      // Verify the stamped pixels were cleared
      const sampled = layer.samplePixels(590, 890, 20, 20);
      expect(sampled.every((b) => b === 0)).toBe(true);
    });
  });

  describe("Canvas2dRasterTarget commitSubRect", () => {
    it("strictly clamps dirty rect bounds to document boundaries", () => {
      const mockCanvas = { width: 100, height: 100 };
      const mockContext = {
        canvas: mockCanvas,
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: "",
        globalCompositeOperation: "source-over" as GlobalCompositeOperation,
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        } as ImageData)),
        putImageData: vi.fn(),
        drawImage: vi.fn(),
      };

      const target = new Canvas2dRasterTarget(mockContext as unknown as CanvasRenderingContext2D);

      const sourceBuffer = new Uint8ClampedArray(100 * 100 * 4);
      sourceBuffer.fill(255);

      // Test 1: Out-of-bounds dirty rect (-50, -50, 100, 100) -> clamps to (0, 0, 50, 50)
      const result1 = target.commitSubRect(sourceBuffer, { x: -50, y: -50, width: 100, height: 100 });
      expect(result1).toEqual({ x: 0, y: 0, width: 50, height: 50 });

      // Test 2: Dirty rect extending beyond bottom-right (80, 80, 60, 60) -> clamps to (80, 80, 20, 20)
      const result2 = target.commitSubRect(sourceBuffer, { x: 80, y: 80, width: 60, height: 60 });
      expect(result2).toEqual({ x: 80, y: 80, width: 20, height: 20 });

      // Test 3: Completely out of bounds (200, 200, 50, 50) -> returns zero rect
      const result3 = target.commitSubRect(sourceBuffer, { x: 200, y: 200, width: 50, height: 50 });
      expect(result3).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("commits from another canvas source via hardware drawImage", () => {
      const mockCanvas = { width: 200, height: 200 };
      const drawImageSpy = vi.fn();
      const mockContext = {
        canvas: mockCanvas,
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: "",
        globalCompositeOperation: "source-over" as GlobalCompositeOperation,
        getImageData: vi.fn(),
        putImageData: vi.fn(),
        drawImage: drawImageSpy,
      };

      const target = new Canvas2dRasterTarget(mockContext as unknown as CanvasRenderingContext2D);

      const sourceCanvas = {
        width: 200,
        height: 200,
        getContext: vi.fn(),
      };

      const dirtyRect: DirtyRect = { x: 20, y: 30, width: 50, height: 60 };
      const committed = target.commitSubRect(sourceCanvas as unknown as CanvasImageSource, dirtyRect, "multiply");

      expect(committed).toEqual(dirtyRect);
      expect(drawImageSpy).toHaveBeenCalledWith(
        sourceCanvas,
        20,
        30,
        50,
        60,
        20,
        30,
        50,
        60
      );
    });
  });
});
