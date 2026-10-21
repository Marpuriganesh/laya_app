/**
 * Dynamics Curve Math & Response Evaluation
 * Evaluates Krita, Procreate, and Photoshop-style dynamics response curves for brush sensors.
 * Implements Steffen Monotonic Cubic Spline Interpolation for smooth, non-oscillating curves.
 * 100% pure, side-effect free algorithmic module (1:1 translatable to Rust/C++).
 */

import type { DynamicsCurvePoint, DynamicsMapping } from "../../types/brush";

/**
 * Universal control point for a 2D response curve in normalized space [0.0 .. 1.0].
 */
export interface CurvePoint {
  readonly x: number; // Normalized input [0.0 .. 1.0] (e.g. raw pressure, speed)
  readonly y: number; // Normalized output [0.0 .. 1.0] (e.g. scaled size, opacity)
}

/**
 * Clamps a number to the range [minimum, maximum].
 */
export function clampScalar(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/**
 * Sorts and deduplicates curve points by x-coordinate, ensuring endpoints exist.
 */
export function sanitizeCurvePoints(points: readonly CurvePoint[]): CurvePoint[] {
  if (points.length === 0) {
    return [
      { x: 0.0, y: 0.0 },
      { x: 1.0, y: 1.0 },
    ];
  }

  // Clone and sort by x ascending
  const sorted = [...points].map((p) => ({
    x: clampScalar(p.x, 0.0, 1.0),
    y: clampScalar(p.y, 0.0, 1.0),
  })).sort((a, b) => a.x - b.x);

  // Remove duplicate x coordinates (keep later point)
  const deduped: CurvePoint[] = [];
  for (const pt of sorted) {
    if (deduped.length > 0 && Math.abs(deduped[deduped.length - 1].x - pt.x) < 1e-4) {
      deduped[deduped.length - 1] = pt;
    } else {
      deduped.push(pt);
    }
  }

  // Ensure first point starts at x=0
  if (deduped[0].x > 0.0) {
    deduped.unshift({ x: 0.0, y: deduped[0].y });
  }

  // Ensure last point ends at x=1
  if (deduped[deduped.length - 1].x < 1.0) {
    deduped.push({ x: 1.0, y: deduped[deduped.length - 1].y });
  }

  return deduped;
}

/**
 * Evaluates a smooth curve using Steffen's Monotonic Cubic Spline Interpolation.
 * Formula:
 *   Steffen M. (1990) "A Simple Method for Monotonic Interpolation in One Dimension",
 *   Astronomy and Astrophysics, 239, 443-450.
 *
 * Steffen's method guarantees that the interpolated curve is strictly monotonic in intervals
 * where the data is monotonic, preventing extraneous oscillations and overshoots above 1.0 or below 0.0.
 *
 * @param points Array of control points in [0, 1]
 * @param input Normalized input value in [0, 1]
 * @returns Smooth evaluated output in [0, 1]
 */
export function evaluateMonotonicCurve(points: readonly CurvePoint[], input: number): number {
  const sanitized = sanitizeCurvePoints(points);
  const clampedX = clampScalar(input, 0.0, 1.0);
  const n = sanitized.length;

  if (clampedX <= sanitized[0].x) return sanitized[0].y;
  if (clampedX >= sanitized[n - 1].x) return sanitized[n - 1].y;

  // 1. Calculate secant slopes (delta_i = (y_{i+1} - y_i) / h_i)
  const h: number[] = new Array(n - 1);
  const delta: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = sanitized[i + 1].x - sanitized[i].x;
    delta[i] = h[i] > 1e-6 ? (sanitized[i + 1].y - sanitized[i].y) / h[i] : 0.0;
  }

  // 2. Calculate Steffen slopes (d_i) at each knot
  const d: number[] = new Array(n);
  // Endpoints
  d[0] = delta[0];
  d[n - 1] = delta[n - 2];

  // Interior knots
  for (let i = 1; i < n - 1; i++) {
    const p = (delta[i - 1] * h[i] + delta[i] * h[i - 1]) / (h[i - 1] + h[i]);
    if (delta[i - 1] * delta[i] <= 0.0) {
      d[i] = 0.0; // Local extremum: flatten slope to avoid overshoot
    } else {
      const signDelta = delta[i] >= 0.0 ? 1.0 : -1.0;
      d[i] =
        signDelta *
        Math.min(
          Math.abs(delta[i - 1]),
          Math.abs(delta[i]),
          0.5 * Math.abs(p)
        );
    }
  }

  // 3. Find the bounding interval [k, k+1]
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    if (clampedX >= sanitized[i].x && clampedX <= sanitized[i + 1].x) {
      k = i;
      break;
    }
  }

  const intervalH = h[k];
  if (intervalH < 1e-6) return sanitized[k].y;

  const dx = clampedX - sanitized[k].x;
  const c2 = (3.0 * delta[k] - 2.0 * d[k] - d[k + 1]) / intervalH;
  const c3 = (d[k] + d[k + 1] - 2.0 * delta[k]) / (intervalH * intervalH);

  const result = sanitized[k].y + d[k] * dx + c2 * dx * dx + c3 * dx * dx * dx;
  return clampScalar(result, 0.0, 1.0);
}

/**
 * Precomputes an ultra-fast 256-sample lookup table (LUT) from curve points.
 * Hot rendering loops (Rust dab stamping, Wasm, shaders) query this in O(1) time:
 *   output = lut[(pressure * 255.0).round()]
 */
export function generateCurveLookupTable256(points: readonly CurvePoint[]): Float32Array {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const inputRatio = i / 255.0;
    lut[i] = evaluateMonotonicCurve(points, inputRatio);
  }
  return lut;
}

/**
 * Generates an SVG path string ('M x y C ...') for smooth rendering in UI widgets.
 * Scales normalized [0..1] points to target pixel dimensions.
 */
export function generateSvgPathFromCurve(
  points: readonly CurvePoint[],
  pixelWidth: number,
  pixelHeight: number,
  samples: number = 64
): string {
  if (samples < 2) samples = 64;
  let path = "";

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const yVal = evaluateMonotonicCurve(points, t);
    // SVG y coordinates are inverted (0 at top, height at bottom)
    const px = t * pixelWidth;
    const py = (1.0 - yVal) * pixelHeight;

    if (i === 0) {
      path += `M ${px.toFixed(2)} ${py.toFixed(2)}`;
    } else {
      path += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
    }
  }

  return path;
}

// ============================================================================
// Standard Response Curve Presets
// ============================================================================

/**
 * 1:1 Linear Curve: default direct pressure response.
 */
export function createLinearCurve(): CurvePoint[] {
  return [
    { x: 0.0, y: 0.0 },
    { x: 1.0, y: 1.0 },
  ];
}

/**
 * Soft Response Curve: high initial sensitivity (gentle touch yields broad dabs).
 */
export function createSoftCurve(): CurvePoint[] {
  return [
    { x: 0.0, y: 0.0 },
    { x: 0.25, y: 0.55 },
    { x: 0.65, y: 0.88 },
    { x: 1.0, y: 1.0 },
  ];
}

/**
 * Firm Response Curve: requires firm stylus pressure before reaching max width.
 */
export function createFirmCurve(): CurvePoint[] {
  return [
    { x: 0.0, y: 0.0 },
    { x: 0.35, y: 0.12 },
    { x: 0.75, y: 0.50 },
    { x: 1.0, y: 1.0 },
  ];
}

/**
 * S-Curve: subtle low end with rapid high-contrast midtones (Procreate standard).
 */
export function createSCurve(): CurvePoint[] {
  return [
    { x: 0.0, y: 0.0 },
    { x: 0.30, y: 0.15 },
    { x: 0.70, y: 0.85 },
    { x: 1.0, y: 1.0 },
  ];
}

/**
 * Deadzone Curve: ignores faint initial resting touches (<10% pressure).
 */
export function createDeadzoneCurve(): CurvePoint[] {
  return [
    { x: 0.0, y: 0.0 },
    { x: 0.10, y: 0.0 },
    { x: 0.60, y: 0.55 },
    { x: 1.0, y: 1.0 },
  ];
}

// ============================================================================
// Backward Compatibility with legacy DynamicsCurvePoint
// ============================================================================

export function evaluatePiecewiseLinearCurve(
  curvePoints: readonly DynamicsCurvePoint[],
  sensorInputValue: number
): number {
  if (curvePoints.length === 0) {
    return clampScalar(sensorInputValue, 0.0, 1.0);
  }
  const points = curvePoints.map((p) => ({ x: p.inputValue, y: p.outputValue }));
  return evaluateMonotonicCurve(points, sensorInputValue);
}

export function createLinearDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

export function createEaseInDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 0.5, outputValue: 0.25 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

export function createEaseOutDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 0.5, outputValue: 0.75 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

export function evaluateDynamicsCurve(
  mappingOrPoints: DynamicsMapping | readonly DynamicsCurvePoint[] | null | undefined,
  sensorInputValue: number,
  fallbackValue: number = 1.0
): number {
  if (!mappingOrPoints) {
    return fallbackValue;
  }

  if ("isEnabled" in mappingOrPoints) {
    if (!mappingOrPoints.isEnabled) {
      return fallbackValue;
    }
    return evaluatePiecewiseLinearCurve(mappingOrPoints.curvePoints, sensorInputValue);
  }

  return evaluatePiecewiseLinearCurve(mappingOrPoints, sensorInputValue);
}
