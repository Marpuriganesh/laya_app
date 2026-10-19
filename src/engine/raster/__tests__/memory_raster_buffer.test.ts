import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRasterBuffer } from "../memory_raster_buffer";
import { Canvas2dRasterTarget, mapBlendModeToCompositeOperation } from "../canvas2d_raster_target";
import { compositePixelOver, blendPixelColor } from "../blend_modes";

describe("MemoryRasterBuffer", () => {
  let buffer: MemoryRasterBuffer;

  beforeEach(() => {
    buffer = new MemoryRasterBuffer(100, 100);
  });

  describe("Buffer Initialization", () => {
    it("creates a buffer with correct width, height, and zeroed pixel data", () => {
      expect(buffer.width).toBe(100);
      expect(buffer.height).toBe(100);

      const pixels = buffer.getPixelData();
      expect(pixels.length).toBe(100 * 100 * 4);
      expect(pixels.every((byte) => byte === 0)).toBe(true);
    });

    it("accepts pre-allocated Uint8ClampedArray", () => {
      const customData = new Uint8ClampedArray(10 * 10 * 4);
      customData[0] = 255;
      const customBuffer = new MemoryRasterBuffer(10, 10, customData);
      expect(customBuffer.getPixelData()[0]).toBe(255);
    });

    it("throws an error for non-positive dimensions", () => {
      expect(() => new MemoryRasterBuffer(0, 50)).toThrow();
      expect(() => new MemoryRasterBuffer(50, -10)).toThrow();
    });

    it("throws an error if custom buffer size does not match dimensions", () => {
      const invalidData = new Uint8ClampedArray(50);
      expect(() => new MemoryRasterBuffer(10, 10, invalidData)).toThrow();
    });
  });

  describe("Clear Functionality", () => {
    it("clears to transparent black by default", () => {
      buffer.clear([255, 0, 0, 255]);
      expect(buffer.getPixelData()[0]).toBe(255);

      buffer.clear();
      expect(buffer.getPixelData().every((byte) => byte === 0)).toBe(true);
    });

    it("clears to a specific fill color", () => {
      buffer.clear([255, 128, 64, 255]);
      const pixels = buffer.getPixelData();

      // Check first pixel
      expect(pixels[0]).toBe(255);
      expect(pixels[1]).toBe(128);
      expect(pixels[2]).toBe(64);
      expect(pixels[3]).toBe(255);

      // Check last pixel
      const lastIndex = pixels.length - 4;
      expect(pixels[lastIndex]).toBe(255);
      expect(pixels[lastIndex + 1]).toBe(128);
      expect(pixels[lastIndex + 2]).toBe(64);
      expect(pixels[lastIndex + 3]).toBe(255);
    });
  });

  describe("Sample Pixels", () => {
    beforeEach(() => {
      buffer.clear([100, 150, 200, 255]);
    });

    it("samples an in-bounds patch correctly", () => {
      const patch = buffer.samplePixels(10, 10, 4, 4);
      expect(patch.length).toBe(4 * 4 * 4);
      expect(patch[0]).toBe(100);
      expect(patch[1]).toBe(150);
      expect(patch[2]).toBe(200);
      expect(patch[3]).toBe(255);
    });

    it("pads out-of-bounds regions with zeros when sampled across top-left edge", () => {
      const patch = buffer.samplePixels(-2, -2, 4, 4);
      expect(patch.length).toBe(4 * 4 * 4);

      // Top-left pixel of patch (-2, -2) is outside canvas -> should be 0
      expect(patch[0]).toBe(0);
      expect(patch[1]).toBe(0);
      expect(patch[2]).toBe(0);
      expect(patch[3]).toBe(0);

      // Pixel at offset (2, 2) in patch corresponds to (0, 0) in canvas -> should be [100, 150, 200, 255]
      const inBoundsOffset = (2 * 4 + 2) * 4;
      expect(patch[inBoundsOffset]).toBe(100);
      expect(patch[inBoundsOffset + 1]).toBe(150);
      expect(patch[inBoundsOffset + 2]).toBe(200);
      expect(patch[inBoundsOffset + 3]).toBe(255);
    });

    it("handles zero-size patch requests", () => {
      const patch = buffer.samplePixels(0, 0, 0, 0);
      expect(patch.length).toBe(0);
    });
  });

  describe("Dab Blitting & Dirty Rect Calculation", () => {
    it("blits a solid dab onto transparent canvas", () => {
      const dabSize = 4;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      // Fill dab with solid red
      for (let i = 0; i < dabPixels.length; i += 4) {
        dabPixels[i] = 255;
        dabPixels[i + 1] = 0;
        dabPixels[i + 2] = 0;
        dabPixels[i + 3] = 255;
      }

      const dirtyRect = buffer.blitDab(dabPixels, 50, 50, dabSize);

      expect(dirtyRect).toEqual({
        x: 48,
        y: 48,
        width: 4,
        height: 4,
      });

      // Sample center of dab
      const sampled = buffer.samplePixels(48, 48, 4, 4);
      expect(sampled[0]).toBe(255);
      expect(sampled[1]).toBe(0);
      expect(sampled[2]).toBe(0);
      expect(sampled[3]).toBe(255);
    });

    it("clips dab intersecting top-left boundary", () => {
      const dabSize = 10;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      dabPixels.fill(255);

      // Center dab at (2, 2): bounds [2-5, 2-5] -> [-3, -3] to [7, 7]
      const dirtyRect = buffer.blitDab(dabPixels, 2, 2, dabSize);

      expect(dirtyRect.x).toBe(0);
      expect(dirtyRect.y).toBe(0);
      expect(dirtyRect.width).toBe(7);
      expect(dirtyRect.height).toBe(7);
    });

    it("clips dab intersecting bottom-right boundary", () => {
      const dabSize = 10;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      dabPixels.fill(255);

      // Center dab at (98, 98): bounds [93, 93] to [103, 103] clipped to 100
      const dirtyRect = buffer.blitDab(dabPixels, 98, 98, dabSize);

      expect(dirtyRect.x).toBe(93);
      expect(dirtyRect.y).toBe(93);
      expect(dirtyRect.width).toBe(7);
      expect(dirtyRect.height).toBe(7);
    });

    it("returns zero dirty rect when dab is completely out of bounds", () => {
      const dabSize = 10;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      dabPixels.fill(255);

      const dirtyRect = buffer.blitDab(dabPixels, -50, -50, dabSize);
      expect(dirtyRect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
  });

  describe("Alpha Blending & Compositing", () => {
    it("blits semi-transparent red over opaque white with correct Porter-Duff math", () => {
      buffer.clear([255, 255, 255, 255]);

      const dabSize = 2;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      // Red at 50% opacity (alpha = 128)
      for (let i = 0; i < dabPixels.length; i += 4) {
        dabPixels[i] = 255;
        dabPixels[i + 1] = 0;
        dabPixels[i + 2] = 0;
        dabPixels[i + 3] = 128;
      }

      buffer.blitDab(dabPixels, 10, 10, dabSize);
      const sampled = buffer.samplePixels(9, 9, 1, 1);

      // Result should be pink (red mixed with white)
      expect(sampled[0]).toBe(255);
      expect(sampled[1]).toBeCloseTo(127, -1);
      expect(sampled[2]).toBeCloseTo(127, -1);
      expect(sampled[3]).toBe(255);
    });

    it("erases destination pixels when blendMode is erase", () => {
      buffer.clear([0, 0, 255, 255]); // Opaque blue

      const dabSize = 2;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      // Eraser with 100% alpha
      for (let i = 0; i < dabPixels.length; i += 4) {
        dabPixels[i + 3] = 255;
      }

      buffer.blitDab(dabPixels, 20, 20, dabSize, "erase");
      const sampled = buffer.samplePixels(19, 19, 1, 1);

      // Alpha should be fully erased to 0
      expect(sampled[3]).toBe(0);
    });

    it("supports Multiply blend mode", () => {
      buffer.clear([255, 255, 255, 255]); // White

      const dabSize = 2;
      const dabPixels = new Uint8ClampedArray(dabSize * dabSize * 4);
      // 50% gray: 128, 128, 128, 255
      for (let i = 0; i < dabPixels.length; i += 4) {
        dabPixels[i] = 128;
        dabPixels[i + 1] = 128;
        dabPixels[i + 2] = 128;
        dabPixels[i + 3] = 255;
      }

      buffer.blitDab(dabPixels, 5, 5, dabSize, "multiply");
      const sampled = buffer.samplePixels(4, 4, 1, 1);

      // White * Gray = Gray (approx 128)
      expect(sampled[0]).toBeCloseTo(128, -1);
      expect(sampled[1]).toBeCloseTo(128, -1);
      expect(sampled[2]).toBeCloseTo(128, -1);
    });
  });

  describe("Blend Mode Math Formulas", () => {
    it("evaluates screen blend mode correctly", () => {
      const [r, g, b] = blendPixelColor(128, 128, 128, 128, 128, 128, "screen");
      // Screen: 255 - (255-128)*(255-128)/255 = 255 - 127*127/255 = 255 - 63 = 192
      expect(r).toBeCloseTo(192, -1);
      expect(g).toBeCloseTo(192, -1);
      expect(b).toBeCloseTo(192, -1);
    });

    it("evaluates difference blend mode correctly", () => {
      const [r, g, b] = blendPixelColor(200, 150, 100, 50, 150, 200, "difference");
      expect(r).toBe(150);
      expect(g).toBe(0);
      expect(b).toBe(100);
    });

    it("composites with transparent source without mutation", () => {
      const result = compositePixelOver(100, 150, 200, 255, 50, 50, 50, 0);
      expect(result).toEqual([100, 150, 200, 255]);
    });
  });

  describe("Canvas2dRasterTarget", () => {
    it("maps blend modes to valid GlobalCompositeOperation strings", () => {
      expect(mapBlendModeToCompositeOperation("normal")).toBe("source-over");
      expect(mapBlendModeToCompositeOperation("multiply")).toBe("multiply");
      expect(mapBlendModeToCompositeOperation("screen")).toBe("screen");
      expect(mapBlendModeToCompositeOperation("erase")).toBe("destination-out");
    });

    it("wraps a canvas 2D rendering context", () => {
      const mockCanvas = { width: 100, height: 100 };
      const mockContext = {
        canvas: mockCanvas,
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        fillRect: () => {},
        fillStyle: "",
        globalCompositeOperation: "source-over" as GlobalCompositeOperation,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        } as ImageData),
        putImageData: () => {},
        drawImage: () => {},
      };

      const target = new Canvas2dRasterTarget(mockContext as unknown as CanvasRenderingContext2D);
      expect(target.width).toBe(100);
      expect(target.height).toBe(100);

      const dabPixels = new Uint8ClampedArray(4 * 4 * 4);
      const rect = target.blitDab(dabPixels, 50, 50, 4);
      expect(rect.width).toBe(4);
      expect(rect.height).toBe(4);
    });
  });
});
