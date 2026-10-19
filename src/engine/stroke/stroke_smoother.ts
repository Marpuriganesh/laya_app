/**
 * Stroke Smoother Contract & Factory
 * Defines the standard lifecycle and interface for stroke smoothing algorithms.
 */

import type { SmoothingMode, StrokeSmoothingConfig } from "../../types/brush";
import type { StrokePoint } from "../../types/stroke";

export interface IStrokeSmoother {
  readonly mode: SmoothingMode;

  /**
   * Initializes the smoother state at the start of a pointerdown stroke.
   * @param initialPoint First raw pointer point
   * @returns First smoothed point (usually identical or snapped to initialPoint)
   */
  beginStroke(initialPoint: StrokePoint): StrokePoint;

  /**
   * Processes a new incoming raw pointer event and returns the smoothed point.
   * @param rawPoint Latest raw input point
   * @param elapsedMs Milliseconds elapsed since the previous point
   */
  smooth(rawPoint: StrokePoint, elapsedMs: number): StrokePoint;

  /**
   * Finalizes the stroke on pointerup or pointercancel.
   */
  endStroke(): void;
}

/**
 * Default smoothing configuration matching Procreate and Krita natural stylus feel.
 */
export const DEFAULT_STROKE_SMOOTHING_CONFIG: StrokeSmoothingConfig = {
  mode: "movingAverage",
  streamlineStringRadiusPx: 4.0,
  streamlineBaseSmoothing: 0.15,
  streamlineMaxSmoothing: 0.5,
  streamlineVelocityThresholdPxPerSec: 600.0,
  movingAverageWindowSize: 3,
  predictiveLookAheadFrames: 2,
};

import { StreamlineSmoother } from "./streamline_smoother";
import { MovingAverageSmoother } from "./moving_average_smoother";
import { PredictiveBezierSmoother } from "./predictive_bezier_smoother";

class PassthroughSmoother implements IStrokeSmoother {
  public readonly mode = "none";
  public beginStroke(initialPoint: StrokePoint): StrokePoint {
    return initialPoint;
  }
  public smooth(rawPoint: StrokePoint): StrokePoint {
    return rawPoint;
  }
  public endStroke(): void {}
}

export function createStrokeSmoother(
  config: StrokeSmoothingConfig = DEFAULT_STROKE_SMOOTHING_CONFIG
): IStrokeSmoother {
  switch (config.mode) {
    case "streamline":
      return new StreamlineSmoother(config);
    case "movingAverage":
      return new MovingAverageSmoother(config);
    case "predictiveBezier":
      return new PredictiveBezierSmoother(config);
    case "none":
    default:
      return new PassthroughSmoother();
  }
}
