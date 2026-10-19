/**
 * Continuous Bézier & Catmull-Rom Spline Curve Interpolator
 *
 * Mathematical Foundations:
 * 1. Catmull-Rom to Cubic Bézier Conversion:
 *    Generates smooth C¹ continuous cubic Bézier splines passing through stroke points P1 and P2:
 *    C1 = P1 + (P2 - P0) / 6
 *    C2 = P2 - (P3 - P1) / 6
 *    Guarantees matching first-order derivative velocity vectors at segment junctions:
 *    B'_exit(P2) = B'_enter(P2) = (P3 - P1) / 2
 *
 * 2. Midpoint Quadratic Bézier Curve Generation (Procreate / Paper by FiftyThree style):
 *    Passes through midpoints M_i = (P_i + P_{i+1}) / 2 with control point P_i.
 *    Elevated to exact Cubic Bézier representation:
 *    C1 = M_{i-1} + (2/3) * (P_i - M_{i-1})
 *    C2 = M_i + (2/3) * (P_i - M_i)
 *    Provides C¹ continuity at every midpoint M_i:
 *    Tangent = P_i - P_{i-1}
 *
 * 3. Smooth Physical Sensor Dynamics Interpolation:
 *    Interpolates pressure, tilt, speed, and timestamps along curves.
 *
 * 100% pure TypeScript, zero DOM/React dependencies, 1:1 translatable to C++/Rust/WGSL.
 */

import type { Point2D, StrokePoint, CubicBezierSegment } from "../../types/stroke";
import { clampScalar } from "../math/dynamics_curve";

export type SplineInterpolationMode = "catmullRom" | "midpoint";

export interface InterpolatedStrokeProperties {
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly speed: number;
  readonly timeMs: number;
}

/**
 * Creates an interpolated midpoint between two StrokePoints across all physical sensor properties.
 */
export function interpolateStrokePointMidpoint(
  pointA: StrokePoint,
  pointB: StrokePoint
): StrokePoint {
  return {
    canvasX: (pointA.canvasX + pointB.canvasX) * 0.5,
    canvasY: (pointA.canvasY + pointB.canvasY) * 0.5,
    pressure: clampScalar((pointA.pressure + pointB.pressure) * 0.5, 0.0, 1.0),
    tiltX: (pointA.tiltX + pointB.tiltX) * 0.5,
    tiltY: (pointA.tiltY + pointB.tiltY) * 0.5,
    rotation: (pointA.rotation + pointB.rotation) * 0.5,
    speed: (pointA.speed + pointB.speed) * 0.5,
    timeMs: (pointA.timeMs + pointB.timeMs) * 0.5,
  };
}

/**
 * Extrapolates a virtual boundary point along the vector from oppositePoint through anchorPoint.
 * P_extrapolated = 2 * P_anchor - P_opposite
 */
export function extrapolateBoundaryPoint(
  anchorPoint: StrokePoint,
  oppositePoint: StrokePoint
): StrokePoint {
  return {
    canvasX: 2.0 * anchorPoint.canvasX - oppositePoint.canvasX,
    canvasY: 2.0 * anchorPoint.canvasY - oppositePoint.canvasY,
    pressure: clampScalar(2.0 * anchorPoint.pressure - oppositePoint.pressure, 0.0, 1.0),
    tiltX: 2.0 * anchorPoint.tiltX - oppositePoint.tiltX,
    tiltY: 2.0 * anchorPoint.tiltY - oppositePoint.tiltY,
    rotation: anchorPoint.rotation,
    speed: Math.max(0.0, 2.0 * anchorPoint.speed - oppositePoint.speed),
    timeMs: anchorPoint.timeMs + (anchorPoint.timeMs - oppositePoint.timeMs),
  };
}

/**
 * Fits a C¹ continuous Cubic Bézier curve between points P1 and P2 from 4 consecutive points
 * using the standard Catmull-Rom formulation:
 * C1 = P1 + (P2 - P0) / 6
 * C2 = P2 - (P3 - P1) / 6
 */
export function fitCatmullRomToBezier(
  p0: StrokePoint,
  p1: StrokePoint,
  p2: StrokePoint,
  p3: StrokePoint
): CubicBezierSegment {
  const control1: Point2D = {
    x: p1.canvasX + (p2.canvasX - p0.canvasX) / 6.0,
    y: p1.canvasY + (p2.canvasY - p0.canvasY) / 6.0,
  };

  const control2: Point2D = {
    x: p2.canvasX - (p3.canvasX - p1.canvasX) / 6.0,
    y: p2.canvasY - (p3.canvasY - p1.canvasY) / 6.0,
  };

  return {
    p0: { x: p1.canvasX, y: p1.canvasY },
    c1: control1,
    c2: control2,
    p3: { x: p2.canvasX, y: p2.canvasY },
    startPressure: clampScalar(p1.pressure, 0.0, 1.0),
    endPressure: clampScalar(p2.pressure, 0.0, 1.0),
    startTimeMs: p1.timeMs,
    endTimeMs: p2.timeMs,
    startTiltX: p1.tiltX,
    endTiltX: p2.tiltX,
    startTiltY: p1.tiltY,
    endTiltY: p2.tiltY,
    startSpeed: p1.speed,
    endSpeed: p2.speed,
  };
}

/**
 * Elevates a quadratic Bézier curve (startPoint -> controlPoint -> endPoint) to an exact
 * equivalent Cubic Bézier curve.
 * Formula:
 * C1 = Start + (2/3) * (Control - Start)
 * C2 = End + (2/3) * (Control - End)
 */
export function elevateQuadraticToBezierHandles(
  startPoint: Point2D,
  controlPoint: Point2D,
  endPoint: Point2D
): { readonly c1: Point2D; readonly c2: Point2D } {
  return {
    c1: {
      x: startPoint.x + (2.0 / 3.0) * (controlPoint.x - startPoint.x),
      y: startPoint.y + (2.0 / 3.0) * (controlPoint.y - startPoint.y),
    },
    c2: {
      x: endPoint.x + (2.0 / 3.0) * (controlPoint.x - endPoint.x),
      y: endPoint.y + (2.0 / 3.0) * (controlPoint.y - endPoint.y),
    },
  };
}

/**
 * Generates a Cubic Bézier segment passing between startPoint and endPoint with a quadratic
 * control vertex controlPoint, degree-elevated to cubic form.
 */
export function fitMidpointSegmentToBezier(
  startPoint: StrokePoint,
  controlPoint: StrokePoint,
  endPoint: StrokePoint
): CubicBezierSegment {
  const handles = elevateQuadraticToBezierHandles(
    { x: startPoint.canvasX, y: startPoint.canvasY },
    { x: controlPoint.canvasX, y: controlPoint.canvasY },
    { x: endPoint.canvasX, y: endPoint.canvasY }
  );

  return {
    p0: { x: startPoint.canvasX, y: startPoint.canvasY },
    c1: handles.c1,
    c2: handles.c2,
    p3: { x: endPoint.canvasX, y: endPoint.canvasY },
    startPressure: clampScalar(startPoint.pressure, 0.0, 1.0),
    endPressure: clampScalar(endPoint.pressure, 0.0, 1.0),
    startTimeMs: startPoint.timeMs,
    endTimeMs: endPoint.timeMs,
    startTiltX: startPoint.tiltX,
    endTiltX: endPoint.tiltX,
    startTiltY: startPoint.tiltY,
    endTiltY: endPoint.tiltY,
    startSpeed: startPoint.speed,
    endSpeed: endPoint.speed,
  };
}

/**
 * Interpolates physical sensor properties (pressure, tilt, speed, time) along a Cubic Bézier segment
 * at parameter ratio t in [0, 1].
 */
export function interpolateSegmentProperties(
  segment: CubicBezierSegment,
  parameterRatio: number
): InterpolatedStrokeProperties {
  const clampedRatio = Math.max(0.0, Math.min(1.0, parameterRatio));

  const pressure = clampScalar(
    segment.startPressure + (segment.endPressure - segment.startPressure) * clampedRatio,
    0.0,
    1.0
  );

  const startTiltX = segment.startTiltX ?? 0.0;
  const endTiltX = segment.endTiltX ?? startTiltX;
  const tiltX = startTiltX + (endTiltX - startTiltX) * clampedRatio;

  const startTiltY = segment.startTiltY ?? 0.0;
  const endTiltY = segment.endTiltY ?? startTiltY;
  const tiltY = startTiltY + (endTiltY - startTiltY) * clampedRatio;

  const startSpeed = segment.startSpeed ?? 0.0;
  const endSpeed = segment.endSpeed ?? startSpeed;
  const speed = Math.max(0.0, startSpeed + (endSpeed - startSpeed) * clampedRatio);

  const timeMs = segment.startTimeMs + (segment.endTimeMs - segment.startTimeMs) * clampedRatio;

  return { pressure, tiltX, tiltY, speed, timeMs };
}

/**
 * Batch utility: Generates C¹ Catmull-Rom cubic Bézier segments for an entire stroke path.
 */
export function generateCatmullRomSpline(
  points: readonly StrokePoint[]
): CubicBezierSegment[] {
  const pointCount = points.length;
  if (pointCount < 2) {
    return [];
  }

  if (pointCount === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const virtualPrev = extrapolateBoundaryPoint(p0, p1);
    const virtualNext = extrapolateBoundaryPoint(p1, p0);
    return [fitCatmullRomToBezier(virtualPrev, p0, p1, virtualNext)];
  }

  const segments: CubicBezierSegment[] = [];

  // First segment: extrapolate P_{-1} = 2*P0 - P1
  const virtualStart = extrapolateBoundaryPoint(points[0], points[1]);
  segments.push(fitCatmullRomToBezier(virtualStart, points[0], points[1], points[2]));

  // Interior segments
  for (let index = 1; index < pointCount - 2; index += 1) {
    segments.push(
      fitCatmullRomToBezier(
        points[index - 1],
        points[index],
        points[index + 1],
        points[index + 2]
      )
    );
  }

  // Final segment: extrapolate P_{n+1} = 2*Pn - P_{n-1}
  const virtualEnd = extrapolateBoundaryPoint(
    points[pointCount - 1],
    points[pointCount - 2]
  );
  segments.push(
    fitCatmullRomToBezier(
      points[pointCount - 3],
      points[pointCount - 2],
      points[pointCount - 1],
      virtualEnd
    )
  );

  return segments;
}

/**
 * Batch utility: Generates Midpoint Bézier segments for an entire stroke path.
 */
export function generateMidpointSpline(
  points: readonly StrokePoint[]
): CubicBezierSegment[] {
  const pointCount = points.length;
  if (pointCount < 2) {
    return [];
  }

  const segments: CubicBezierSegment[] = [];
  const midpoints: StrokePoint[] = [];

  for (let index = 0; index < pointCount - 1; index += 1) {
    midpoints.push(interpolateStrokePointMidpoint(points[index], points[index + 1]));
  }

  // First segment: P0 -> M0 with control point P0
  segments.push(fitMidpointSegmentToBezier(points[0], points[0], midpoints[0]));

  // Interior segments: M_{i-1} -> M_i with control point P_i
  for (let index = 1; index < midpoints.length; index += 1) {
    segments.push(
      fitMidpointSegmentToBezier(midpoints[index - 1], points[index], midpoints[index])
    );
  }

  // Final segment: M_{last} -> P_{last} with control point P_{last}
  const lastMidpoint = midpoints[midpoints.length - 1];
  const lastPoint = points[pointCount - 1];
  segments.push(fitMidpointSegmentToBezier(lastMidpoint, lastPoint, lastPoint));

  return segments;
}

/**
 * Streaming Spline Interpolator
 *
 * Maintains a small sliding window of 3-4 points to emit smooth C¹ continuous
 * CubicBezierSegments incrementally as pointer events arrive.
 */
export class SplineInterpolator {
  private mode: SplineInterpolationMode;
  private readonly pointWindow: StrokePoint[] = [];
  private lastMidpoint: StrokePoint | null = null;

  constructor(mode: SplineInterpolationMode = "catmullRom") {
    this.mode = mode;
  }

  public getMode(): SplineInterpolationMode {
    return this.mode;
  }

  public setMode(mode: SplineInterpolationMode): void {
    this.mode = mode;
    this.reset();
  }

  /**
   * Resets the interpolator and initializes with the first stroke event.
   */
  public beginStroke(initialPoint: StrokePoint): CubicBezierSegment[] {
    this.reset();
    this.pointWindow.push(initialPoint);
    return [];
  }

  /**
   * Pushes a new raw or smoothed point from the input pipeline.
   * Emits new continuous cubic Bézier segments as soon as enough context is available.
   */
  public pushPoint(point: StrokePoint): CubicBezierSegment[] {
    if (this.pointWindow.length === 0) {
      return this.beginStroke(point);
    }

    if (this.mode === "midpoint") {
      return this.pushPointMidpoint(point);
    }

    return this.pushPointCatmullRom(point);
  }

  /**
   * Finalizes the stroke path on pointerup / pointercancel and emits remaining boundary segments.
   */
  public endStroke(): CubicBezierSegment[] {
    const emittedSegments =
      this.mode === "midpoint" ? this.endStrokeMidpoint() : this.endStrokeCatmullRom();

    this.reset();
    return emittedSegments;
  }

  /**
   * Clears internal state without generating segments.
   */
  public reset(): void {
    this.pointWindow.length = 0;
    this.lastMidpoint = null;
  }

  // --- Catmull-Rom Streaming Pipeline ---

  private pushPointCatmullRom(point: StrokePoint): CubicBezierSegment[] {
    this.pointWindow.push(point);
    const windowLength = this.pointWindow.length;

    // Window [P0, P1]: Not enough points yet to fit C1 tangents for P0->P1
    if (windowLength === 2) {
      return [];
    }

    // Window [P0, P1, P2]: First segment P0->P1 can now be fitted using virtual P_{-1} = 2*P0 - P1
    if (windowLength === 3) {
      const p0 = this.pointWindow[0];
      const p1 = this.pointWindow[1];
      const p2 = this.pointWindow[2];
      const virtualPrev = extrapolateBoundaryPoint(p0, p1);
      return [fitCatmullRomToBezier(virtualPrev, p0, p1, p2)];
    }

    // Window [P_{n-2}, P_{n-1}, P_n, P_{n+1}]: Fit segment between P_{n-1} and P_n
    const pPrev2 = this.pointWindow[0];
    const pPrev1 = this.pointWindow[1];
    const pCurrent = this.pointWindow[2];
    const pNext = this.pointWindow[3];

    const segment = fitCatmullRomToBezier(pPrev2, pPrev1, pCurrent, pNext);

    // Slide window: keep [P_{n-1}, P_n, P_{n+1}]
    this.pointWindow.shift();

    return [segment];
  }

  private endStrokeCatmullRom(): CubicBezierSegment[] {
    const count = this.pointWindow.length;

    if (count < 2) {
      return [];
    }

    // Stroke had only 2 points total: P0, P1
    if (count === 2) {
      const p0 = this.pointWindow[0];
      const p1 = this.pointWindow[1];
      const virtualPrev = extrapolateBoundaryPoint(p0, p1);
      const virtualNext = extrapolateBoundaryPoint(p1, p0);
      return [fitCatmullRomToBezier(virtualPrev, p0, p1, virtualNext)];
    }

    // Window has 3 points [P_{n-2}, P_{n-1}, P_n]
    // The segment between P_{n-1} and P_n is completed by extrapolating P_{n+1} = 2*P_n - P_{n-1}
    const p0 = this.pointWindow[count - 3];
    const p1 = this.pointWindow[count - 2];
    const p2 = this.pointWindow[count - 1];
    const virtualNext = extrapolateBoundaryPoint(p2, p1);

    return [fitCatmullRomToBezier(p0, p1, p2, virtualNext)];
  }

  // --- Midpoint Streaming Pipeline ---

  private pushPointMidpoint(point: StrokePoint): CubicBezierSegment[] {
    const previousPoint = this.pointWindow[this.pointWindow.length - 1];
    const midpoint = interpolateStrokePointMidpoint(previousPoint, point);

    // First incoming point after stroke origin: emit initial line segment P0 -> M0
    if (this.lastMidpoint === null) {
      this.lastMidpoint = midpoint;
      this.pointWindow.push(point);
      return [fitMidpointSegmentToBezier(previousPoint, previousPoint, midpoint)];
    }

    // Successive points: emit segment from previous midpoint to new midpoint
    // with control point at previousPoint
    const segment = fitMidpointSegmentToBezier(this.lastMidpoint, previousPoint, midpoint);
    this.lastMidpoint = midpoint;

    // Maintain window: keep [previousPoint, point]
    this.pointWindow.length = 0;
    this.pointWindow.push(previousPoint, point);

    return [segment];
  }

  private endStrokeMidpoint(): CubicBezierSegment[] {
    if (this.pointWindow.length < 2 || this.lastMidpoint === null) {
      return [];
    }

    const lastPoint = this.pointWindow[this.pointWindow.length - 1];
    // Final segment: M_{last} -> P_{last} with control point P_{last}
    const finalSegment = fitMidpointSegmentToBezier(this.lastMidpoint, lastPoint, lastPoint);

    return [finalSegment];
  }
}
