/**
 * Raster Target & Pixel Buffer Contracts
 * Pure, headless interfaces for pixel manipulation, dab blitting, and color sampling.
 * Can be implemented by MemoryRasterBuffer (Node/Vitest tests) or Canvas2dRasterTarget/WebGPU.
 */

/**
 * A rectangular bounding box marking pixels modified by an operation.
 * Used for targeted dirty-region updates and canvas blitting.
 */
export interface DirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Standard pixel buffer descriptor for RGBA8 interleaved buffers.
 */
export interface PixelBufferDescriptor {
  readonly pixelData: Uint8ClampedArray;  // Interleaved RGBA: [R0, G0, B0, A0, R1, ...]
  readonly width: number;                 // Buffer width in pixels
  readonly height: number;                // Buffer height in pixels
  readonly bytesPerPixel: 4;              // Always 4 for RGBA8
}

/**
 * Standard compositing blend modes supported by the raster engine.
 * Mirrors Krita and Photoshop blend modes.
 */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "colorDodge"
  | "colorBurn"
  | "hardLight"
  | "softLight"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "erase";

/**
 * The raster target contract: the abstract 2D surface into which the brush engine stamps dabs.
 * The core brush engine NEVER touches the DOM or GPU directly — only through this interface.
 */
export interface IRasterTarget {
  readonly width: number;
  readonly height: number;

  /**
   * Stamps an RGBA dab pixel mask onto the target surface centered at (targetCenterX, targetCenterY).
   * @returns DirtyRect bounding the affected pixel region.
   */
  blitDab(
    dabPixels: Uint8ClampedArray,
    targetCenterX: number,
    targetCenterY: number,
    dabDiameter: number,
    blendMode?: BlendMode
  ): DirtyRect;

  /**
   * Samples a rectangular patch of pixels from the target surface.
   * Required by the Color Smudge engine and eyedropper color picking.
   */
  samplePixels(
    x: number,
    y: number,
    width: number,
    height: number
  ): Uint8ClampedArray;

  /**
   * Clears the raster target with an optional background color.
   */
  clear(fillColor?: readonly [number, number, number, number]): void;

  /**
   * Retrieves the raw backing RGBA8 buffer.
   */
  getPixelData(): Uint8ClampedArray;
}
