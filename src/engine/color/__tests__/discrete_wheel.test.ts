import { describe, it, expect } from "vitest";
import {
  quantizeRybHue,
  quantizeSaturation,
  quantizeValue,
  generateDiscreteValueSteps,
} from "../discrete_wheel";

describe("Discrete Wheel Mathematics (Krita Artistic Color Selector)", () => {
  describe("quantizeRybHue", () => {
    it("quantizes 12 Itten sectors evenly (30° spans)", () => {
      const { sectorIndex: s0, quantizedAngle: a0 } = quantizeRybHue(10, 12);
      expect(s0).toBe(0);
      expect(a0).toBeCloseTo(15); // Center of sector 0 [0..30)

      const { sectorIndex: s1, quantizedAngle: a1 } = quantizeRybHue(45, 12);
      expect(s1).toBe(1);
      expect(a1).toBeCloseTo(45); // Center of sector 1 [30..60)
    });

    it("handles negative angles and wrap around correctly", () => {
      const { sectorIndex } = quantizeRybHue(-10, 12);
      expect(sectorIndex).toBe(11);
    });
  });

  describe("quantizeSaturation", () => {
    it("identifies center neutral gray for inner core (< 0.15)", () => {
      const res = quantizeSaturation(0.05, 4);
      expect(res.isCenterGray).toBe(true);
      expect(res.quantizedSat).toBe(0.0);
      expect(res.ringIndex).toBe(-1);
    });

    it("quantizes into discrete rings for values outside center core with centroid value", () => {
      const res = quantizeSaturation(0.95, 4);
      expect(res.isCenterGray).toBe(false);
      expect(res.ringIndex).toBe(3); // Outermost ring (index 3 of 4)
      // Centroid of ring 3: (3 + 0.5) / 4 = 0.875
      expect(res.quantizedSat).toBeCloseTo(0.875);

      const resInner = quantizeSaturation(0.20, 4);
      expect(resInner.isCenterGray).toBe(false);
      expect(resInner.ringIndex).toBe(0); // Innermost ring (index 0 of 4)
      // Centroid of ring 0: (0 + 0.5) / 4 = 0.125
      expect(resInner.quantizedSat).toBeCloseTo(0.125);
    });
  });

  describe("quantizeValue", () => {
    it("quantizes into discrete tonal steps from 0.0 to 1.0", () => {
      // 5 steps: 0.0, 0.25, 0.5, 0.75, 1.0
      expect(quantizeValue(0.0, 5).quantizedValue).toBeCloseTo(0.0);
      expect(quantizeValue(0.24, 5).quantizedValue).toBeCloseTo(0.25);
      expect(quantizeValue(0.51, 5).quantizedValue).toBeCloseTo(0.5);
      expect(quantizeValue(1.0, 5).quantizedValue).toBeCloseTo(1.0);
    });
  });

  describe("generateDiscreteValueSteps", () => {
    it("generates evenly spaced values from 0 to 1", () => {
      const steps = generateDiscreteValueSteps(5);
      expect(steps).toEqual([0.0, 0.25, 0.5, 0.75, 1.0]);
    });
  });
});
