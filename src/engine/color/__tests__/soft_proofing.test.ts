import { describe, it, expect } from "vitest";
import {
  applyGrayscaleProof,
  applyCmykSimulation,
  getCssFilterForSoftProof,
} from "../soft_proofing";

describe("Soft Proofing Engine", () => {
  describe("applyGrayscaleProof", () => {
    it("produces identical R, G, B channels reflecting perceptual luminance", () => {
      const [r, g, b] = applyGrayscaleProof(255, 255, 0); // Yellow
      expect(r).toBe(g);
      expect(g).toBe(b);
      // Yellow should have high value (~237)
      expect(r).toBeGreaterThan(200);
    });

    it("evaluates pure blue to dark gray", () => {
      const [r, g, b] = applyGrayscaleProof(0, 0, 255); // Blue
      expect(r).toBe(g);
      expect(g).toBe(b);
      // Blue should have low value (~18)
      expect(r).toBeLessThan(30);
    });

    it("preserves black and white exactly", () => {
      expect(applyGrayscaleProof(0, 0, 0)).toEqual([0, 0, 0]);
      expect(applyGrayscaleProof(255, 255, 255)).toEqual([255, 255, 255]);
    });
  });

  describe("applyCmykSimulation", () => {
    it("compresses saturated colors to within pigment ink gamut", () => {
      const [r, g, b] = applyCmykSimulation(0, 255, 255); // Vibrant cyan
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(255); // Compressed
      expect(b).toBeLessThan(255); // Compressed
    });

    it("handles neutral colors without wild color shifts", () => {
      const [r, g, b] = applyCmykSimulation(128, 128, 128);
      expect(Math.abs(r - g)).toBeLessThanOrEqual(5);
      expect(Math.abs(g - b)).toBeLessThanOrEqual(5);
    });
  });

  describe("getCssFilterForSoftProof", () => {
    it("returns 'none' for mode 'none'", () => {
      expect(getCssFilterForSoftProof("none")).toBe("none");
    });

    it("returns grayscale filter for 'grayscale-values'", () => {
      expect(getCssFilterForSoftProof("grayscale-values")).toContain("softproof-values-bw");
    });

    it("returns saturation/contrast dampening filter for 'cmyk-print'", () => {
      expect(getCssFilterForSoftProof("cmyk-print")).toContain("saturate");
    });

    it("returns high-contrast filter for 'gamut-warning'", () => {
      expect(getCssFilterForSoftProof("gamut-warning")).toContain("contrast");
    });
  });
});
