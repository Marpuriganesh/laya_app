/**
 * Dab Spacing Calculator
 *
 * Calculates precise dab stamp coordinates along linear and cubic Bézier stroke paths.
 * Implements true arc-length parameterization using numerical Gauss-Legendre quadrature
 * and Newton-Raphson inversion, guaranteeing constant Euclidean dab spacing regardless
 * of drawing speed or curve curvature.
 *
 * Maintains leftover distance between events to ensure unbroken, uniform stroke density
 * without clumping or gaps.
 *
 * 100% pure TypeScript, stateful instance with zero global variables.
 * Designed for 1:1 direct translation to C++/Rust.
 */

import type { CubicBezierSegment, StrokePoint } from "../../types/stroke";
import { CubicBezierArcLengthTable } from "../math/bezier_arc_length";
import { clampScalar } from "../math/dynamics_curve";
import { calculateDistance, evaluateCubicBezier2D, interpolateLinear2D } from "../math/vector2d";
import { interpolateSegmentProperties } from "./spline_interpolator";

export interface InterpolatedDabPoint {
  readonly canvasX: number;
  readonly canvasY: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly speed: number;
  readonly timeMs: number;
}

export class DabSpacingCalculator {
  private leftoverDistance = 0.0;
  private lastPoint: StrokePoint | null = null;

  /**
   * Resets the calculator at the start of a stroke and emits the origin dab stamp.
   */
  public beginStroke(initialPoint: StrokePoint): InterpolatedDabPoint[] {
    this.leftoverDistance = 0.0;
    this.lastPoint = initialPoint;

    // Emit initial dab stamp at the stroke origin (t = 0)
    return [
      {
        canvasX: initialPoint.canvasX,
        canvasY: initialPoint.canvasY,
        pressure: clampScalar(initialPoint.pressure, 0.0, 1.0),
        tiltX: initialPoint.tiltX,
        tiltY: initialPoint.tiltY,
        speed: initialPoint.speed,
        timeMs: initialPoint.timeMs,
      },
    ];
  }

  /**
   * Returns the current accumulated remainder distance from the previous segment.
   */
  public getLeftoverDistance(): number {
    return this.leftoverDistance;
  }

  /**
   * Sets the leftover distance remainder (useful for state restoration or tests).
   */
  public setLeftoverDistance(distance: number): void {
    this.leftoverDistance = Math.max(0.0, distance);
  }

  /**
   * Emits evenly-spaced dabs along a linear segment between the previous point and newPoint.
   *
   * @param newPoint Current smoothed stroke point
   * @param stepDistancePx Desired distance between consecutive dab stamps in pixels
   */
  public processLinearSegment(
    newPoint: StrokePoint,
    stepDistancePx: number
  ): InterpolatedDabPoint[] {
    if (!this.lastPoint) {
      return this.beginStroke(newPoint);
    }

    const previous = this.lastPoint;
    const segmentLength = calculateDistance(
      { x: previous.canvasX, y: previous.canvasY },
      { x: newPoint.canvasX, y: newPoint.canvasY }
    );

    if (segmentLength < 1e-4) {
      return [];
    }

    const dabs: InterpolatedDabPoint[] = [];
    const validStep = Math.max(stepDistancePx, 0.5);

    // Distance from previous point to the first dab in this segment
    let currentDistance = validStep - this.leftoverDistance;

    while (currentDistance <= segmentLength) {
      const interpolationRatio = currentDistance / segmentLength;

      const position = interpolateLinear2D(
        { x: previous.canvasX, y: previous.canvasY },
        { x: newPoint.canvasX, y: newPoint.canvasY },
        interpolationRatio
      );

      const interpolatedPressure =
        previous.pressure + (newPoint.pressure - previous.pressure) * interpolationRatio;
      const interpolatedTiltX =
        previous.tiltX + (newPoint.tiltX - previous.tiltX) * interpolationRatio;
      const interpolatedTiltY =
        previous.tiltY + (newPoint.tiltY - previous.tiltY) * interpolationRatio;
      const interpolatedSpeed =
        previous.speed + (newPoint.speed - previous.speed) * interpolationRatio;
      const interpolatedTime =
        previous.timeMs + (newPoint.timeMs - previous.timeMs) * interpolationRatio;

      dabs.push({
        canvasX: position.x,
        canvasY: position.y,
        pressure: clampScalar(interpolatedPressure, 0.0, 1.0),
        tiltX: interpolatedTiltX,
        tiltY: interpolatedTiltY,
        speed: interpolatedSpeed,
        timeMs: interpolatedTime,
      });

      currentDistance += validStep;
    }

    // Accumulate remainder distance for the next segment
    this.leftoverDistance = segmentLength - (currentDistance - validStep);
    this.lastPoint = newPoint;

    return dabs;
  }

  /**
   * Emits evenly-spaced dabs along a Cubic Bézier curve segment using true arc-length
   * parameterization. Consecutive dabs are placed at exact Euclidean distances along
   * the curve path regardless of speed, parameter acceleration, or curvature.
   *
   * @param bezierSegment Cubic Bézier segment with control handles and sensor endpoints
   * @param stepDistancePx Desired distance between consecutive dabs in pixels
   */
  public processBezierSegment(
    bezierSegment: CubicBezierSegment,
    stepDistancePx: number
  ): InterpolatedDabPoint[] {
    const arcLengthTable = new CubicBezierArcLengthTable(
      bezierSegment.p0,
      bezierSegment.c1,
      bezierSegment.c2,
      bezierSegment.p3
    );

    const totalLength = arcLengthTable.totalLength;
    if (totalLength < 1e-4) {
      return [];
    }

    const dabs: InterpolatedDabPoint[] = [];
    const validStep = Math.max(stepDistancePx, 0.5);

    let currentDistance = validStep - this.leftoverDistance;

    while (currentDistance <= totalLength) {
      // Invert arc length to find exact parameter t: S(t) = currentDistance
      const parameterRatio = arcLengthTable.getTForArcLength(currentDistance);

      const position = evaluateCubicBezier2D(
        bezierSegment.p0,
        bezierSegment.c1,
        bezierSegment.c2,
        bezierSegment.p3,
        parameterRatio
      );

      const sensorProps = interpolateSegmentProperties(bezierSegment, parameterRatio);

      dabs.push({
        canvasX: position.x,
        canvasY: position.y,
        pressure: sensorProps.pressure,
        tiltX: sensorProps.tiltX,
        tiltY: sensorProps.tiltY,
        speed: sensorProps.speed,
        timeMs: sensorProps.timeMs,
      });

      currentDistance += validStep;
    }

    // Accumulate remainder distance for seamless handover to the next segment
    this.leftoverDistance = totalLength - (currentDistance - validStep);

    this.lastPoint = {
      canvasX: bezierSegment.p3.x,
      canvasY: bezierSegment.p3.y,
      pressure: bezierSegment.endPressure,
      tiltX: bezierSegment.endTiltX ?? 0.0,
      tiltY: bezierSegment.endTiltY ?? 0.0,
      rotation: 0.0,
      speed: bezierSegment.endSpeed ?? 0.0,
      timeMs: bezierSegment.endTimeMs,
    };

    return dabs;
  }

  /**
   * Resets the stroke spacing accumulator on pointerup or stroke cancellation.
   */
  public endStroke(): void {
    this.leftoverDistance = 0.0;
    this.lastPoint = null;
  }
}
