import { describe, it, expect } from "vitest";
import {
  ratioToBrushSize,
  brushSizeToRatio,
  ratioToOpacity,
  opacityToRatio,
  MIN_BRUSH_SIZE,
  MAX_BRUSH_SIZE,
} from "../slider_utils";

describe("slider_utils", () => {
  describe("ratioToBrushSize & brushSizeToRatio", () => {
    it("maps 0.0 to MIN_BRUSH_SIZE", () => {
      expect(ratioToBrushSize(0.0)).toBe(MIN_BRUSH_SIZE);
      expect(brushSizeToRatio(MIN_BRUSH_SIZE)).toBeCloseTo(0.0);
    });

    it("maps 1.0 to MAX_BRUSH_SIZE", () => {
      expect(ratioToBrushSize(1.0)).toBe(MAX_BRUSH_SIZE);
      expect(brushSizeToRatio(MAX_BRUSH_SIZE)).toBeCloseTo(1.0);
    });

    it("clamps out-of-range ratios safely", () => {
      expect(ratioToBrushSize(-0.5)).toBe(MIN_BRUSH_SIZE);
      expect(ratioToBrushSize(1.5)).toBe(MAX_BRUSH_SIZE);
      expect(brushSizeToRatio(0)).toBe(0.0);
      expect(brushSizeToRatio(500)).toBe(1.0);
    });

    it("provides fine-grained precision at low sizes via quadratic curve", () => {
      // Halfway (t = 0.5) should be well below the arithmetic midpoint (150px)
      const midSize = ratioToBrushSize(0.5);
      expect(midSize).toBeLessThan(100);
      expect(midSize).toBeGreaterThan(60);

      // 40% of the slider travel covers up to ~50px
      const sizeAt40 = ratioToBrushSize(0.4);
      expect(sizeAt40).toBeLessThanOrEqual(50);
    });

    it("round-trips monotonically across the range", () => {
      let previousSize = 0;
      for (let t = 0; t <= 1.0; t += 0.05) {
        const size = ratioToBrushSize(t);
        expect(size).toBeGreaterThanOrEqual(previousSize);
        const reconstructedRatio = brushSizeToRatio(size);
        expect(reconstructedRatio).toBeCloseTo(t, 1);
        previousSize = size;
      }
    });
  });

  describe("ratioToOpacity & opacityToRatio", () => {
    it("maps ratios to 2-decimal rounded opacity percentages", () => {
      expect(ratioToOpacity(0.0)).toBe(0.01);
      expect(ratioToOpacity(0.5)).toBe(0.5);
      expect(ratioToOpacity(1.0)).toBe(1.0);
      expect(ratioToOpacity(0.33333)).toBe(0.33);
    });

    it("clamps out-of-bound opacity values safely", () => {
      expect(ratioToOpacity(-0.1)).toBe(0.01);
      expect(ratioToOpacity(1.2)).toBe(1.0);
      expect(opacityToRatio(-0.5)).toBe(0.0);
      expect(opacityToRatio(1.5)).toBe(1.0);
    });
  });
});
