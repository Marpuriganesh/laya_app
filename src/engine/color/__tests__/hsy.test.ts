import { describe, it, expect } from "vitest";
import { hsyToRgb, calculateLuma } from "../hsy";
import { applyGrayscaleProof } from "../soft_proofing";

describe("HSY' Isoluminant Color Space (Krita Artistic Selector)", () => {
  it("generates pure neutral gray when saturation is 0", () => {
    const [r, g, b] = hsyToRgb(60, 0.0, 0.5);
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it("handles pure black (Y'=0) and pure white (Y'=1)", () => {
    expect(hsyToRgb(120, 1.0, 0.0)).toEqual([0, 0, 0]);
    expect(hsyToRgb(240, 1.0, 1.0)).toEqual([255, 255, 255]);
  });

  it("guarantees constant perceived luma across ALL hues at target luma = 0.5", () => {
    const targetLuma = 0.5;
    const testHues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    for (const hue of testHues) {
      // Test at full saturation and mid saturation
      for (const sat of [0.3, 0.7, 1.0]) {
        const [r, g, b] = hsyToRgb(hue, sat, targetLuma);
        const luma = calculateLuma(r, g, b);

        // Within 1/255 integer byte precision (~0.004)
        expect(luma).toBeCloseTo(targetLuma, 2);

        // When soft-proofed in B&W, every color must produce 128 (50% gray)
        const [grayR, grayG, grayB] = applyGrayscaleProof(r, g, b);
        expect(Math.abs(grayR - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(grayG - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(grayB - 128)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("guarantees constant perceived luma across ALL hues at high key (Y'=0.8)", () => {
    const targetLuma = 0.8;
    const testHues = [0, 60, 120, 180, 240, 300];

    for (const hue of testHues) {
      const [r, g, b] = hsyToRgb(hue, 1.0, targetLuma);
      const luma = calculateLuma(r, g, b);
      expect(luma).toBeCloseTo(targetLuma, 2);

      const [grayR] = applyGrayscaleProof(r, g, b);
      expect(Math.abs(grayR - Math.round(0.8 * 255))).toBeLessThanOrEqual(1);
    }
  });

  it("guarantees constant perceived luma across ALL hues at low key (Y'=0.25)", () => {
    const targetLuma = 0.25;
    const testHues = [0, 60, 120, 180, 240, 300];

    for (const hue of testHues) {
      const [r, g, b] = hsyToRgb(hue, 0.8, targetLuma);
      const luma = calculateLuma(r, g, b);
      expect(luma).toBeCloseTo(targetLuma, 2);

      const [grayR] = applyGrayscaleProof(r, g, b);
      expect(Math.abs(grayR - Math.round(0.25 * 255))).toBeLessThanOrEqual(1);
    }
  });
});
