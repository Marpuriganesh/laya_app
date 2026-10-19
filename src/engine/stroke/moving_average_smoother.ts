/**
 * Moving Average Stroke Smoother
 * Implements a sliding window box filter over incoming raw StrokePoints.
 * Provides uniform tremor suppression with predictable spatial lag.
 */

import type { StrokeSmoothingConfig } from "../../types/brush";
import type { StrokePoint } from "../../types/stroke";
import { clampScalar } from "../math/dynamics_curve";
import type { IStrokeSmoother } from "./stroke_smoother";

export class MovingAverageSmoother implements IStrokeSmoother {
  public readonly mode = "movingAverage";

  private readonly pointWindow: StrokePoint[] = [];
  private lastSmoothedX = 0;
  private lastSmoothedY = 0;

  private readonly config: StrokeSmoothingConfig;

  constructor(config: StrokeSmoothingConfig) {
    this.config = config;
  }

  public beginStroke(initialPoint: StrokePoint): StrokePoint {
    this.pointWindow.length = 0;
    this.pointWindow.push(initialPoint);
    this.lastSmoothedX = initialPoint.canvasX;
    this.lastSmoothedY = initialPoint.canvasY;

    return initialPoint;
  }

  public smooth(rawPoint: StrokePoint, elapsedMs: number): StrokePoint {
    this.pointWindow.push(rawPoint);

    const maxWindow = Math.max(this.config.movingAverageWindowSize, 2);
    while (this.pointWindow.length > maxWindow) {
      this.pointWindow.shift();
    }

    const windowCount = this.pointWindow.length;
    let sumX = 0;
    let sumY = 0;
    let sumPressure = 0;
    let sumTiltX = 0;
    let sumTiltY = 0;

    for (let index = 0; index < windowCount; index++) {
      const point = this.pointWindow[index];
      sumX += point.canvasX;
      sumY += point.canvasY;
      sumPressure += point.pressure;
      sumTiltX += point.tiltX;
      sumTiltY += point.tiltY;
    }

    const inverseCount = 1.0 / windowCount;
    const averageX = sumX * inverseCount;
    const averageY = sumY * inverseCount;
    const averagePressure = clampScalar(sumPressure * inverseCount, 0.0, 1.0);
    const averageTiltX = sumTiltX * inverseCount;
    const averageTiltY = sumTiltY * inverseCount;

    // Calculate speed based on smoothed movement
    const deltaX = averageX - this.lastSmoothedX;
    const deltaY = averageY - this.lastSmoothedY;
    const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const deltaTimeSeconds = Math.max(elapsedMs / 1000.0, 0.001);
    const speed = distanceMoved / deltaTimeSeconds;

    this.lastSmoothedX = averageX;
    this.lastSmoothedY = averageY;

    return {
      canvasX: averageX,
      canvasY: averageY,
      pressure: averagePressure,
      tiltX: averageTiltX,
      tiltY: averageTiltY,
      rotation: rawPoint.rotation,
      speed,
      timeMs: rawPoint.timeMs,
    };
  }

  public endStroke(): void {
    this.pointWindow.length = 0;
  }
}
