/**
 * 2D Vector & Spline Math Primitives
 * 100% pure, side-effect free algorithmic functions.
 * Designed for 1:1 direct translation to C++ / Rust / WGSL.
 */

import type { Point2D } from "../../types/stroke";

/**
 * Calculates Euclidean distance between two 2D points.
 * Formula: sqrt((bx - ax)^2 + (by - ay)^2)
 */
export function calculateDistance(pointA: Point2D, pointB: Point2D): number {
  const deltaX = pointB.x - pointA.x;
  const deltaY = pointB.y - pointA.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Calculates squared Euclidean distance between two 2D points (avoids expensive sqrt).
 * Formula: (bx - ax)^2 + (by - ay)^2
 */
export function calculateDistanceSquared(pointA: Point2D, pointB: Point2D): number {
  const deltaX = pointB.x - pointA.x;
  const deltaY = pointB.y - pointA.y;
  return deltaX * deltaX + deltaY * deltaY;
}

/**
 * Linearly interpolates between two 2D points at parameter ratio t in [0, 1].
 * Formula: P(t) = A + (B - A) * t
 */
export function interpolateLinear2D(startPoint: Point2D, endPoint: Point2D, interpolationRatio: number): Point2D {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * interpolationRatio,
    y: startPoint.y + (endPoint.y - startPoint.y) * interpolationRatio,
  };
}

/**
 * Calculates the length (magnitude) of a 2D vector.
 * Formula: sqrt(x^2 + y^2)
 */
export function calculateVectorLength(vector: Point2D): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

/**
 * Normalizes a 2D vector to unit length (magnitude = 1.0).
 * Returns { x: 0, y: 0 } if input vector length is near zero.
 */
export function normalizeVector(vector: Point2D): Point2D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length < 1e-6) {
    return { x: 0, y: 0 };
  }
  const inverseLength = 1.0 / length;
  return {
    x: vector.x * inverseLength,
    y: vector.y * inverseLength,
  };
}

/**
 * Evaluates a 1D Catmull-Rom spline segment at parameter t in [0, 1].
 * Standard 4-point centripetal formulation with tension factor 0.5.
 * Formula:
 * P(t) = 0.5 * ( (2 * P1) +
 *                (-P0 + P2) * t +
 *                (2*P0 - 5*P1 + 4*P2 - P3) * t^2 +
 *                (-P0 + 3*P1 - 3*P2 + P3) * t^3 )
 */
export function interpolateCatmullRom1D(
  previousPoint: number,
  startPoint: number,
  endPoint: number,
  nextPoint: number,
  interpolationRatio: number
): number {
  const ratioSquared = interpolationRatio * interpolationRatio;
  const ratioCubed = ratioSquared * interpolationRatio;

  return 0.5 * (
    (2.0 * startPoint) +
    (-previousPoint + endPoint) * interpolationRatio +
    (2.0 * previousPoint - 5.0 * startPoint + 4.0 * endPoint - nextPoint) * ratioSquared +
    (-previousPoint + 3.0 * startPoint - 3.0 * endPoint + nextPoint) * ratioCubed
  );
}

/**
 * Evaluates a 2D Catmull-Rom spline segment across X and Y axes independently.
 */
export function interpolateCatmullRom2D(
  previousPoint: Point2D,
  startPoint: Point2D,
  endPoint: Point2D,
  nextPoint: Point2D,
  interpolationRatio: number
): Point2D {
  return {
    x: interpolateCatmullRom1D(previousPoint.x, startPoint.x, endPoint.x, nextPoint.x, interpolationRatio),
    y: interpolateCatmullRom1D(previousPoint.y, startPoint.y, endPoint.y, nextPoint.y, interpolationRatio),
  };
}

/**
 * Evaluates a 2D Cubic Bézier curve at parameter t in [0, 1].
 * Bernstein polynomial basis:
 * B(t) = (1-t)^3 * P0 + 3*(1-t)^2 * t * C1 + 3*(1-t) * t^2 * C2 + t^3 * P3
 */
export function evaluateCubicBezier2D(
  startPoint: Point2D,
  controlPoint1: Point2D,
  controlPoint2: Point2D,
  endPoint: Point2D,
  interpolationRatio: number
): Point2D {
  const oneMinusT = 1.0 - interpolationRatio;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const oneMinusTCubed = oneMinusTSquared * oneMinusT;

  const tSquared = interpolationRatio * interpolationRatio;
  const tCubed = tSquared * interpolationRatio;

  const weight0 = oneMinusTCubed;
  const weight1 = 3.0 * oneMinusTSquared * interpolationRatio;
  const weight2 = 3.0 * oneMinusT * tSquared;
  const weight3 = tCubed;

  return {
    x: weight0 * startPoint.x + weight1 * controlPoint1.x + weight2 * controlPoint2.x + weight3 * endPoint.x,
    y: weight0 * startPoint.y + weight1 * controlPoint1.y + weight2 * controlPoint2.y + weight3 * endPoint.y,
  };
}

/**
 * Evaluates the tangent derivative vector of a 2D Cubic Bézier curve at parameter t in [0, 1].
 * B'(t) = 3*(1-t)^2 * (C1 - P0) + 6*(1-t)*t * (C2 - C1) + 3*t^2 * (P3 - C2)
 */
export function evaluateCubicBezierTangent2D(
  startPoint: Point2D,
  controlPoint1: Point2D,
  controlPoint2: Point2D,
  endPoint: Point2D,
  interpolationRatio: number
): Point2D {
  const oneMinusT = 1.0 - interpolationRatio;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = interpolationRatio * interpolationRatio;

  const weight0 = 3.0 * oneMinusTSquared;
  const weight1 = 6.0 * oneMinusT * interpolationRatio;
  const weight2 = 3.0 * tSquared;

  return {
    x: weight0 * (controlPoint1.x - startPoint.x) + weight1 * (controlPoint2.x - controlPoint1.x) + weight2 * (endPoint.x - controlPoint2.x),
    y: weight0 * (controlPoint1.y - startPoint.y) + weight1 * (controlPoint2.y - controlPoint1.y) + weight2 * (endPoint.y - controlPoint2.y),
  };
}
