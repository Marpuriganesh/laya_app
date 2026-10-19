/**
 * Canvas 2D Raster Target
 * Implements IRasterTarget wrapping HTMLCanvasElement or OffscreenCanvas 2D context.
 * Provides high-performance hardware-accelerated screen blitting and compositing.
 */

import type { BlendMode, DirtyRect, IRasterTarget, PixelBufferDescriptor } from "../../types/raster";
import { compositePixelOver } from "./blend_modes";
import { PixelBufferPool } from "./pixel_buffer_pool";

export type Canvas2dTargetInput =
  | HTMLCanvasElement
  | OffscreenCanvas
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/**
 * Maps engine BlendMode identifiers to standard HTML Canvas 2D GlobalCompositeOperation strings.
 */
export function mapBlendModeToCompositeOperation(blendMode: BlendMode = "normal"): GlobalCompositeOperation {
  switch (blendMode) {
    case "normal":
      return "source-over";
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    case "colorDodge":
      return "color-dodge";
    case "colorBurn":
      return "color-burn";
    case "hardLight":
      return "hard-light";
    case "softLight":
      return "soft-light";
    case "difference":
      return "difference";
    case "exclusion":
      return "exclusion";
    case "hue":
      return "hue";
    case "saturation":
      return "saturation";
    case "color":
      return "color";
    case "luminosity":
      return "luminosity";
    case "erase":
      return "destination-out";
    default:
      return "source-over";
  }
}

export class Canvas2dRasterTarget implements IRasterTarget {
  private readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly bufferPool: PixelBufferPool;
  private scratchCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private scratchContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  constructor(canvasOrContext: Canvas2dTargetInput) {
    this.bufferPool = new PixelBufferPool();
    if ("getContext" in canvasOrContext && typeof canvasOrContext.getContext === "function") {
      this.canvas = canvasOrContext;
      const renderingContext = canvasOrContext.getContext("2d", { willReadFrequently: true });
      if (!renderingContext) {
        throw new Error("Failed to acquire 2D rendering context from canvas.");
      }
      this.context = renderingContext as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    } else if ("canvas" in canvasOrContext) {
      this.context = canvasOrContext;
      this.canvas = canvasOrContext.canvas as HTMLCanvasElement | OffscreenCanvas;
    } else {
      throw new Error("Invalid canvas or 2D rendering context provided to Canvas2dRasterTarget.");
    }

    this.initializeScratchCanvas();
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
  }

  public get width(): number {
    return this.canvas.width;
  }

  public get height(): number {
    return this.canvas.height;
  }

  /**
   * Initializes a reusable scratch offscreen canvas for blitting dab masks via drawImage.
   */
  private initializeScratchCanvas(): void {
    try {
      if (typeof OffscreenCanvas !== "undefined") {
        this.scratchCanvas = new OffscreenCanvas(64, 64);
        this.scratchContext = this.scratchCanvas.getContext("2d");
      } else if (typeof document !== "undefined" && typeof document.createElement === "function") {
        this.scratchCanvas = document.createElement("canvas");
        this.scratchCanvas.width = 64;
        this.scratchCanvas.height = 64;
        this.scratchContext = this.scratchCanvas.getContext("2d");
      }
    } catch {
      this.scratchCanvas = null;
      this.scratchContext = null;
    }
  }

  /**
   * Stamps an RGBA dab pixel mask onto the target surface centered at (targetCenterX, targetCenterY).
   * Preserves floating-point coordinates for hardware-accelerated sub-pixel anti-aliasing.
   */
  public blitDab(
    dabPixels: Uint8ClampedArray,
    targetCenterX: number,
    targetCenterY: number,
    dabDiameter: number,
    blendMode: BlendMode = "normal"
  ): DirtyRect {
    const dabDimension = Math.max(1, Math.round(dabDiameter));
    // Sub-pixel floating-point offset: allows GPU bilinear filtering to anti-alias edges along curves
    const dabLeft = targetCenterX - dabDimension * 0.5;
    const dabTop = targetCenterY - dabDimension * 0.5;

    // Conservative integer bounds for clipping and dirty rect tracking
    const clipLeft = Math.max(0, Math.floor(dabLeft));
    const clipTop = Math.max(0, Math.floor(dabTop));
    const clipRight = Math.min(this.width, Math.ceil(dabLeft + dabDimension));
    const clipBottom = Math.min(this.height, Math.ceil(dabTop + dabDimension));

    if (clipRight <= clipLeft || clipBottom <= clipTop) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // High performance path: drawImage via scratch canvas
    if (this.scratchContext && this.scratchCanvas && typeof ImageData !== "undefined") {
      if (this.scratchCanvas.width < dabDimension || this.scratchCanvas.height < dabDimension) {
        const nextSize = Math.max(dabDimension, (this.scratchCanvas.width || 64) * 2);
        this.scratchCanvas.width = nextSize;
        this.scratchCanvas.height = nextSize;
      }

      const clampedBuffer = new Uint8ClampedArray(
        dabPixels.buffer as ArrayBuffer,
        dabPixels.byteOffset,
        dabPixels.byteLength
      );
      const dabImageData = new ImageData(clampedBuffer, dabDimension, dabDimension);
      this.scratchContext.putImageData(dabImageData, 0, 0);

      this.context.save();
      this.context.imageSmoothingEnabled = true;
      this.context.imageSmoothingQuality = "high";
      this.context.globalCompositeOperation = mapBlendModeToCompositeOperation(blendMode);
      this.context.drawImage(
        this.scratchCanvas as CanvasImageSource,
        0,
        0,
        dabDimension,
        dabDimension,
        dabLeft,
        dabTop,
        dabDimension,
        dabDimension
      );
      this.context.restore();
    } else {
      // Fallback path: pixel-by-pixel software blending using compositePixelOver
      this.fallbackSoftwareBlit(
        dabPixels,
        dabDimension,
        Math.floor(dabLeft),
        Math.floor(dabTop),
        clipLeft,
        clipTop,
        clipRight,
        clipBottom,
        blendMode
      );
    }

    return {
      x: clipLeft,
      y: clipTop,
      width: clipRight - clipLeft,
      height: clipBottom - clipTop,
    };
  }

  /**
   * Software pixel blending fallback for environments lacking drawImage or ImageData scratch canvas.
   */
  private fallbackSoftwareBlit(
    dabPixels: Uint8ClampedArray,
    dabDimension: number,
    dabLeft: number,
    dabTop: number,
    clipLeft: number,
    clipTop: number,
    clipRight: number,
    clipBottom: number,
    blendMode: BlendMode
  ): void {
    const dirtyWidth = clipRight - clipLeft;
    const dirtyHeight = clipBottom - clipTop;
    const targetImageData = this.context.getImageData(clipLeft, clipTop, dirtyWidth, dirtyHeight);
    const targetPixels = targetImageData.data;

    for (let targetY = clipTop; targetY < clipBottom; targetY++) {
      const dabY = targetY - dabTop;
      const targetLocalRow = (targetY - clipTop) * dirtyWidth;
      const dabRowStart = dabY * dabDimension;

      for (let targetX = clipLeft; targetX < clipRight; targetX++) {
        const dabX = targetX - dabLeft;
        const dabOffset = (dabRowStart + dabX) * 4;
        const sourceAlpha = dabPixels[dabOffset + 3];

        if (sourceAlpha === 0 && blendMode !== "erase") {
          continue;
        }

        const targetOffset = (targetLocalRow + (targetX - clipLeft)) * 4;
        const [outputR, outputG, outputB, outputA] = compositePixelOver(
          targetPixels[targetOffset],
          targetPixels[targetOffset + 1],
          targetPixels[targetOffset + 2],
          targetPixels[targetOffset + 3],
          dabPixels[dabOffset],
          dabPixels[dabOffset + 1],
          dabPixels[dabOffset + 2],
          sourceAlpha,
          blendMode
        );

        targetPixels[targetOffset] = outputR;
        targetPixels[targetOffset + 1] = outputG;
        targetPixels[targetOffset + 2] = outputB;
        targetPixels[targetOffset + 3] = outputA;
      }
    }

    this.context.putImageData(targetImageData, clipLeft, clipTop);
  }

  /**
   * Samples a rectangular patch of pixels from the canvas surface.
   */
  public samplePixels(
    originX: number,
    originY: number,
    patchWidth: number,
    patchHeight: number
  ): Uint8ClampedArray {
    const roundedOriginX = Math.floor(originX);
    const roundedOriginY = Math.floor(originY);
    const roundedPatchWidth = Math.max(1, Math.floor(patchWidth));
    const roundedPatchHeight = Math.max(1, Math.floor(patchHeight));

    const imageData = this.context.getImageData(
      roundedOriginX,
      roundedOriginY,
      roundedPatchWidth,
      roundedPatchHeight
    );
    return imageData.data;
  }

  /**
   * Clears the raster target with an optional background color.
   */
  public clear(fillColor?: readonly [number, number, number, number]): void {
    this.context.save();
    this.context.clearRect(0, 0, this.width, this.height);

    if (fillColor && fillColor[3] > 0) {
      const [red, green, blue, alpha] = fillColor;
      const normalizedAlpha = alpha / 255;
      this.context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
      this.context.fillRect(0, 0, this.width, this.height);
    }

    this.context.restore();
  }

  /**
   * Retrieves the raw backing RGBA8 buffer.
   */
  public getPixelData(): Uint8ClampedArray {
    return this.context.getImageData(0, 0, this.width, this.height).data;
  }

  /**
   * Commits a rectangular sub-region from a source buffer, canvas, or raster target onto this canvas surface.
   * Strictly clamps clipping bounds to document dimensions so out-of-bounds regions are never blitted.
   *
   * @param sourceCanvasOrBuffer Source pixel buffer, canvas element, or IRasterTarget
   * @param dirtyRect Rectangular sub-region to commit
   * @param blendMode Compositing blend mode (defaults to "normal")
   * @returns DirtyRect marking the affected area on this canvas
   */
  public commitSubRect(
    sourceCanvasOrBuffer: Canvas2dTargetInput | CanvasImageSource | Uint8ClampedArray | PixelBufferDescriptor | IRasterTarget | unknown,
    dirtyRect: DirtyRect,
    blendMode: BlendMode = "normal"
  ): DirtyRect {
    let sourceWidth = this.width;
    let sourceHeight = this.height;
    let isCanvasSource = false;
    let canvasSource: CanvasImageSource | null = null;
    let sourcePixels: Uint8ClampedArray | null = null;

    if (sourceCanvasOrBuffer && typeof sourceCanvasOrBuffer === "object") {
      const candidate = sourceCanvasOrBuffer as Record<string, unknown>;
      if (typeof candidate.width === "number") {
        sourceWidth = candidate.width;
      }
      if (typeof candidate.height === "number") {
        sourceHeight = candidate.height;
      }

      // Check if candidate is an HTML/Offscreen Canvas or ImageBitmap
      if (
        typeof (candidate as any).getContext === "function" ||
        (typeof HTMLCanvasElement !== "undefined" && candidate instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== "undefined" && candidate instanceof OffscreenCanvas) ||
        (typeof ImageBitmap !== "undefined" && candidate instanceof ImageBitmap)
      ) {
        isCanvasSource = true;
        canvasSource = candidate as unknown as CanvasImageSource;
      } else if (typeof (candidate as any).getPixelData === "function") {
        sourcePixels = (candidate as unknown as IRasterTarget).getPixelData();
      } else if (candidate.pixelData instanceof Uint8ClampedArray) {
        sourcePixels = candidate.pixelData;
      } else if (candidate.data instanceof Uint8ClampedArray) {
        sourcePixels = candidate.data;
      } else if (sourceCanvasOrBuffer instanceof Uint8ClampedArray) {
        sourcePixels = sourceCanvasOrBuffer;
      }
    } else if (sourceCanvasOrBuffer instanceof Uint8ClampedArray) {
      sourcePixels = sourceCanvasOrBuffer;
    }

    const clipLeft = Math.max(0, Math.floor(dirtyRect.x));
    const clipTop = Math.max(0, Math.floor(dirtyRect.y));
    const clipRight = Math.min(this.width, Math.min(sourceWidth, Math.ceil(dirtyRect.x + dirtyRect.width)));
    const clipBottom = Math.min(this.height, Math.min(sourceHeight, Math.ceil(dirtyRect.y + dirtyRect.height)));
    const dirtyWidth = clipRight - clipLeft;
    const dirtyHeight = clipBottom - clipTop;

    if (dirtyWidth <= 0 || dirtyHeight <= 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Path 1: Hardware-accelerated drawImage directly from source canvas/bitmap
    if (isCanvasSource && canvasSource) {
      this.context.save();
      this.context.globalCompositeOperation = mapBlendModeToCompositeOperation(blendMode);
      this.context.drawImage(
        canvasSource,
        clipLeft,
        clipTop,
        dirtyWidth,
        dirtyHeight,
        clipLeft,
        clipTop,
        dirtyWidth,
        dirtyHeight
      );
      this.context.restore();

      return {
        x: clipLeft,
        y: clipTop,
        width: dirtyWidth,
        height: dirtyHeight,
      };
    }

    // Path 2: Pixel buffer source
    if (sourcePixels) {
      if (this.scratchContext && this.scratchCanvas && typeof ImageData !== "undefined") {
        if (this.scratchCanvas.width < dirtyWidth || this.scratchCanvas.height < dirtyHeight) {
          const nextDimension = Math.max(dirtyWidth, dirtyHeight, (this.scratchCanvas.width || 64) * 2);
          this.scratchCanvas.width = nextDimension;
          this.scratchCanvas.height = nextDimension;
        }

        const requiredBytes = dirtyWidth * dirtyHeight * 4;
        const scratchBuffer = this.bufferPool.acquire(requiredBytes);

        // Copy sub-rect rows into scratch buffer without full-screen allocation
        for (let y = clipTop; y < clipBottom; y++) {
          const srcRowOffset = (y * sourceWidth + clipLeft) * 4;
          const dstRowOffset = ((y - clipTop) * dirtyWidth) * 4;
          const rowByteCount = dirtyWidth * 4;
          scratchBuffer.set(
            sourcePixels.subarray(srcRowOffset, srcRowOffset + rowByteCount),
            dstRowOffset
          );
        }

        const subImageData = new ImageData(
          new Uint8ClampedArray(scratchBuffer.buffer as ArrayBuffer, scratchBuffer.byteOffset, requiredBytes),
          dirtyWidth,
          dirtyHeight
        );
        this.scratchContext.putImageData(subImageData, 0, 0);

        this.context.save();
        this.context.globalCompositeOperation = mapBlendModeToCompositeOperation(blendMode);
        this.context.drawImage(
          this.scratchCanvas as CanvasImageSource,
          0,
          0,
          dirtyWidth,
          dirtyHeight,
          clipLeft,
          clipTop,
          dirtyWidth,
          dirtyHeight
        );
        this.context.restore();

        this.bufferPool.release(scratchBuffer);
      } else {
        // Fallback software path
        this.fallbackSoftwareCommit(
          sourcePixels,
          sourceWidth,
          clipLeft,
          clipTop,
          clipRight,
          clipBottom,
          blendMode
        );
      }
    }

    return {
      x: clipLeft,
      y: clipTop,
      width: dirtyWidth,
      height: dirtyHeight,
    };
  }

  /**
   * Fallback software pixel blending for dirty rect commits when scratch canvas/ImageData is unavailable.
   */
  private fallbackSoftwareCommit(
    sourcePixels: Uint8ClampedArray,
    sourceWidth: number,
    clipLeft: number,
    clipTop: number,
    clipRight: number,
    clipBottom: number,
    blendMode: BlendMode
  ): void {
    const dirtyWidth = clipRight - clipLeft;
    const dirtyHeight = clipBottom - clipTop;
    const targetImageData = this.context.getImageData(clipLeft, clipTop, dirtyWidth, dirtyHeight);
    const targetPixels = targetImageData.data;

    for (let targetY = clipTop; targetY < clipBottom; targetY++) {
      const sourceRowStart = targetY * sourceWidth;
      const targetLocalRow = (targetY - clipTop) * dirtyWidth;

      for (let targetX = clipLeft; targetX < clipRight; targetX++) {
        const sourceOffset = (sourceRowStart + targetX) * 4;
        const sourceAlpha = sourcePixels[sourceOffset + 3];

        if (sourceAlpha === 0 && blendMode !== "erase") {
          continue;
        }

        const targetOffset = (targetLocalRow + (targetX - clipLeft)) * 4;
        const [outputR, outputG, outputB, outputA] = compositePixelOver(
          targetPixels[targetOffset],
          targetPixels[targetOffset + 1],
          targetPixels[targetOffset + 2],
          targetPixels[targetOffset + 3],
          sourcePixels[sourceOffset],
          sourcePixels[sourceOffset + 1],
          sourcePixels[sourceOffset + 2],
          sourceAlpha,
          blendMode
        );

        targetPixels[targetOffset] = outputR;
        targetPixels[targetOffset + 1] = outputG;
        targetPixels[targetOffset + 2] = outputB;
        targetPixels[targetOffset + 3] = outputA;
      }
    }

    this.context.putImageData(targetImageData, clipLeft, clipTop);
  }
}
