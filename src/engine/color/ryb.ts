/**
 * Artist RYB (Red-Yellow-Blue) Color Space Mathematics
 * 1:1 Translatable to C++ / Rust (Zero DOM / framework dependencies)
 *
 * Implements the painter's color wheel (Johannes Itten & Munsell system):
 * - Red (0°), Orange (60°), Yellow (120°), Green (180°), Blue (240°), Purple/Violet (300°)
 * - Exact artistic complements: Blue ↔ Orange, Yellow ↔ Purple, Red ↔ Green
 */

/** Key knot pairs mapping RYB angle [0..360) to RGB Hue angle [0..360) */
const RYB_TO_RGB_KNOTS: readonly [number, number][] = [
  [0, 0],       // Red -> Red (0°)
  [60, 30],     // Orange -> RGB Orange (30°)
  [120, 60],    // Yellow -> RGB Yellow (60°)
  [180, 120],   // Green -> RGB Green (120°)
  [240, 240],   // Blue -> RGB Blue (240°)
  [300, 280],   // Purple/Violet -> RGB Purple (280°)
  [360, 360],   // Wrap around to Red
];

/**
 * Maps an artist RYB wheel angle in degrees [0..360) to a standard RGB Hue angle [0..360).
 * Uses smooth piecewise linear interpolation between Itten color knots.
 */
export function rybHueToRgbHue(rybAngleDeg: number): number {
  const angle = ((rybAngleDeg % 360) + 360) % 360;

  for (let i = 0; i < RYB_TO_RGB_KNOTS.length - 1; i++) {
    const [rybStart, rgbStart] = RYB_TO_RGB_KNOTS[i];
    const [rybEnd, rgbEnd] = RYB_TO_RGB_KNOTS[i + 1];

    if (angle >= rybStart && angle <= rybEnd) {
      const t = (angle - rybStart) / (rybEnd - rybStart);
      return rgbStart + t * (rgbEnd - rgbStart);
    }
  }

  return angle;
}

/**
 * Inverse mapping: converts an RGB Hue angle [0..360) back to an artist RYB angle [0..360).
 */
export function rgbHueToRybHue(rgbAngleDeg: number): number {
  const angle = ((rgbAngleDeg % 360) + 360) % 360;

  for (let i = 0; i < RYB_TO_RGB_KNOTS.length - 1; i++) {
    const [rybStart, rgbStart] = RYB_TO_RGB_KNOTS[i];
    const [rybEnd, rgbEnd] = RYB_TO_RGB_KNOTS[i + 1];

    if (angle >= rgbStart && angle <= rgbEnd) {
      const t = (angle - rgbStart) / (rgbEnd - rgbStart);
      return rybStart + t * (rybEnd - rybStart);
    }
  }

  return angle;
}

/**
 * Computes perceived luminance (Luma Y') according to the ITU-R BT.709 standard.
 * @returns Normalized perceived lightness [0.0..1.0]
 */
export function calculatePerceptualLuma(red: number, green: number, blue: number): number {
  const rNorm = Math.max(0, Math.min(255, red)) / 255;
  const gNorm = Math.max(0, Math.min(255, green)) / 255;
  const bNorm = Math.max(0, Math.min(255, blue)) / 255;

  return 0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm;
}

export interface ColorHarmonyAngles {
  readonly primary: number;
  readonly complement: number;
  readonly splitComplement1: number;
  readonly splitComplement2: number;
  readonly triadic1: number;
  readonly triadic2: number;
  readonly analogous1: number;
  readonly analogous2: number;
}

/**
 * Calculates traditional artist harmonic chord angles for a given RYB hue.
 */
export function calculateRybHarmonies(rybAngleDeg: number): ColorHarmonyAngles {
  const norm = (deg: number) => ((deg % 360) + 360) % 360;

  return {
    primary: norm(rybAngleDeg),
    complement: norm(rybAngleDeg + 180),
    splitComplement1: norm(rybAngleDeg + 150),
    splitComplement2: norm(rybAngleDeg + 210),
    triadic1: norm(rybAngleDeg + 120),
    triadic2: norm(rybAngleDeg + 240),
    analogous1: norm(rybAngleDeg - 30),
    analogous2: norm(rybAngleDeg + 30),
  };
}
