import { describe, it, expect } from "vitest";
import {
  rybHueToRgbHue,
  rgbHueToRybHue,
  calculatePerceptualLuma,
  calculateRybHarmonies,
} from "../ryb";

describe("Artist RYB Color Space Mathematics", () => {
  describe("rybHueToRgbHue knot conversions", () => {
    it("maps Itten primary Red (0°) to RGB Red (0°)", () => {
      expect(rybHueToRgbHue(0)).toBeCloseTo(0);
    });

    it("maps Itten secondary Orange (60°) to RGB Orange (30°)", () => {
      expect(rybHueToRgbHue(60)).toBeCloseTo(30);
    });

    it("maps Itten primary Yellow (120°) to RGB Yellow (60°)", () => {
      expect(rybHueToRgbHue(120)).toBeCloseTo(60);
    });

    it("maps Itten secondary Green (180°) to RGB Green (120°)", () => {
      expect(rybHueToRgbHue(180)).toBeCloseTo(120);
    });

    it("maps Itten primary Blue (240°) to RGB Blue (240°)", () => {
      expect(rybHueToRgbHue(240)).toBeCloseTo(240);
    });

    it("maps Itten secondary Purple/Violet (300°) to RGB Purple (280°)", () => {
      expect(rybHueToRgbHue(300)).toBeCloseTo(280);
    });

    it("handles negative angles and full wrap around modulo 360", () => {
      expect(rybHueToRgbHue(360)).toBeCloseTo(0);
      expect(rybHueToRgbHue(720)).toBeCloseTo(0);
      expect(rybHueToRgbHue(-60)).toBeCloseTo(280);
    });
  });

  describe("rgbHueToRybHue inverse conversions", () => {
    it("inverts RGB Yellow (60°) back to RYB Yellow (120°)", () => {
      expect(rgbHueToRybHue(60)).toBeCloseTo(120);
    });

    it("inverts RGB Orange (30°) back to RYB Orange (60°)", () => {
      expect(rgbHueToRybHue(30)).toBeCloseTo(60);
    });

    it("round-trips key hues consistently", () => {
      const testAngles = [0, 60, 120, 180, 240, 300];
      for (const rybAngle of testAngles) {
        const rgb = rybHueToRgbHue(rybAngle);
        const backToRyb = rgbHueToRybHue(rgb);
        expect(backToRyb).toBeCloseTo(rybAngle, 1);
      }
    });
  });

  describe("calculatePerceptualLuma (Rec. 709 photometric lightness)", () => {
    it("calculates 0.0 for pure black and 1.0 for pure white", () => {
      expect(calculatePerceptualLuma(0, 0, 0)).toBeCloseTo(0.0);
      expect(calculatePerceptualLuma(255, 255, 255)).toBeCloseTo(1.0);
    });

    it("verifies pure yellow has much higher perceived luma than pure blue", () => {
      const yellowLuma = calculatePerceptualLuma(255, 255, 0);
      const blueLuma = calculatePerceptualLuma(0, 0, 255);

      // Yellow: 0.2126 + 0.7152 = 0.9278
      // Blue: 0.0722
      expect(yellowLuma).toBeCloseTo(0.9278, 2);
      expect(blueLuma).toBeCloseTo(0.0722, 2);
      expect(yellowLuma).toBeGreaterThan(blueLuma * 10);
    });
  });

  describe("calculateRybHarmonies", () => {
    it("computes accurate painter's complementary pairs (180° apart)", () => {
      // Blue (240°) complement in RYB is Orange (60°)
      const blueHarmonies = calculateRybHarmonies(240);
      expect(blueHarmonies.complement).toBeCloseTo(60);

      // Yellow (120°) complement is Purple (300°)
      const yellowHarmonies = calculateRybHarmonies(120);
      expect(yellowHarmonies.complement).toBeCloseTo(300);

      // Red (0°) complement is Green (180°)
      const redHarmonies = calculateRybHarmonies(0);
      expect(redHarmonies.complement).toBeCloseTo(180);
    });

    it("computes triadic and analogous chords", () => {
      const redHarmonies = calculateRybHarmonies(0);
      expect(redHarmonies.triadic1).toBeCloseTo(120); // Yellow
      expect(redHarmonies.triadic2).toBeCloseTo(240); // Blue
      expect(redHarmonies.analogous1).toBeCloseTo(330);
      expect(redHarmonies.analogous2).toBeCloseTo(30);
    });
  });
});
