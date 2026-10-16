import { describe, it, expect } from "vitest";
import {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "../color_conversions";

describe("Color Conversions", () => {
  describe("hsvToRgb and rgbToHsv roundtripping", () => {
    it("converts pure red", () => {
      const [r, g, b] = hsvToRgb(0, 1, 1);
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);

      const [h, s, v] = rgbToHsv(255, 0, 0);
      expect(h).toBe(0);
      expect(s).toBe(1);
      expect(v).toBe(1);
    });

    it("converts pure green", () => {
      const [r, g, b] = hsvToRgb(120, 1, 1);
      expect(r).toBe(0);
      expect(g).toBe(255);
      expect(b).toBe(0);

      const [h, s, v] = rgbToHsv(0, 255, 0);
      expect(h).toBe(120);
      expect(s).toBe(1);
      expect(v).toBe(1);
    });

    it("converts pure blue", () => {
      const [r, g, b] = hsvToRgb(240, 1, 1);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(255);

      const [h, s, v] = rgbToHsv(0, 0, 255);
      expect(h).toBe(240);
      expect(s).toBe(1);
      expect(v).toBe(1);
    });

    it("handles black, white, and mid gray", () => {
      expect(hsvToRgb(0, 0, 0)).toEqual([0, 0, 0]);
      expect(hsvToRgb(0, 0, 1)).toEqual([255, 255, 255]);
      expect(hsvToRgb(0, 0, 0.5)).toEqual([128, 128, 128]);
    });
  });

  describe("hexToRgb and rgbToHex", () => {
    it("converts standard 6-digit hex", () => {
      expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
      expect(hexToRgb("#00ff00")).toEqual([0, 255, 0]);
      expect(hexToRgb("#0000ff")).toEqual([0, 0, 255]);
    });

    it("converts 3-digit shorthand hex", () => {
      expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
      expect(hexToRgb("#0f0")).toEqual([0, 255, 0]);
    });

    it("formats rgb to 6-digit hex string", () => {
      expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
      expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
      expect(rgbToHex(0, 0, 255)).toBe("#0000ff");
    });
  });
});
