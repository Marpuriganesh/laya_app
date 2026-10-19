/**
 * Streamline / Pull-String Stroke Smoother
 * Implements Procreate and Clip Studio Paint style pull-string stabilization with velocity adaptation.
 *
 * Physics & Algorithmic Principle:
 * 1. An anchor point trails behind the physical stylus tip by up to `streamlineStringRadiusPx`.
 * 2. When the stylus moves further than the string radius, the anchor is pulled along the string vector.
 * 3. Velocity adaptation: Fast sweeps receive stronger smoothing (eliminates nervous arm jitter),
 *    while slow, delicate movements have minimal lag (allows drawing sharp corners and fine details).
 * 4. Exponential moving average (EMA) is applied to both position and stylus pressure to filter noise.
 */

import type { StrokeSmoothingConfig } from "../../types/brush";
import type { StrokePoint } from "../../types/stroke";
import { clampScalar } from "../math/dynamics_curve";
import type { IStrokeSmoother } from "./stroke_smoother";

export class StreamlineSmoother implements IStrokeSmoother {
  public readonly mode = "streamline";

  private anchorX = 0;
  private anchorY = 0;
  private anchorPressure = 0;
  private lastRawX = 0;
  private lastRawY = 0;
  private isStrokeActive = false;

  private readonly config: StrokeSmoothingConfig;

  constructor(config: StrokeSmoothingConfig) {
    this.config = config;
  }

  /**
   * Snaps the anchor directly to the initial point to prevent starting lag.
   */
  public beginStroke(initialPoint: StrokePoint): StrokePoint {
    this.anchorX = initialPoint.canvasX;
    this.anchorY = initialPoint.canvasY;
    this.anchorPressure = initialPoint.pressure;
    this.lastRawX = initialPoint.canvasX;
    this.lastRawY = initialPoint.canvasY;
    this.isStrokeActive = true;

    return {
      canvasX: this.anchorX,
      canvasY: this.anchorY,
      pressure: this.anchorPressure,
      tiltX: initialPoint.tiltX,
      tiltY: initialPoint.tiltY,
      rotation: initialPoint.rotation,
      speed: 0,
      timeMs: initialPoint.timeMs,
    };
  }

  /**
   * Applies the pull-string constraint and velocity-adaptive EMA.
   */
  public smooth(rawPoint: StrokePoint, elapsedMs: number): StrokePoint {
    if (!this.isStrokeActive) {
      return this.beginStroke(rawPoint);
    }

    // 1. Calculate physical pointer velocity
    const deltaXFromLastRaw = rawPoint.canvasX - this.lastRawX;
    const deltaYFromLastRaw = rawPoint.canvasY - this.lastRawY;
    const rawMovementDistance = Math.sqrt(deltaXFromLastRaw * deltaXFromLastRaw + deltaYFromLastRaw * deltaYFromLastRaw);

    const deltaTimeSeconds = Math.max(elapsedMs / 1000.0, 0.001);
    const strokeSpeed = rawMovementDistance / deltaTimeSeconds;

    // 2. Velocity-adaptive smoothing factor
    // High speed -> high smoothing (fluid arcs)
    // Low speed -> low smoothing (crisp detail)
    const velocityRatio = clampScalar(
      strokeSpeed / Math.max(this.config.streamlineVelocityThresholdPxPerSec, 1.0),
      0.0,
      1.0
    );

    const smoothingStrength =
      this.config.streamlineBaseSmoothing +
      (this.config.streamlineMaxSmoothing - this.config.streamlineBaseSmoothing) * velocityRatio;

    // Responsive catch-up factor (inverse of smoothing strength)
    const catchUpFactor = 1.0 - clampScalar(smoothingStrength, 0.0, 0.95);

    // 3. Pull-string physical constraint
    const deltaXFromAnchor = rawPoint.canvasX - this.anchorX;
    const deltaYFromAnchor = rawPoint.canvasY - this.anchorY;
    const distanceFromAnchor = Math.sqrt(deltaXFromAnchor * deltaXFromAnchor + deltaYFromAnchor * deltaYFromAnchor);

    if (distanceFromAnchor > this.config.streamlineStringRadiusPx && distanceFromAnchor > 1e-4) {
      // Pull anchor along string vector toward pointer
      const stringSlackExceeded = distanceFromAnchor - this.config.streamlineStringRadiusPx;
      const pullRatio = stringSlackExceeded / distanceFromAnchor;
      this.anchorX += deltaXFromAnchor * pullRatio;
      this.anchorY += deltaYFromAnchor * pullRatio;
    }

    // 4. Exponential moving average toward current pointer position
    this.anchorX += (rawPoint.canvasX - this.anchorX) * catchUpFactor;
    this.anchorY += (rawPoint.canvasY - this.anchorY) * catchUpFactor;

    // 5. Exponential moving average on pressure to suppress hardware noise spikes
    const pressureCatchUpFactor = 0.35;
    this.anchorPressure += (rawPoint.pressure - this.anchorPressure) * pressureCatchUpFactor;

    // Update tracking history
    this.lastRawX = rawPoint.canvasX;
    this.lastRawY = rawPoint.canvasY;

    return {
      canvasX: this.anchorX,
      canvasY: this.anchorY,
      pressure: clampScalar(this.anchorPressure, 0.0, 1.0),
      tiltX: rawPoint.tiltX,
      tiltY: rawPoint.tiltY,
      rotation: rawPoint.rotation,
      speed: strokeSpeed,
      timeMs: rawPoint.timeMs,
    };
  }

  public endStroke(): void {
    this.isStrokeActive = false;
  }
}
