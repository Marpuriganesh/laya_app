/**
 * Dab Spacing Calculator
 * Calculates precise dab stamp coordinates along stroke paths.
 * Maintains leftover distance between events to ensure unbroken, uniform stroke density.
 * 100% pure, stateful instance with zero global variables.
 */

import type { CubicBezierSegment, StrokePoint } from "../../types/stroke";
import { clampScalar } from "../math/dynamics_curve";
import { calculateDistance, evaluateCubicBezier2D, interpolateLinear2D } from "../math/vector2d";

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
   * Resets the calculator at the start of a stroke.
   */
  public beginStroke(initialPoint: StrokePoint): InterpolatedDabPoint[] {
    this.leftoverDistance = 0.0;
    this.lastPoint = initialPoint;

    // Emit the initial dab stamp at the stroke origin
    return [
      {
        canvasX: initialPoint.canvasX,
        canvasY: initialPoint.canvasY,
        pressure: initialPoint.pressure,
        tiltX: initialPoint.tiltX,
        tiltY: initialPoint.tiltY,
        speed: initialPoint.speed,
        timeMs: initialPoint.timeMs,
      },
    ];
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

      const interpolatedPressure = previous.pressure + (newPoint.pressure - previous.pressure) * interpolationRatio;
      const interpolatedTiltX = previous.tiltX + (newPoint.tiltX - previous.tiltX) * interpolationRatio;
      const interpolatedTiltY = previous.tiltY + (newPoint.tiltY - previous.tiltY) * interpolationRatio;
      const interpolatedSpeed = previous.speed + (newPoint.speed - previous.speed) * interpolationRatio;
      const interpolatedTime = previous.timeMs + (newPoint.timeMs - previous.timeMs) * interpolationRatio;

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
   * Emits evenly-spaced dabs along a Cubic Bézier curve segment.
   *
   * @param bezierSegment Cubic Bézier segment with control handles
   * @param stepDistancePx Desired distance between consecutive dabs
   */
  public processBezierSegment(
    bezierSegment: CubicBezierSegment,
    stepDistancePx: number
  ): InterpolatedDabPoint[] {
    // Approximate curve length by chord sum
    const chord1 = calculateDistance(bezierSegment.p0, bezierSegment.c1);
    const chord2 = calculateDistance(bezierSegment.c1, bezierSegment.c2);
    const chord3 = calculateDistance(bezierSegment.c2, bezierSegment.p3);
    const directChord = calculateDistance(bezierSegment.p0, bezierSegment.p3);
    const approximateLength = (chord1 + chord2 + chord3 + directChord) * 0.5;

    if (approximateLength < 1e-4) {
      return [];
    }

    const dabs: InterpolatedDabPoint[] = [];
    const validStep = Math.max(stepDistancePx, 0.5);

    let currentDistance = validStep - this.leftoverDistance;

    while (currentDistance <= approximateLength) {
      const parameterRatio = currentDistance / approximateLength;

      const position = evaluateCubicBezier2D(
        bezierSegment.p0,
        bezierSegment.c1,
        bezierSegment.c2,
        bezierSegment.p3,
        parameterRatio
      );

      const interpolatedPressure =
        bezierSegment.startPressure +
        (bezierSegment.endPressure - bezierSegment.startPressure) * parameterRatio;

      const interpolatedTime =
        bezierSegment.startTimeMs +
        (bezierSegment.endTimeMs - bezierSegment.startTimeMs) * parameterRatio;

      dabs.push({
        canvasX: position.x,
        canvasY: position.y,
        pressure: clampScalar(interpolatedPressure, 0.0, 1.0),
        tiltX: 0,
        tiltY: 0,
        speed: 0,
        timeMs: interpolatedTime,
      });

      currentDistance += validStep;
    }

    this.leftoverDistance = approximateLength - (currentDistance - validStep);
    return dabs;
  }

  public endStroke(): void {
    this.leftoverDistance = 0.0;
    this.lastPoint = null;
  }
}
