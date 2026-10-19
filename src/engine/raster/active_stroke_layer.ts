/**
 * High-Resolution Active Stroke Layer (Dual-Buffer Architecture)
 *
 * Implements IRasterTarget for lightweight, zero-latency stroke isolation.
 *
 * Performance Architecture for iPad 9th Gen (A13 Bionic, 3GB RAM):
 * - Target: A4 (8.7MP, 35MB/layer) and A3 (17.4MP, 70MB/layer) at 300 DPI.
 * - Drawing and navigation must run at locked 60fps without memory crashes.
 * - Never blits or clears the full 17.4MP canvas on every dab!
 *
 * Workflow:
 * 1. While stroke is active (beginStroke, extendStroke), dabs are stamped into the active stroke buffer.
 * 2. The stroke bounding box (minX, minY, maxX, maxY) tracks the accumulated dirty rectangle.
 * 3. On endStroke(), ONLY the accumulated dirty rect is committed down to the master raster target.
 * 4. The active stroke buffer is fast-cleared ONLY within the dirty rectangle using 32-bit writes,
 *    retaining zeroed state across the entire 70MB buffer without reallocations or GC pauses.
 */

import type { BlendMode, DirtyRect, IRasterTarget } from "../../types/raster";
import { compositePixelOver } from "./blend_modes";
import { PixelBufferPool } from "./pixel_buffer_pool";
import {
  calculateClampedSubRect,
  clearSubRectUint32,
  compositeSubRectPixels,
} from "./sub_rect_blitter";

export class ActiveStrokeLayer implements IRasterTarget {
  public readonly width: number;
  public readonly height: number;
  private readonly pixelData: Uint8ClampedArray;
  private readonly uint32View: Uint32Array;
  private readonly bufferPool: PixelBufferPool;

  private strokeMinX = Infinity;
  private strokeMinY = Infinity;
  private strokeMaxX = -Infinity;
  private strokeMaxY = -Infinity;
  private hasDabs = false;
  private isStrokeActive = false;
  private masterTarget: IRasterTarget | null = null;

  /**
   * Initializes the ActiveStrokeLayer with document dimensions.
   *
   * @param width Buffer width in pixels (> 0)
   * @param height Buffer height in pixels (> 0)
   * @param masterTarget Optional master raster target onto which strokes will commit
   * @param initialBuffer Optional pre-allocated Uint8ClampedArray buffer for memory pooling
   * @param bufferPool Optional PixelBufferPool instance for scratch allocations
   */
  constructor(
    width: number,
    height: number,
    masterTarget?: IRasterTarget | null,
    initialBuffer?: Uint8ClampedArray,
    bufferPool?: PixelBufferPool
  ) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid ActiveStrokeLayer dimensions: width=${width}, height=${height}. Both must be > 0.`);
    }

    this.width = Math.floor(width);
    this.height = Math.floor(height);
    this.masterTarget = masterTarget ?? null;
    this.bufferPool = bufferPool ?? new PixelBufferPool();

    const requiredByteLength = this.width * this.height * 4;
    if (initialBuffer) {
      if (initialBuffer.length < requiredByteLength) {
        throw new Error(
          `initialBuffer length (${initialBuffer.length}) is smaller than required byte length (${requiredByteLength}).`
        );
      }
      this.pixelData = initialBuffer;
    } else {
      this.pixelData = new Uint8ClampedArray(requiredByteLength);
    }

    this.uint32View = new Uint32Array(
      this.pixelData.buffer,
      this.pixelData.byteOffset,
      this.width * this.height
    );
  }

  // --- Target & State Getters/Setters ---

  public setMasterTarget(target: IRasterTarget | null): void {
    this.masterTarget = target;
  }

  public getMasterTarget(): IRasterTarget | null {
    return this.masterTarget;
  }

  public getBufferPool(): PixelBufferPool {
    return this.bufferPool;
  }

  public get isStrokeInProgress(): boolean {
    return this.isStrokeActive;
  }

  public hasDabsStamped(): boolean {
    return this.hasDabs;
  }

  /**
   * Resets internal bounding box coordinates without modifying pixel memory.
   */
  public resetBoundingBox(): void {
    this.strokeMinX = Infinity;
    this.strokeMinY = Infinity;
    this.strokeMaxX = -Infinity;
    this.strokeMaxY = -Infinity;
    this.hasDabs = false;
  }

  /**
   * Expands the accumulated stroke bounding box with a new region.
   */
  private expandBoundingBox(left: number, top: number, right: number, bottom: number): void {
    if (!this.hasDabs) {
      this.strokeMinX = left;
      this.strokeMinY = top;
      this.strokeMaxX = right;
      this.strokeMaxY = bottom;
      this.hasDabs = true;
    } else {
      this.strokeMinX = Math.min(this.strokeMinX, left);
      this.strokeMinY = Math.min(this.strokeMinY, top);
      this.strokeMaxX = Math.max(this.strokeMaxX, right);
      this.strokeMaxY = Math.max(this.strokeMaxY, bottom);
    }
  }

  /**
   * Returns the accumulated dirty rect bounding all dabs in the current stroke,
   * clamped to the document dimensions. Returns null if no dabs have been stamped.
   */
  public getAccumulatedDirtyRect(): DirtyRect | null {
    if (!this.hasDabs) {
      return null;
    }

    const clipLeft = Math.max(0, Math.floor(this.strokeMinX));
    const clipTop = Math.max(0, Math.floor(this.strokeMinY));
    const clipRight = Math.min(this.width, Math.ceil(this.strokeMaxX));
    const clipBottom = Math.min(this.height, Math.ceil(this.strokeMaxY));

    if (clipRight <= clipLeft || clipBottom <= clipTop) {
      return null;
    }

    return {
      x: clipLeft,
      y: clipTop,
      width: clipRight - clipLeft,
      height: clipBottom - clipTop,
    };
  }

  /**
   * Alias for getAccumulatedDirtyRect()
   */
  public getBoundingBox(): DirtyRect | null {
    return this.getAccumulatedDirtyRect();
  }

  // --- Stroke Lifecycle ---

  /**
   * Begins a new stroke lifecycle.
   * If a previous stroke was not finalized, its dirty region is cleared first.
   */
  public beginStroke(masterTarget?: IRasterTarget): void {
    if (this.hasDabs) {
      this.clearActiveRegion();
    }
    if (masterTarget) {
      this.masterTarget = masterTarget;
    }
    this.resetBoundingBox();
    this.isStrokeActive = true;
  }

  /**
   * Extends the active stroke lifecycle, optionally expanding the bounding box by an explicit dirty rect.
   */
  public extendStroke(dirtyRect?: DirtyRect): void {
    this.isStrokeActive = true;
    if (dirtyRect && dirtyRect.width > 0 && dirtyRect.height > 0) {
      this.expandBoundingBox(
        dirtyRect.x,
        dirtyRect.y,
        dirtyRect.x + dirtyRect.width,
        dirtyRect.y + dirtyRect.height
      );
    }
  }

  /**
   * Stamps an RGBA dab pixel mask onto the active stroke layer surface.
   * Applies boundary clipping and tracks/expands the stroke bounding box.
   *
   * @param dabPixels Interleaved RGBA8 pixel buffer of the dab stamp
   * @param targetCenterX Center X in canvas pixel coordinates
   * @param targetCenterY Center Y in canvas pixel coordinates
   * @param dabDiameter Diameter/width of the square dab stamp in pixels
   * @param blendMode Compositing blend mode (defaults to "normal")
   * @returns DirtyRect bounding the affected region in canvas space
   */
  public blitDab(
    dabPixels: Uint8ClampedArray,
    targetCenterX: number,
    targetCenterY: number,
    dabDiameter: number,
    blendMode: BlendMode = "normal"
  ): DirtyRect {
    const dabDimension = Math.max(1, Math.round(dabDiameter));
    const dabLeft = Math.round(targetCenterX - dabDimension * 0.5);
    const dabTop = Math.round(targetCenterY - dabDimension * 0.5);

    const clipLeft = Math.max(0, dabLeft);
    const clipTop = Math.max(0, dabTop);
    const clipRight = Math.min(this.width, dabLeft + dabDimension);
    const clipBottom = Math.min(this.height, dabTop + dabDimension);

    if (clipRight <= clipLeft || clipBottom <= clipTop) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    for (let targetY = clipTop; targetY < clipBottom; targetY++) {
      const dabY = targetY - dabTop;
      const targetRowStart = targetY * this.width;
      const dabRowStart = dabY * dabDimension;

      for (let targetX = clipLeft; targetX < clipRight; targetX++) {
        const dabX = targetX - dabLeft;
        const dabOffset = (dabRowStart + dabX) * 4;

        const sourceAlpha = dabPixels[dabOffset + 3];
        if (sourceAlpha === 0 && blendMode !== "erase") {
          continue;
        }

        const sourceRed = dabPixels[dabOffset];
        const sourceGreen = dabPixels[dabOffset + 1];
        const sourceBlue = dabPixels[dabOffset + 2];

        const targetOffset = (targetRowStart + targetX) * 4;
        const destinationRed = this.pixelData[targetOffset];
        const destinationGreen = this.pixelData[targetOffset + 1];
        const destinationBlue = this.pixelData[targetOffset + 2];
        const destinationAlpha = this.pixelData[targetOffset + 3];

        const [outputRed, outputGreen, outputBlue, outputAlpha] = compositePixelOver(
          destinationRed,
          destinationGreen,
          destinationBlue,
          destinationAlpha,
          sourceRed,
          sourceGreen,
          sourceBlue,
          sourceAlpha,
          blendMode
        );

        this.pixelData[targetOffset] = outputRed;
        this.pixelData[targetOffset + 1] = outputGreen;
        this.pixelData[targetOffset + 2] = outputBlue;
        this.pixelData[targetOffset + 3] = outputAlpha;
      }
    }

    this.expandBoundingBox(clipLeft, clipTop, clipRight, clipBottom);

    return {
      x: clipLeft,
      y: clipTop,
      width: clipRight - clipLeft,
      height: clipBottom - clipTop,
    };
  }

  /**
   * Finalizes the active stroke:
   * 1. Commits ONLY the accumulated dirty rect bounding box down to the master canvas/raster target.
   * 2. Clears the active stroke buffer ONLY within the accumulated dirty rect (zero-allocation fast clear).
   * 3. Resets bounding box tracking and stroke active state for the next stroke.
   *
   * @param masterTarget Target surface to commit to (defaults to configured masterTarget)
   * @param blendMode Compositing blend mode for the commit pass
   * @returns The committed DirtyRect, or null if no dabs were stamped
   */
  public endStroke(
    masterTarget?: IRasterTarget,
    blendMode: BlendMode = "normal"
  ): DirtyRect | null {
    const dirtyRect = this.getAccumulatedDirtyRect();
    const target = masterTarget ?? this.masterTarget;

    if (dirtyRect && target) {
      this.commitToTarget(target, dirtyRect, blendMode);
    }

    this.clearActiveRegion();
    this.isStrokeActive = false;

    return dirtyRect;
  }

  /**
   * Commits a sub-region (or current dirty rect) down to a master raster target without ending the stroke.
   *
   * @param target Destination raster target
   * @param subRect Specific sub-region to commit (defaults to accumulated dirty rect)
   * @param blendMode Compositing blend mode
   * @returns The committed DirtyRect, or null if no region was committed
   */
  public commitToTarget(
    target: IRasterTarget,
    subRect?: DirtyRect,
    blendMode: BlendMode = "normal"
  ): DirtyRect | null {
    const rectToCommit = subRect ?? this.getAccumulatedDirtyRect();
    if (!rectToCommit || rectToCommit.width <= 0 || rectToCommit.height <= 0) {
      return null;
    }

    // High performance path: target supports direct dirty rect commit
    if (typeof target.commitSubRect === "function") {
      return target.commitSubRect(this, rectToCommit, blendMode);
    }

    // Direct pixel buffer composite path
    if (typeof target.getPixelData === "function") {
      const targetPixels = target.getPixelData();
      return compositeSubRectPixels(
        targetPixels,
        target.width,
        target.height,
        this.pixelData,
        this.width,
        this.height,
        rectToCommit,
        blendMode
      );
    }

    return null;
  }

  /**
   * Fast, zero-allocation clearing of the active stroke region.
   * Zeroes out ONLY the rows within the accumulated bounding box via 32-bit integer filling,
   * leaving the rest of the 70MB buffer untouched.
   */
  public clearActiveRegion(): void {
    if (!this.hasDabs) {
      this.resetBoundingBox();
      return;
    }

    const dirtyRect = this.getAccumulatedDirtyRect();
    if (dirtyRect) {
      clearSubRectUint32(this.uint32View, this.width, dirtyRect);
    }

    this.resetBoundingBox();
  }

  /**
   * Clears the raster target surface.
   * If fillColor is omitted or fully transparent, performs fast dirty-rect clearing.
   */
  public clear(fillColor?: readonly [number, number, number, number]): void {
    if (!fillColor || (fillColor[0] === 0 && fillColor[1] === 0 && fillColor[2] === 0 && fillColor[3] === 0)) {
      if (this.hasDabs) {
        this.clearActiveRegion();
      } else {
        this.pixelData.fill(0);
      }
      this.resetBoundingBox();
      return;
    }

    const [red, green, blue, alpha] = fillColor;
    const packedPixel32 =
      ((alpha & 0xff) << 24) |
      ((blue & 0xff) << 16) |
      ((green & 0xff) << 8) |
      (red & 0xff);

    this.uint32View.fill(packedPixel32);
    this.resetBoundingBox();
  }

  /**
   * Samples a rectangular patch of pixels from the active stroke surface.
   * Regions outside canvas bounds are padded with transparent black [0, 0, 0, 0].
   */
  public samplePixels(
    originX: number,
    originY: number,
    patchWidth: number,
    patchHeight: number
  ): Uint8ClampedArray {
    const roundedOriginX = Math.floor(originX);
    const roundedOriginY = Math.floor(originY);
    const roundedPatchWidth = Math.max(0, Math.floor(patchWidth));
    const roundedPatchHeight = Math.max(0, Math.floor(patchHeight));

    const patchBuffer = new Uint8ClampedArray(roundedPatchWidth * roundedPatchHeight * 4);
    if (roundedPatchWidth === 0 || roundedPatchHeight === 0) {
      return patchBuffer;
    }

    const startX = Math.max(0, -roundedOriginX);
    const endX = Math.min(roundedPatchWidth, this.width - roundedOriginX);

    if (startX >= endX) {
      return patchBuffer;
    }

    for (let patchRow = 0; patchRow < roundedPatchHeight; patchRow++) {
      const targetY = roundedOriginY + patchRow;
      if (targetY < 0 || targetY >= this.height) {
        continue;
      }

      const destinationByteOffset = (patchRow * roundedPatchWidth + startX) * 4;
      const sourceByteOffset = (targetY * this.width + (roundedOriginX + startX)) * 4;
      const copyByteCount = (endX - startX) * 4;

      patchBuffer.set(
        this.pixelData.subarray(sourceByteOffset, sourceByteOffset + copyByteCount),
        destinationByteOffset
      );
    }

    return patchBuffer;
  }

  /**
   * Extracts a copy of the pixel sub-region using a pooled scratch buffer to prevent GC pauses.
   */
  public extractSubRect(rect: DirtyRect): Uint8ClampedArray {
    const clamped = calculateClampedSubRect(rect, this.width, this.height);
    const requiredBytes = clamped.width * clamped.height * 4;
    const outputBuffer = new Uint8ClampedArray(requiredBytes);

    if (requiredBytes === 0) {
      return outputBuffer;
    }

    for (let row = 0; row < clamped.height; row++) {
      const sourceRow = clamped.y + row;
      const sourceOffset = (sourceRow * this.width + clamped.x) * 4;
      const destinationOffset = row * clamped.width * 4;
      const copyBytes = clamped.width * 4;

      outputBuffer.set(
        this.pixelData.subarray(sourceOffset, sourceOffset + copyBytes),
        destinationOffset
      );
    }

    return outputBuffer;
  }

  /**
   * Retrieves the raw backing RGBA8 buffer.
   */
  public getPixelData(): Uint8ClampedArray {
    return this.pixelData;
  }

  /**
   * Commits a rectangular sub-region from another source onto this active stroke layer.
   */
  public commitSubRect(
    sourceCanvasOrBuffer: unknown,
    dirtyRect: DirtyRect,
    blendMode: BlendMode = "normal"
  ): DirtyRect {
    let sourceWidth = this.width;
    let sourceHeight = this.height;
    let sourcePixels: Uint8ClampedArray | null = null;

    if (sourceCanvasOrBuffer && typeof sourceCanvasOrBuffer === "object") {
      const candidate = sourceCanvasOrBuffer as Record<string, unknown>;
      if (typeof candidate.width === "number") {
        sourceWidth = candidate.width;
      }
      if (typeof candidate.height === "number") {
        sourceHeight = candidate.height;
      }

      if (typeof (candidate as any).getPixelData === "function") {
        sourcePixels = (candidate as unknown as IRasterTarget).getPixelData();
      } else if (candidate.pixelData instanceof Uint8ClampedArray) {
        sourcePixels = candidate.pixelData;
      } else if (sourceCanvasOrBuffer instanceof Uint8ClampedArray) {
        sourcePixels = sourceCanvasOrBuffer;
      }
    } else if (sourceCanvasOrBuffer instanceof Uint8ClampedArray) {
      sourcePixels = sourceCanvasOrBuffer;
    }

    if (!sourcePixels) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const modified = compositeSubRectPixels(
      this.pixelData,
      this.width,
      this.height,
      sourcePixels,
      sourceWidth,
      sourceHeight,
      dirtyRect,
      blendMode
    );

    if (modified.width > 0 && modified.height > 0) {
      this.expandBoundingBox(
        modified.x,
        modified.y,
        modified.x + modified.width,
        modified.y + modified.height
      );
    }

    return modified;
  }
}

export { PixelBufferPool } from "./pixel_buffer_pool";
