/**
 * Sub-Rectangle Raster Compositor & Blitter
 * Pure, headless functions for clamping bounding boxes, compositing sub-rectangles of pixels,
 * and high-throughput 32-bit clearing of dirty stroke areas.
 * Direct 1:1 portability to native C++ or Rust memory buffers.
 */

import type { BlendMode, DirtyRect } from "../../types/raster";
import { compositePixelOver } from "./blend_modes";

/**
 * Calculates a DirtyRect strictly clamped to positive boundaries [0, maxWidth) and [0, maxHeight).
 * If the rectangle lies completely outside boundaries or has non-positive area, returns an empty rect.
 *
 * @param requestedRect The source rectangular region
 * @param maxWidth The maximum width constraint
 * @param maxHeight The maximum height constraint
 */
export function calculateClampedSubRect(
  requestedRect: DirtyRect,
  maxWidth: number,
  maxHeight: number
): DirtyRect {
  const clipLeft = Math.max(0, Math.floor(requestedRect.x));
  const clipTop = Math.max(0, Math.floor(requestedRect.y));
  const clipRight = Math.min(maxWidth, Math.ceil(requestedRect.x + requestedRect.width));
  const clipBottom = Math.min(maxHeight, Math.ceil(requestedRect.y + requestedRect.height));

  if (clipRight <= clipLeft || clipBottom <= clipTop) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: clipLeft,
    y: clipTop,
    width: clipRight - clipLeft,
    height: clipBottom - clipTop,
  };
}

/**
 * Composites a rectangular sub-region of pixels from a source buffer into a destination buffer.
 * Performs per-pixel alpha blending with the requested blend mode.
 * Skips fully transparent source pixels early for maximum throughput.
 *
 * @param destinationPixels Backing RGBA8 destination buffer
 * @param destinationWidth Destination width in pixels
 * @param destinationHeight Destination height in pixels
 * @param sourcePixels Backing RGBA8 source buffer
 * @param sourceWidth Source width in pixels
 * @param sourceHeight Source height in pixels
 * @param subRect The bounding box region to composite
 * @param blendMode Compositing blend mode (defaults to "normal")
 * @returns The clamped DirtyRect that was actually modified
 */
export function compositeSubRectPixels(
  destinationPixels: Uint8ClampedArray,
  destinationWidth: number,
  destinationHeight: number,
  sourcePixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  subRect: DirtyRect,
  blendMode: BlendMode = "normal"
): DirtyRect {
  const clampedRect = calculateClampedSubRect(
    subRect,
    Math.min(destinationWidth, sourceWidth),
    Math.min(destinationHeight, sourceHeight)
  );

  if (clampedRect.width === 0 || clampedRect.height === 0) {
    return clampedRect;
  }

  const clipLeft = clampedRect.x;
  const clipTop = clampedRect.y;
  const clipRight = clipLeft + clampedRect.width;
  const clipBottom = clipTop + clampedRect.height;

  for (let targetY = clipTop; targetY < clipBottom; targetY++) {
    const destinationRowStart = targetY * destinationWidth;
    const sourceRowStart = targetY * sourceWidth;

    for (let targetX = clipLeft; targetX < clipRight; targetX++) {
      const sourceOffset = (sourceRowStart + targetX) * 4;
      const sourceAlpha = sourcePixels[sourceOffset + 3];

      // Fast-path: transparent source pixels do not alter destination unless erasing
      if (sourceAlpha === 0 && blendMode !== "erase") {
        continue;
      }

      const destinationOffset = (destinationRowStart + targetX) * 4;
      const [blendedR, blendedG, blendedB, blendedA] = compositePixelOver(
        destinationPixels[destinationOffset],
        destinationPixels[destinationOffset + 1],
        destinationPixels[destinationOffset + 2],
        destinationPixels[destinationOffset + 3],
        sourcePixels[sourceOffset],
        sourcePixels[sourceOffset + 1],
        sourcePixels[sourceOffset + 2],
        sourceAlpha,
        blendMode
      );

      destinationPixels[destinationOffset] = blendedR;
      destinationPixels[destinationOffset + 1] = blendedG;
      destinationPixels[destinationOffset + 2] = blendedB;
      destinationPixels[destinationOffset + 3] = blendedA;
    }
  }

  return clampedRect;
}

/**
 * High-throughput 32-bit zero clearing of a sub-rectangle region in an RGBA buffer.
 * Instead of clearing all 70MB (17.4MP for A3 @ 300 DPI), this clears only the rows
 * within the accumulated stroke dirty rect.
 *
 * @param uint32View 32-bit integer typed view over the backing pixel buffer
 * @param bufferWidth Total width of the buffer in pixels
 * @param rect Dirty rectangular region to zero out
 */
export function clearSubRectUint32(
  uint32View: Uint32Array,
  bufferWidth: number,
  rect: DirtyRect
): void {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const startX = rect.x;
  const clearWidth = rect.width;
  const startY = rect.y;
  const endY = rect.y + rect.height;

  for (let currentY = startY; currentY < endY; currentY++) {
    const rowOffset = currentY * bufferWidth + startX;
    uint32View.fill(0, rowOffset, rowOffset + clearWidth);
  }
}
