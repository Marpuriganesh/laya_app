import { describe, it, expect } from "vitest";
import {
  calculateHarmonyAngles,
  generateHarmonySwatches,
  calculateProcreateHarmonyItems,
} from "../harmonies";

describe("Color Harmony Mathematics", () => {
  describe("RGB space harmony calculations", () => {
    it("calculates complementary chord 180° opposite", () => {
      const chords = calculateHarmonyAngles(30, "complementary", "rgb");
      expect(chords).toHaveLength(1);
      expect(chords[0].angleDeg).toBeCloseTo(210);
      expect(chords[0].rgbHueDeg).toBeCloseTo(210);
    });

    it("calculates triadic chords at +120° and +240°", () => {
      const chords = calculateHarmonyAngles(0, "triadic", "rgb");
      expect(chords).toHaveLength(2);
      expect(chords[0].angleDeg).toBeCloseTo(120);
      expect(chords[1].angleDeg).toBeCloseTo(240);
    });

    it("calculates tetradic (square) chords at 90°, 180°, 270°", () => {
      const chords = calculateHarmonyAngles(0, "tetradic", "rgb");
      expect(chords).toHaveLength(3);
      expect(chords[0].angleDeg).toBeCloseTo(90);
      expect(chords[1].angleDeg).toBeCloseTo(180);
      expect(chords[2].angleDeg).toBeCloseTo(270);
    });

    it("calculates split-complementary chords at 150° and 210°", () => {
      const chords = calculateHarmonyAngles(0, "split-complementary", "rgb");
      expect(chords).toHaveLength(2);
      expect(chords[0].angleDeg).toBeCloseTo(150);
      expect(chords[1].angleDeg).toBeCloseTo(210);
    });

    it("calculates analogous chords at -30° and +30°", () => {
      const chords = calculateHarmonyAngles(0, "analogous", "rgb");
      expect(chords).toHaveLength(2);
      expect(chords[0].angleDeg).toBeCloseTo(330);
      expect(chords[1].angleDeg).toBeCloseTo(30);
    });
  });

  describe("RYB space harmony calculations (artist complements)", () => {
    it("maps Blue (RYB 240°) to Orange (RYB 60° -> RGB 30°)", () => {
      const chords = calculateHarmonyAngles(240, "complementary", "ryb");
      expect(chords[0].angleDeg).toBeCloseTo(60); // Orange in RYB
      expect(chords[0].rgbHueDeg).toBeCloseTo(30); // Orange in RGB
    });

    it("maps Red (RYB 0°) to Green (RYB 180° -> RGB 120°)", () => {
      const chords = calculateHarmonyAngles(0, "complementary", "ryb");
      expect(chords[0].angleDeg).toBeCloseTo(180); // Green in RYB
      expect(chords[0].rgbHueDeg).toBeCloseTo(120); // Green in RGB
    });
  });

  describe("generateHarmonySwatches", () => {
    it("generates base color + chord swatches with valid hex codes", () => {
      const swatches = generateHarmonySwatches(0, "triadic", "rgb", 1.0, 1.0, false);
      expect(swatches).toHaveLength(3); // Base + 2 chords
      expect(swatches[0].hex).toBe("#ff0000"); // Red
      expect(swatches[1].hex).toBe("#00ff00"); // Green (120°)
      expect(swatches[2].hex).toBe("#0000ff"); // Blue (240°)
    });

    it("returns only base swatch when harmony type is none", () => {
      const swatches = generateHarmonySwatches(0, "none", "rgb", 1.0, 1.0, false);
      expect(swatches).toHaveLength(1);
      expect(swatches[0].label).toBe("Base");
    });
  });

  describe("calculateProcreateHarmonyItems", () => {
    it("returns primary color only when type is none", () => {
      const items = calculateProcreateHarmonyItems(0, 1.0, 1.0, "none");
      expect(items).toHaveLength(1);
      expect(items[0].isPrimary).toBe(true);
      expect(items[0].hex).toBe("#ff0000");
    });

    it("calculates complementary pair for Procreate wheel", () => {
      const items = calculateProcreateHarmonyItems(0, 1.0, 1.0, "complementary");
      expect(items).toHaveLength(2);
      expect(items[0].isPrimary).toBe(true);
      expect(items[0].hue).toBe(0);
      expect(items[1].isPrimary).toBe(false);
      expect(items[1].hue).toBe(180);
      expect(items[1].hex).toBe("#00ffff");
    });

    it("calculates triadic trio for Procreate wheel", () => {
      const items = calculateProcreateHarmonyItems(0, 1.0, 1.0, "triadic");
      expect(items).toHaveLength(3);
      expect(items[0].hue).toBe(0);
      expect(items[1].hue).toBe(120);
      expect(items[2].hue).toBe(240);
    });
  });
});
