/**
 * Predictive Bézier Stroke Smoother & Curve Generator
 *
 * Mathematical Principles:
 * 1. Solves "faceting" (angular polygons between discrete pointer events) by converting
 *    polygonal chord streams into mathematically continuous C¹ cubic Bézier splines.
 * 2. Look-Ahead Extrapolation (Latency Masking):
 *    Computes 2nd-order Taylor series prediction from velocity and acceleration:
 *    P_pred = P_n + v * dt_ahead + 0.5 * a * (dt_ahead)^2
 * 3. Catmull-Rom to Cubic Bézier conversion:
 *    C1 = P1 + (P2 - P0) / 6
 *    C2 = P2 - (P3 - P1) / 6
 */

import type { StrokeSmoothingConfig } from "../../types/brush";
import type { CubicBezierSegment, Point2D, StrokePoint } from "../../types/stroke";
import { clampScalar } from "../math/dynamics_curve";
import type { IStrokeSmoother } from "./stroke_smoother";

export class PredictiveBezierSmoother implements IStrokeSmoother {
  public readonly mode = "predictiveBezier";

  private readonly pointHistory: StrokePoint[] = [];
  private readonly config: StrokeSmoothingConfig;

  constructor(config: StrokeSmoothingConfig) {
    this.config = config;
  }

  public beginStroke(initialPoint: StrokePoint): StrokePoint {
    this.pointHistory.length = 0;
    this.pointHistory.push(initialPoint);

    return initialPoint;
  }

  public smooth(rawPoint: StrokePoint, _elapsedMs: number): StrokePoint {
    this.pointHistory.push(rawPoint);

    // Keep history bounded to 6 points for finite difference and Catmull-Rom evaluation
    if (this.pointHistory.length > 6) {
      this.pointHistory.shift();
    }

    const historyCount = this.pointHistory.length;
    if (historyCount < 3) {
      return rawPoint;
    }

    // Predict forward point using 2nd-order Taylor expansion
    const pCurrent = this.pointHistory[historyCount - 1];
    const pPrevious = this.pointHistory[historyCount - 2];
    const pOlder = this.pointHistory[historyCount - 3];

    const timeDeltaSeconds = Math.max((pCurrent.timeMs - pPrevious.timeMs) / 1000.0, 0.002);
    const lookAheadSeconds = (this.config.predictiveLookAheadFrames * 16.6) / 1000.0; // Assume ~60fps frame delta

    // Velocity: v = (P[n] - P[n-1]) / dt
    const velocityX = (pCurrent.canvasX - pPrevious.canvasX) / timeDeltaSeconds;
    const velocityY = (pCurrent.canvasY - pPrevious.canvasY) / timeDeltaSeconds;

    // Acceleration: a = (P[n] - 2*P[n-1] + P[n-2]) / dt^2
    const accelX = (pCurrent.canvasX - 2.0 * pPrevious.canvasX + pOlder.canvasX) / (timeDeltaSeconds * timeDeltaSeconds);
    const accelY = (pCurrent.canvasY - 2.0 * pPrevious.canvasY + pOlder.canvasY) / (timeDeltaSeconds * timeDeltaSeconds);

    // Predicted position: P_pred = P[n] + v*dt + 0.5*a*dt^2
    const predictedX = pCurrent.canvasX + velocityX * lookAheadSeconds + 0.5 * accelX * lookAheadSeconds * lookAheadSeconds;
    const predictedY = pCurrent.canvasY + velocityY * lookAheadSeconds + 0.5 * accelY * lookAheadSeconds * lookAheadSeconds;

    // Dampen prediction slightly to avoid overshoot on sharp direction reversals
    const blendWithCurrentRatio = 0.65;
    const smoothedX = pCurrent.canvasX * (1.0 - blendWithCurrentRatio) + predictedX * blendWithCurrentRatio;
    const smoothedY = pCurrent.canvasY * (1.0 - blendWithCurrentRatio) + predictedY * blendWithCurrentRatio;

    const currentSpeed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

    return {
      canvasX: smoothedX,
      canvasY: smoothedY,
      pressure: clampScalar(pCurrent.pressure, 0.0, 1.0),
      tiltX: pCurrent.tiltX,
      tiltY: pCurrent.tiltY,
      rotation: pCurrent.rotation,
      speed: currentSpeed,
      timeMs: pCurrent.timeMs,
    };
  }

  /**
   * Generates a C¹ cubic Bézier curve segment between pointIndex 1 and 2 from 4 consecutive points.
   * Formula:
   * C1 = P1 + (P2 - P0) / 6
   * C2 = P2 - (P3 - P1) / 6
   */
  public generateBezierSegment(
    p0: StrokePoint,
    p1: StrokePoint,
    p2: StrokePoint,
    p3: StrokePoint
  ): CubicBezierSegment {
    const anchor0: Point2D = { x: p1.canvasX, y: p1.canvasY };
    const anchor3: Point2D = { x: p2.canvasX, y: p2.canvasY };

    const control1: Point2D = {
      x: p1.canvasX + (p2.canvasX - p0.canvasX) / 6.0,
      y: p1.canvasY + (p2.canvasY - p0.canvasY) / 6.0,
    };

    const control2: Point2D = {
      x: p2.canvasX - (p3.canvasX - p1.canvasX) / 6.0,
      y: p2.canvasY - (p3.canvasY - p1.canvasY) / 6.0,
    };

    return {
      p0: anchor0,
      c1: control1,
      c2: control2,
      p3: anchor3,
      startPressure: p1.pressure,
      endPressure: p2.pressure,
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

  public endStroke(): void {
    this.pointHistory.length = 0;
  }
}
