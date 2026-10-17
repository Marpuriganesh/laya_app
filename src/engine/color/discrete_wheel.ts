/**
 * Discrete Color Wheel & Value Ladder Mathematics (Krita Artistic Color Selector)
 * Pure, 1:1 translatable to C++ / Rust.
 */

export interface DiscreteWheelConfig {
  readonly hueSectors: number;      // e.g. 12 (Itten), 16, 24, 36
  readonly saturationRings: number; // e.g. 2..10 (default 4)
  readonly valueSteps: number;      // e.g. 4..20 (default 8)
  readonly isContinuous: boolean;   // true = smooth gradient, false = discrete steps
}

export const DEFAULT_DISCRETE_WHEEL_CONFIG: DiscreteWheelConfig = {
  hueSectors: 12,
  saturationRings: 4,
  valueSteps: 8,
  isContinuous: false,
};

/**
 * Normalizes any angle in degrees to [0.0..360.0).
 */
export function normalizeAngleDegrees(angleDeg: number): number {
  return ((angleDeg % 360) + 360) % 360;
}

/**
 * Quantizes an RYB angle into a discrete hue sector index and center angle.
 */
export function quantizeRybHue(
  angleDeg: number,
  hueSectors: number
): { readonly sectorIndex: number; readonly quantizedAngle: number } {
  const sectors = Math.max(3, Math.min(72, hueSectors));
  const sectorSpan = 360 / sectors;
  const normalized = normalizeAngleDegrees(angleDeg);

  const sectorIndex = Math.floor(normalized / sectorSpan) % sectors;
  const quantizedAngle = (sectorIndex + 0.5) * sectorSpan;

  return { sectorIndex, quantizedAngle };
}

/**
 * Quantizes saturation [0.0..1.0] into a discrete ring index and discrete saturation level.
 */
export function quantizeSaturation(
  satNormalized: number,
  saturationRings: number
): { readonly ringIndex: number; readonly quantizedSat: number; readonly isCenterGray: boolean } {
  const rings = Math.max(1, Math.min(20, saturationRings));
  const clampedSat = Math.max(0, Math.min(1, satNormalized));

  // If in the inner neutral core (< 15% distance), it is pure neutral gray
  const centerThreshold = 0.15;
  if (clampedSat < centerThreshold) {
    return { ringIndex: -1, quantizedSat: 0.0, isCenterGray: true };
  }

  // Map remaining range [centerThreshold..1.0] across rings
  const ringRatio = (clampedSat - centerThreshold) / (1 - centerThreshold);
  const ringIndex = Math.min(rings - 1, Math.max(0, Math.floor(ringRatio * rings)));
  // Use ring radial centroid (midpoint between inner and outer ring boundaries)
  const quantizedSat = (ringIndex + 0.5) / rings;

  return { ringIndex, quantizedSat, isCenterGray: false };
}

/**
 * Quantizes value/lightness [0.0..1.0] into discrete steps across the tonal range [0.0..1.0].
 */
export function quantizeValue(
  valueNormalized: number,
  valueSteps: number
): { readonly stepIndex: number; readonly quantizedValue: number } {
  const steps = Math.max(2, Math.min(32, valueSteps));
  const clampedVal = Math.max(0, Math.min(1, valueNormalized));

  const stepIndex = Math.min(steps - 1, Math.max(0, Math.round(clampedVal * (steps - 1))));
  const quantizedValue = stepIndex / (steps - 1);

  return { stepIndex, quantizedValue };
}

/**
 * Generates an array of discrete value levels [0.0..1.0] from white to black (or vice versa).
 */
export function generateDiscreteValueSteps(valueSteps: number): readonly number[] {
  const steps = Math.max(2, Math.min(32, valueSteps));
  const result: number[] = new Array(steps);

  for (let i = 0; i < steps; i++) {
    result[i] = i / (steps - 1);
  }

  return result;
}
