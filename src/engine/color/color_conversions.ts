/**
 * Pure Color Space Conversion Functions
 * 1:1 translatable to C++ / Rust / WGSL
 * Zero framework or DOM dependencies.
 */

/**
 * Converts HSV color values to RGB [0..255].
 * @param hue - Angle in degrees [0..360)
 * @param saturation - Normalized saturation [0..1]
 * @param value - Normalized brightness/value [0..1]
 * @returns [red, green, blue] tuple in range [0..255]
 */
export function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const clampedSaturation = Math.max(0, Math.min(1, saturation));
  const clampedValue = Math.max(0, Math.min(1, value));

  const chroma = clampedValue * clampedSaturation;
  const hueSegment = normalizedHue / 60;
  const secondaryComponent = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const matchValue = clampedValue - chroma;

  let rPrime: number;
  let gPrime: number;
  let bPrime: number;

  if (hueSegment >= 0 && hueSegment < 1) {
    rPrime = chroma;
    gPrime = secondaryComponent;
    bPrime = 0;
  } else if (hueSegment >= 1 && hueSegment < 2) {
    rPrime = secondaryComponent;
    gPrime = chroma;
    bPrime = 0;
  } else if (hueSegment >= 2 && hueSegment < 3) {
    rPrime = 0;
    gPrime = chroma;
    bPrime = secondaryComponent;
  } else if (hueSegment >= 3 && hueSegment < 4) {
    rPrime = 0;
    gPrime = secondaryComponent;
    bPrime = chroma;
  } else if (hueSegment >= 4 && hueSegment < 5) {
    rPrime = secondaryComponent;
    gPrime = 0;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    gPrime = 0;
    bPrime = secondaryComponent;
  }

  return [
    Math.round((rPrime + matchValue) * 255),
    Math.round((gPrime + matchValue) * 255),
    Math.round((bPrime + matchValue) * 255),
  ];
}

/**
 * Converts RGB [0..255] color values to HSV.
 * @param red - [0..255]
 * @param green - [0..255]
 * @param blue - [0..255]
 * @returns [hue (0..360), saturation (0..1), value (0..1)]
 */
export function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const rNorm = Math.max(0, Math.min(255, red)) / 255;
  const gNorm = Math.max(0, Math.min(255, green)) / 255;
  const bNorm = Math.max(0, Math.min(255, blue)) / 255;

  const maxVal = Math.max(rNorm, gNorm, bNorm);
  const minVal = Math.min(rNorm, gNorm, bNorm);
  const delta = maxVal - minVal;

  let hue = 0;
  if (delta > 0) {
    if (maxVal === rNorm) {
      hue = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (maxVal === gNorm) {
      hue = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      hue = 60 * ((rNorm - gNorm) / delta + 4);
    }
    if (hue < 0) hue += 360;
  }

  const saturation = maxVal === 0 ? 0 : delta / maxVal;
  const value = maxVal;

  return [Math.round(hue), saturation, value];
}

/**
 * Converts RGB values to a 7-character hexadecimal string '#RRGGBB'.
 */
export function rgbToHex(red: number, green: number, blue: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const toHex = (c: number) => clamp(c).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * Parses a Hex color string ('#RGB' or '#RRGGBB') to RGB [0..255] tuple.
 */
export function hexToRgb(hexString: string): [number, number, number] | null {
  const cleanHex = hexString.replace(/^#/, "").trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}
