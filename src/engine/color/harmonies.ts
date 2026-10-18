/**
 * Color Harmony Mathematics (Classic RGB & Artist RYB)
 * Pure, 1:1 translatable to C++ / Rust.
 */

import { rybHueToRgbHue } from "./ryb";
import { hsvToRgb } from "./color_conversions";
import { hsyToRgb } from "./hsy";

export type HarmonyType =
  | "none"
  | "complementary"
  | "split-complementary"
  | "triadic"
  | "tetradic"
  | "analogous";

export interface HarmonyChord {
  readonly label: string;
  readonly angleDeg: number;       // Angle in active wheel space (RGB or RYB)
  readonly rgbHueDeg: number;     // Converted RGB hue angle [0..360)
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Calculates harmonic chord angles for a given base angle in either RGB or RYB space.
 */
export function calculateHarmonyAngles(
  baseAngleDeg: number,
  type: HarmonyType,
  colorSpace: "rgb" | "ryb" = "rgb"
): readonly HarmonyChord[] {
  if (type === "none") return [];

  const base = normalizeAngle(baseAngleDeg);
  const chords: { label: string; angleDeg: number }[] = [];

  switch (type) {
    case "complementary":
      chords.push({ label: "Complement", angleDeg: normalizeAngle(base + 180) });
      break;

    case "split-complementary":
      chords.push(
        { label: "Split 1", angleDeg: normalizeAngle(base + 150) },
        { label: "Split 2", angleDeg: normalizeAngle(base + 210) }
      );
      break;

    case "triadic":
      chords.push(
        { label: "Triad 1", angleDeg: normalizeAngle(base + 120) },
        { label: "Triad 2", angleDeg: normalizeAngle(base + 240) }
      );
      break;

    case "tetradic":
      chords.push(
        { label: "Tetrad 1", angleDeg: normalizeAngle(base + 90) },
        { label: "Tetrad 2", angleDeg: normalizeAngle(base + 180) },
        { label: "Tetrad 3", angleDeg: normalizeAngle(base + 270) }
      );
      break;

    case "analogous":
      chords.push(
        { label: "Analogous -", angleDeg: normalizeAngle(base - 30) },
        { label: "Analogous +", angleDeg: normalizeAngle(base + 30) }
      );
      break;
  }

  return chords.map((chord) => ({
    label: chord.label,
    angleDeg: chord.angleDeg,
    rgbHueDeg: colorSpace === "ryb" ? rybHueToRgbHue(chord.angleDeg) : chord.angleDeg,
  }));
}

export interface HarmonySwatchItem {
  readonly label: string;
  readonly hex: string;
  readonly rgb: [number, number, number];
}

/**
 * Generates live preview swatches for the primary color and all its harmonic chords.
 */
export function generateHarmonySwatches(
  baseAngleDeg: number,
  type: HarmonyType,
  colorSpace: "rgb" | "ryb",
  saturation: number,
  valueOrLuma: number,
  isHsyMode: boolean = false
): readonly HarmonySwatchItem[] {
  const chords = calculateHarmonyAngles(baseAngleDeg, type, colorSpace);
  const baseRgbHue = colorSpace === "ryb" ? rybHueToRgbHue(baseAngleDeg) : baseAngleDeg;

  const rgbToHexStr = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

  const computeRgb = (rgbHue: number): [number, number, number] => {
    if (isHsyMode) {
      return hsyToRgb(rgbHue, saturation, valueOrLuma);
    }
    return hsvToRgb(rgbHue, saturation, valueOrLuma);
  };

  const primaryRgb = computeRgb(baseRgbHue);
  const result: HarmonySwatchItem[] = [
    {
      label: "Base",
      rgb: primaryRgb,
      hex: rgbToHexStr(primaryRgb[0], primaryRgb[1], primaryRgb[2]),
    },
  ];

  for (const chord of chords) {
    const chordRgb = computeRgb(chord.rgbHueDeg);
    result.push({
      label: chord.label,
      rgb: chordRgb,
      hex: rgbToHexStr(chordRgb[0], chordRgb[1], chordRgb[2]),
    });
  }

  return result;
}

export interface ProcreateHarmonyItem {
  readonly id: string;
  readonly label: string;
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
  readonly hex: string;
  readonly rgb: [number, number, number];
  readonly isPrimary: boolean;
}

/**
 * Calculates Procreate-style color harmony items (primary + companion chords)
 * with complete HSV, RGB, and Hex coordinates.
 */
export function calculateProcreateHarmonyItems(
  hue: number,
  saturation: number,
  value: number,
  type: HarmonyType
): readonly ProcreateHarmonyItem[] {
  const [pr, pg, pb] = hsvToRgb(hue, saturation, value);
  const rgbToHexStr = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

  const primaryItem: ProcreateHarmonyItem = {
    id: "primary",
    label: "Primary",
    hue,
    saturation,
    value,
    hex: rgbToHexStr(pr, pg, pb),
    rgb: [pr, pg, pb],
    isPrimary: true,
  };

  if (type === "none") {
    return [primaryItem];
  }

  const chords = calculateHarmonyAngles(hue, type, "rgb");
  const items: ProcreateHarmonyItem[] = [primaryItem];

  chords.forEach((chord, idx) => {
    const chordHue = chord.rgbHueDeg;
    const [r, g, b] = hsvToRgb(chordHue, saturation, value);
    items.push({
      id: `chord-${idx}`,
      label: chord.label,
      hue: chordHue,
      saturation,
      value,
      hex: rgbToHexStr(r, g, b),
      rgb: [r, g, b],
      isPrimary: false,
    });
  });

  return items;
}

