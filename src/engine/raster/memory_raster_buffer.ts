/**
 * Headless In-Memory Raster Buffer
 * Implements IRasterTarget for fast pixel blitting, clipping, sampling, and color clearing.
 * 100% pure TypeScript with zero DOM/window dependencies.
 * Direct 1:1 portability to native C++ or Rust memory buffers.
 */

import type { BlendMode, DirtyRect, IRasterTarget, PixelBufferDescriptor } from "../../types/raster";
import { compositePixelOver } from "./blend_modes";
import { compositeSubRectPixels } from "./sub_rect_blitter";

export class MemoryRasterBuffer implements IRasterTarget {
  public readonly width: number;
  public readonly height: number;
  private readonly pixelData: Uint8ClampedArray;

  /**
   * Initializes a headless RGBA8 memory raster buffer.
   *
   * @param width Buffer width in pixels (> 0)
   * @param height Buffer height in pixels (> 0)
   * @param initialPixelData Optional pre-allocated Uint8ClampedArray (must be width * height * 4)
   */
  constructor(width: number, height: number, initialPixelData?: Uint8ClampedArray) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid buffer dimensions: width=${width}, height=${height}. Both must be > 0.`);
    }

    this.width = Math.floor(width);
    this.height = Math.floor(height);

    const requiredByteLength = this.width * this.height * 4;
    if (initialPixelData) {
      if (initialPixelData.length !== requiredByteLength) {
        throw new Error(
          `initialPixelData length (${initialPixelData.length}) does not match expected size (${requiredByteLength}).`
        );
      }
      this.pixelData = initialPixelData;
    } else {
      this.pixelData = new Uint8ClampedArray(requiredByteLength);
    }
  }

  /**
   * Stamps an RGBA dab pixel mask onto the target surface centered at (targetCenterX, targetCenterY).
   * Applies boundary clipping and alpha compositing with the requested blend mode.
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

    // Top-left coordinate of the square dab in target canvas space
    const dabLeft = Math.round(targetCenterX - dabDimension * 0.5);
    const dabTop = Math.round(targetCenterY - dabDimension * 0.5);

    // Bounding box clipped against canvas boundaries
    const clipLeft = Math.max(0, dabLeft);
    const clipTop = Math.max(0, dabTop);
    const clipRight = Math.min(this.width, dabLeft + dabDimension);
    const clipBottom = Math.min(this.height, dabTop + dabDimension);

    // If completely out of bounds, no pixels are dirtied
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
        // Skip fully transparent dab pixels early
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

    return {
      x: clipLeft,
      y: clipTop,
      width: clipRight - clipLeft,
      height: clipBottom - clipTop,
    };
  }

  /**
   * Samples a rectangular patch of pixels from the target surface.
   * Regions falling outside the canvas boundary are padded with transparent black [0, 0, 0, 0].
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
   * Clears the raster target with an optional background color.
   * If fillColor is omitted, clears to fully transparent black [0, 0, 0, 0].
   */
  public clear(fillColor?: readonly [number, number, number, number]): void {
    if (!fillColor || (fillColor[0] === 0 && fillColor[1] === 0 && fillColor[2] === 0 && fillColor[3] === 0)) {
      this.pixelData.fill(0);
      return;
    }

    const [red, green, blue, alpha] = fillColor;
    const totalPixels = this.width * this.height;

    // Use 32-bit integer filling for high throughput
    const uint32View = new Uint32Array(
      this.pixelData.buffer,
      this.pixelData.byteOffset,
      totalPixels
    );
    const packedPixel32 =
      ((alpha & 0xff) << 24) |
      ((blue & 0xff) << 16) |
      ((green & 0xff) << 8) |
      (red & 0xff);

    uint32View.fill(packedPixel32);
  }

  /**
   * Retrieves the raw backing RGBA8 buffer.
   */
  public getPixelData(): Uint8ClampedArray {
    return this.pixelData;
  }

  /**
   * Commits a rectangular sub-region from a source buffer/target onto this raster target.
   * Strictly clamps bounds to document boundaries.
   *
   * @param source Source pixel buffer, descriptor, or IRasterTarget
   * @param dirtyRect Rectangular region to commit
   * @param blendMode Compositing blend mode
   * @returns DirtyRect marking the affected area
   */
  public commitSubRect(
    source: Uint8ClampedArray | PixelBufferDescriptor | IRasterTarget | unknown,
    dirtyRect: DirtyRect,
    blendMode: BlendMode = "normal"
  ): DirtyRect {
    let sourceWidth = this.width;
    let sourceHeight = this.height;
    let sourcePixels: Uint8ClampedArray | null = null;

    if (source && typeof source === "object") {
      const candidate = source as Record<string, unknown>;
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
      } else if (source instanceof Uint8ClampedArray) {
        sourcePixels = source;
      }
    } else if (source instanceof Uint8ClampedArray) {
      sourcePixels = source;
    }

    if (!sourcePixels) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return compositeSubRectPixels(
      this.pixelData,
      this.width,
      this.height,
      sourcePixels,
      sourceWidth,
      sourceHeight,
      dirtyRect,
      blendMode
    );
  }
}
