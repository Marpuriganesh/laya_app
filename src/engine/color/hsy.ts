/**
 * HSY' (Hue, Saturation, Perceptual Luma) Color Space Mathematics
 *
 * Implements Krita's isoluminant color generation (Rec. 709 photometric standard):
 * - Luma Y' = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * - Guarantees that for ANY hue and ANY saturation at a given target luma Y',
 *   the perceived brightness is mathematically identical.
 * - In black & white / soft-proofing, all colors on the isoluminant wheel evaluate
 *   to the EXACT same gray value.
 *
 * 1:1 Translatable to C++ / Rust (Zero DOM / framework dependencies).
 */

// Rec. 709 photometric coefficients
export const LUMA_WEIGHT_RED = 0.2126;
export const LUMA_WEIGHT_GREEN = 0.7152;
export const LUMA_WEIGHT_BLUE = 0.0722;

/**
 * Computes pure chroma coordinates (R0, G0, B0) for a given RGB hue angle [0..360).
 * At least one channel is 1.0, at least one is 0.0.
 */
export function getPureHueRgb(hueDeg: number): [number, number, number] {
  const normHue = ((hueDeg % 360) + 360) % 360;
  const hSector = normHue / 60;
  const x = 1 - Math.abs((hSector % 2) - 1);

  if (hSector < 1) return [1, x, 0];
  if (hSector < 2) return [x, 1, 0];
  if (hSector < 3) return [0, 1, x];
  if (hSector < 4) return [0, x, 1];
  if (hSector < 5) return [x, 0, 1];
  return [1, 0, x];
}

/**
 * Converts HSY' coordinates to RGB [0..255].
 *
 * @param hueDeg RGB Hue angle in degrees [0..360)
 * @param saturation Saturation ratio [0.0..1.0] (0 = neutral gray, 1 = max in-gamut saturation)
 * @param targetLuma Target perceived luminance [0.0..1.0]
 * @returns [red, green, blue] in range [0..255]
 */
export function hsyToRgb(
  hueDeg: number,
  saturation: number,
  targetLuma: number
): [number, number, number] {
  const yTarget = Math.max(0.0, Math.min(1.0, targetLuma));
  const sat = Math.max(0.0, Math.min(1.0, saturation));

  // If target luma is pure black or pure white, or saturation is 0, return exact neutral gray
  if (yTarget <= 0.0) return [0, 0, 0];
  if (yTarget >= 1.0) return [255, 255, 255];
  if (sat <= 0.0) {
    const grayByte = Math.round(yTarget * 255);
    return [grayByte, grayByte, grayByte];
  }

  // 1. Calculate pure hue chroma vector
  const [r0, g0, b0] = getPureHueRgb(hueDeg);
  const y0 = LUMA_WEIGHT_RED * r0 + LUMA_WEIGHT_GREEN * g0 + LUMA_WEIGHT_BLUE * b0;

  // 2. The chroma delta vector (r0 - y0, g0 - y0, b0 - y0) has exactly zero luma:
  //    wR*(r0-y0) + wG*(g0-y0) + wB*(b0-y0) = y0 - y0 = 0.
  const deltaR = r0 - y0;
  const deltaG = g0 - y0;
  const deltaB = b0 - y0;

  // 3. Find the maximum chroma scale Cmax such that 0 <= yTarget + C * delta <= 1 for all channels
  let maxScale = Number.POSITIVE_INFINITY;

  // Red boundary
  if (deltaR > 1e-6) {
    maxScale = Math.min(maxScale, (1.0 - yTarget) / deltaR);
  } else if (deltaR < -1e-6) {
    maxScale = Math.min(maxScale, -yTarget / deltaR);
  }

  // Green boundary
  if (deltaG > 1e-6) {
    maxScale = Math.min(maxScale, (1.0 - yTarget) / deltaG);
  } else if (deltaG < -1e-6) {
    maxScale = Math.min(maxScale, -yTarget / deltaG);
  }

  // Blue boundary
  if (deltaB > 1e-6) {
    maxScale = Math.min(maxScale, (1.0 - yTarget) / deltaB);
  } else if (deltaB < -1e-6) {
    maxScale = Math.min(maxScale, -yTarget / deltaB);
  }

  // Scale chroma by requested saturation
  const scale = sat * maxScale;

  const rNorm = yTarget + scale * deltaR;
  const gNorm = yTarget + scale * deltaG;
  const bNorm = yTarget + scale * deltaB;

  // Clamp and convert to 8-bit bytes
  const finalR = Math.max(0, Math.min(255, Math.round(rNorm * 255)));
  const finalG = Math.max(0, Math.min(255, Math.round(gNorm * 255)));
  const finalB = Math.max(0, Math.min(255, Math.round(bNorm * 255)));

  return [finalR, finalG, finalB];
}

/**
 * Calculates perceived luma for RGB bytes [0..255].
 */
export function calculateLuma(red: number, green: number, blue: number): number {
  const rNorm = Math.max(0, Math.min(255, red)) / 255;
  const gNorm = Math.max(0, Math.min(255, green)) / 255;
  const bNorm = Math.max(0, Math.min(255, blue)) / 255;

  return LUMA_WEIGHT_RED * rNorm + LUMA_WEIGHT_GREEN * gNorm + LUMA_WEIGHT_BLUE * bNorm;
}
