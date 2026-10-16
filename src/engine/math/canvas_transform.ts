/**
 * Canvas Viewport Transform & Gesture Mathematics
 * Pure, side-effect free mathematical routines for pan, zoom, pinch-to-zoom, and fit-to-screen.
 * Designed for 1:1 portability to C++ / Rust / WebGPU.
 */

import type { CanvasTransform } from "../../types/ui";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface TwoFingerGestureState {
  readonly initialDistance: number;
  readonly initialScale: number;
  readonly initialCentroid: Point2D;
  readonly initialPan: Point2D;
}

/**
 * Calculates Euclidean distance between two points.
 */
export function calculatePointDistance(pointA: Point2D, pointB: Point2D): number {
  const deltaX = pointB.x - pointA.x;
  const deltaY = pointB.y - pointA.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Calculates the midpoint (centroid) between two points.
 */
export function calculateMidpoint(pointA: Point2D, pointB: Point2D): Point2D {
  return {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };
}

/**
 * Computes a new canvas transform zoomed into a specific focal point (e.g. mouse cursor or pinch center).
 *
 * Mathematical derivation:
 * Let M be the focal point in viewport coordinates.
 * The canvas coordinate C under M is: C = (M - pan) / scale
 * After zooming to newScale, C must remain at M:
 * M = C * newScale + newPan
 * newPan = M - C * newScale = M - ((M - pan) / scale) * newScale = M - (M - pan) * (newScale / scale)
 *
 * @param currentTransform Current scale and pan offsets
 * @param focalPointX X coordinate of focal point in container coordinates
 * @param focalPointY Y coordinate of focal point in container coordinates
 * @param targetScale Desired new scale factor (will be clamped to [minScale, maxScale])
 * @param minScale Minimum allowable zoom (default 0.02 = 2%)
 * @param maxScale Maximum allowable zoom (default 32.0 = 3200%)
 */
export function calculateFocalZoom(
  currentTransform: CanvasTransform,
  focalPointX: number,
  focalPointY: number,
  targetScale: number,
  minScale = 0.02,
  maxScale = 32.0
): CanvasTransform {
  const clampedScale = Math.max(minScale, Math.min(maxScale, targetScale));
  if (Math.abs(currentTransform.scale) < 1e-6) {
    return { scale: clampedScale, panX: focalPointX, panY: focalPointY };
  }

  const scaleRatio = clampedScale / currentTransform.scale;
  const newPanX = focalPointX - (focalPointX - currentTransform.panX) * scaleRatio;
  const newPanY = focalPointY - (focalPointY - currentTransform.panY) * scaleRatio;

  return {
    scale: clampedScale,
    panX: newPanX,
    panY: newPanY,
  };
}

/**
 * Calculates a transform that fits and centers a document within a container viewport.
 *
 * @param containerWidth Available viewport width in pixels
 * @param containerHeight Available viewport height in pixels
 * @param documentWidth Document artboard width in pixels
 * @param documentHeight Document artboard height in pixels
 * @param paddingRatio Fraction of container to fill (e.g. 0.85 = 85% fill with 15% margins)
 */
export function calculateFitToScreen(
  containerWidth: number,
  containerHeight: number,
  documentWidth: number,
  documentHeight: number,
  paddingRatio = 0.85
): CanvasTransform {
  if (documentWidth <= 0 || documentHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1.0, panX: 0, panY: 0 };
  }

  const scaleX = (containerWidth * paddingRatio) / documentWidth;
  const scaleY = (containerHeight * paddingRatio) / documentHeight;
  const scaleFactor = Math.min(scaleX, scaleY);
  const clampedScale = Math.max(0.02, Math.min(10.0, scaleFactor));

  const centeredPanX = (containerWidth - documentWidth * clampedScale) * 0.5;
  const centeredPanY = (containerHeight - documentHeight * clampedScale) * 0.5;

  return {
    scale: clampedScale,
    panX: centeredPanX,
    panY: centeredPanY,
  };
}

/**
 * Calculates the new transform during a two-finger pinch-to-zoom and pan gesture.
 *
 * @param gesture Initial touch state captured at gesture start
 * @param touch1 Current position of first finger in container coordinates
 * @param touch2 Current position of second finger in container coordinates
 * @param minScale Minimum scale
 * @param maxScale Maximum scale
 */
export function calculateTwoFingerTransform(
  gesture: TwoFingerGestureState,
  touch1: Point2D,
  touch2: Point2D,
  minScale = 0.02,
  maxScale = 32.0
): CanvasTransform {
  const currentDistance = calculatePointDistance(touch1, touch2);
  const currentCentroid = calculateMidpoint(touch1, touch2);

  // Avoid division by zero if fingers touch
  const distanceRatio = gesture.initialDistance > 1e-4 ? currentDistance / gesture.initialDistance : 1.0;
  const targetScale = Math.max(minScale, Math.min(maxScale, gesture.initialScale * distanceRatio));

  // Compute pan by combining centroid translation and focal scaling relative to initial centroid
  const scaleRatio = targetScale / gesture.initialScale;
  const newPanX = currentCentroid.x - (gesture.initialCentroid.x - gesture.initialPan.x) * scaleRatio;
  const newPanY = currentCentroid.y - (gesture.initialCentroid.y - gesture.initialPan.y) * scaleRatio;

  return {
    scale: targetScale,
    panX: newPanX,
    panY: newPanY,
  };
}
