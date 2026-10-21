/**
 * Soft Proofing Transformations
 * Non-destructive simulation of target display gamuts and print environments.
 * 1:1 Translatable to C++ / WGSL.
 */

import type { SoftProofMode } from "@/types/ui";
import { calculatePerceptualLuma } from "./ryb";

/**
 * Converts an RGB color to its exact perceptual photometric grayscale equivalent.
 */
export function applyGrayscaleProof(
  red: number,
  green: number,
  blue: number
): [number, number, number] {
  const luma = calculatePerceptualLuma(red, green, blue);
  const grayByte = Math.round(luma * 255);
  return [grayByte, grayByte, grayByte];
}

/**
 * Simulates standard offset lithography / CMYK ink gamut compression.
 * Subtractive inks cannot achieve high-chroma electric blues or lime greens.
 */
export function applyCmykSimulation(
  red: number,
  green: number,
  blue: number
): [number, number, number] {
  // Convert to rough CMY
  const rNorm = red / 255;
  const gNorm = green / 255;
  const bNorm = blue / 255;

  const k = 1 - Math.max(rNorm, gNorm, bNorm);
  const invK = 1 - k;

  const c = invK === 0 ? 0 : (1 - rNorm - k) / invK;
  const m = invK === 0 ? 0 : (1 - gNorm - k) / invK;
  const y = invK === 0 ? 0 : (1 - bNorm - k) / invK;

  // Simulate ink absorbency & tone compression
  const compressedC = c * 0.92;
  const compressedM = m * 0.94;
  const compressedY = y * 0.95;
  const adjustedK = Math.min(1, k * 1.05);

  // Paper substrate maximum diffuse reflectance (paper is never pure digital 255)
  const PAPER_WHITE_FACTOR = 0.95;

  const finalR = Math.min(255, Math.max(0, Math.round(255 * (1 - compressedC) * (1 - adjustedK) * PAPER_WHITE_FACTOR)));
  const finalG = Math.min(255, Math.max(0, Math.round(255 * (1 - compressedM) * (1 - adjustedK) * PAPER_WHITE_FACTOR)));
  const finalB = Math.min(255, Math.max(0, Math.round(255 * (1 - compressedY) * (1 - adjustedK) * PAPER_WHITE_FACTOR)));

  return [finalR, finalG, finalB];
}

/**
 * Generates the non-destructive display CSS filter for real-time viewport soft proofing.
 */
export function getCssFilterForSoftProof(mode: SoftProofMode): string {
  switch (mode) {
    case "grayscale-values":
      // Standard Rec. 709 photometric grayscale matrix in sRGB space (preserves exact isoluminance)
      return "url(#softproof-values-bw)";
    case "cmyk-print":
      // Simulates ink contrast loss and gamut dampening
      return "saturate(86%) contrast(94%) brightness(98%)";
    case "gamut-warning":
      // Invert + hue-rotate highlight for extreme chromaticity
      return "contrast(120%)";
    case "none":
    default:
      return "none";
  }
}
