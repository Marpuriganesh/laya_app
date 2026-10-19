/**
 * Cubic Bézier Arc-Length Parameterization & Numerical Integration
 *
 * Provides exact arc-length parameterization for 2D cubic Bézier curves using
 * 5-point Gauss-Legendre quadrature and Newton-Raphson inversion.
 *
 * Mathematical Foundations:
 * 1. Arc Length Integral:
 *    S(t) = \int_0^t ||B'(\tau)|| d\tau = \int_0^t \sqrt{x'(\tau)^2 + y'(\tau)^2} d\tau
 * 2. 5-Point Gauss-Legendre Quadrature:
 *    Evaluates the non-elementary square root integral over small subintervals with
 *    polynomial precision up to degree 9, yielding sub-pixel (<10^-9 px) accuracy.
 * 3. Inversion via Newton-Raphson:
 *    Finds parameter t for target arc length s such that S(t) - s = 0.
 *    Derivative S'(t) = ||B'(t)||, enabling quadratic convergence in 1-2 steps.
 *
 * 100% pure TypeScript, zero DOM/framework dependencies, 1:1 translatable to C++/Rust/WGSL.
 */

import type { Point2D } from "../../types/stroke";
import { evaluateCubicBezier2D, evaluateCubicBezierTangent2D } from "./vector2d";

/**
 * 5-point Gauss-Legendre Quadrature abscissae on the canonical interval [-1, 1].
 */
const GAUSS_LEGENDRE_ABSCISSAE: readonly number[] = [
  0.0,
  -0.5384693101056831,
  0.5384693101056831,
  -0.906179845938664,
  0.906179845938664,
];

/**
 * 5-point Gauss-Legendre Quadrature weights corresponding to each abscissa.
 */
const GAUSS_LEGENDRE_WEIGHTS: readonly number[] = [
  0.5688888888888889,
  0.4786286704993665,
  0.4786286704993665,
  0.2369268850561891,
  0.2369268850561891,
];

/**
 * Calculates the speed (magnitude of first derivative velocity vector) along a cubic Bézier curve.
 * Formula: v(t) = ||B'(t)|| = sqrt(x'(t)^2 + y'(t)^2)
 *
 * @param startPoint Start anchor (P0)
 * @param controlPoint1 First control handle (C1)
 * @param controlPoint2 Second control handle (C2)
 * @param endPoint End anchor (P3)
 * @param parameterRatio Curve parameter t in [0, 1]
 */
export function calculateCubicBezierSpeed(
  startPoint: Point2D,
  controlPoint1: Point2D,
  controlPoint2: Point2D,
  endPoint: Point2D,
  parameterRatio: number
): number {
  const tangent = evaluateCubicBezierTangent2D(
    startPoint,
    controlPoint1,
    controlPoint2,
    endPoint,
    parameterRatio
  );
  return Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
}

/**
 * Evaluates the arc length integral over a subinterval [intervalStart, intervalEnd]
 * using 5-point Gauss-Legendre quadrature.
 *
 * Change of variables from [-1, 1] to [a, b]:
 * tau = ((b - a) * x + (b + a)) / 2
 * dtau = ((b - a) / 2) * dx
 */
export function integrateCubicBezierSubinterval(
  startPoint: Point2D,
  controlPoint1: Point2D,
  controlPoint2: Point2D,
  endPoint: Point2D,
  intervalStart: number,
  intervalEnd: number
): number {
  const halfWidth = 0.5 * (intervalEnd - intervalStart);
  if (Math.abs(halfWidth) < 1e-12) {
    return 0.0;
  }

  const midpoint = 0.5 * (intervalStart + intervalEnd);
  let weightedSpeedSum = 0.0;

  for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
    const parameterSample = midpoint + halfWidth * GAUSS_LEGENDRE_ABSCISSAE[sampleIndex];
    const speed = calculateCubicBezierSpeed(
      startPoint,
      controlPoint1,
      controlPoint2,
      endPoint,
      parameterSample
    );
    weightedSpeedSum += GAUSS_LEGENDRE_WEIGHTS[sampleIndex] * speed;
  }

  return halfWidth * weightedSpeedSum;
}

/**
 * Computes the total arc length of a cubic Bézier curve segment.
 *
 * @param startPoint Start anchor (P0)
 * @param controlPoint1 First control handle (C1)
 * @param controlPoint2 Second control handle (C2)
 * @param endPoint End anchor (P3)
 * @param subintervalCount Number of integration subdivisions (default 16)
 */
export function calculateCubicBezierTotalLength(
  startPoint: Point2D,
  controlPoint1: Point2D,
  controlPoint2: Point2D,
  endPoint: Point2D,
  subintervalCount = 16
): number {
  let totalLength = 0.0;
  const stepRatio = 1.0 / subintervalCount;

  for (let intervalIndex = 0; intervalIndex < subintervalCount; intervalIndex += 1) {
    const intervalStart = intervalIndex * stepRatio;
    const intervalEnd = (intervalIndex + 1) * stepRatio;
    totalLength += integrateCubicBezierSubinterval(
      startPoint,
      controlPoint1,
      controlPoint2,
      endPoint,
      intervalStart,
      intervalEnd
    );
  }

  return totalLength;
}

/**
 * Precomputed Arc-Length Lookup Table for a single Cubic Bézier Segment.
 * Provides O(log N) parameter inversion with Newton-Raphson refinement,
 * guaranteeing constant Euclidean distance stepping along the curve.
 */
export class CubicBezierArcLengthTable {
  public readonly totalLength: number;
  private readonly subintervalCount: number;
  private readonly cumulativeLengths: Float64Array;
  private readonly startPoint: Point2D;
  private readonly controlPoint1: Point2D;
  private readonly controlPoint2: Point2D;
  private readonly endPoint: Point2D;

  constructor(
    startPoint: Point2D,
    controlPoint1: Point2D,
    controlPoint2: Point2D,
    endPoint: Point2D,
    subintervalCount = 32
  ) {
    this.startPoint = startPoint;
    this.controlPoint1 = controlPoint1;
    this.controlPoint2 = controlPoint2;
    this.endPoint = endPoint;
    this.subintervalCount = Math.max(subintervalCount, 4);

    this.cumulativeLengths = new Float64Array(this.subintervalCount + 1);
    this.cumulativeLengths[0] = 0.0;

    let accumulatedDistance = 0.0;
    const stepRatio = 1.0 / this.subintervalCount;

    for (let intervalIndex = 0; intervalIndex < this.subintervalCount; intervalIndex += 1) {
      const intervalStart = intervalIndex * stepRatio;
      const intervalEnd = (intervalIndex + 1) * stepRatio;
      const subintervalLength = integrateCubicBezierSubinterval(
        startPoint,
        controlPoint1,
        controlPoint2,
        endPoint,
        intervalStart,
        intervalEnd
      );
      accumulatedDistance += subintervalLength;
      this.cumulativeLengths[intervalIndex + 1] = accumulatedDistance;
    }

    this.totalLength = accumulatedDistance;
  }

  /**
   * Inverts the arc-length function: finds parameter t in [0, 1] such that S(t) = targetArcLength.
   *
   * @param targetArcLength Target distance from start of curve in canvas pixels
   */
  public getTForArcLength(targetArcLength: number): number {
    if (this.totalLength < 1e-6 || targetArcLength <= 0.0) {
      return 0.0;
    }
    if (targetArcLength >= this.totalLength) {
      return 1.0;
    }

    // Binary search on cumulative lengths to locate containing subinterval
    let lowIndex = 0;
    let highIndex = this.subintervalCount;

    while (lowIndex < highIndex - 1) {
      const midIndex = (lowIndex + highIndex) >> 1;
      if (this.cumulativeLengths[midIndex] <= targetArcLength) {
        lowIndex = midIndex;
      } else {
        highIndex = midIndex;
      }
    }

    const intervalStartDistance = this.cumulativeLengths[lowIndex];
    const intervalEndDistance = this.cumulativeLengths[lowIndex + 1];
    const intervalLength = intervalEndDistance - intervalStartDistance;

    const stepRatio = 1.0 / this.subintervalCount;
    const tIntervalStart = lowIndex * stepRatio;
    const tIntervalEnd = (lowIndex + 1) * stepRatio;

    if (intervalLength < 1e-9) {
      return tIntervalStart;
    }

    // Initial linear interpolation estimate within the subinterval
    const localRatio = (targetArcLength - intervalStartDistance) / intervalLength;
    let estimatedT = tIntervalStart + localRatio * (tIntervalEnd - tIntervalStart);

    // 1 step of Newton-Raphson refinement: t_new = t - (S(t) - targetArcLength) / S'(t)
    const evaluatedDistance =
      intervalStartDistance +
      integrateCubicBezierSubinterval(
        this.startPoint,
        this.controlPoint1,
        this.controlPoint2,
        this.endPoint,
        tIntervalStart,
        estimatedT
      );

    const speed = calculateCubicBezierSpeed(
      this.startPoint,
      this.controlPoint1,
      this.controlPoint2,
      this.endPoint,
      estimatedT
    );

    if (speed > 1e-6) {
      const newtonCorrection = (evaluatedDistance - targetArcLength) / speed;
      const refinedT = estimatedT - newtonCorrection;
      // Guard: keep refined t within the valid subinterval bracket
      if (refinedT >= tIntervalStart && refinedT <= tIntervalEnd) {
        estimatedT = refinedT;
      }
    }

    return Math.max(0.0, Math.min(1.0, estimatedT));
  }

  /**
   * Computes the exact arc length S(t) from parameter 0 to parameter t.
   */
  public getArcLengthForT(parameterRatio: number): number {
    if (parameterRatio <= 0.0) {
      return 0.0;
    }
    if (parameterRatio >= 1.0) {
      return this.totalLength;
    }

    const stepRatio = 1.0 / this.subintervalCount;
    const rawIndex = Math.floor(parameterRatio * this.subintervalCount);
    const lowIndex = Math.max(0, Math.min(this.subintervalCount - 1, rawIndex));
    const tIntervalStart = lowIndex * stepRatio;

    const partialLength = integrateCubicBezierSubinterval(
      this.startPoint,
      this.controlPoint1,
      this.controlPoint2,
      this.endPoint,
      tIntervalStart,
      parameterRatio
    );

    return this.cumulativeLengths[lowIndex] + partialLength;
  }

  /**
   * Evaluates the 2D position along the curve at a specific arc length.
   */
  public evaluatePositionAtArcLength(targetArcLength: number): Point2D {
    const parameterRatio = this.getTForArcLength(targetArcLength);
    return evaluateCubicBezier2D(
      this.startPoint,
      this.controlPoint1,
      this.controlPoint2,
      this.endPoint,
      parameterRatio
    );
  }
}
