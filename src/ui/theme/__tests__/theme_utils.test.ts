import { describe, it, expect } from "vitest";
import { resolveTheme, getNextTheme, isValidTheme } from "../theme_utils";

describe("theme_utils", () => {
  describe("resolveTheme", () => {
    it("returns dark when theme is dark regardless of system state", () => {
      expect(resolveTheme("dark", false)).toBe("dark");
      expect(resolveTheme("dark", true)).toBe("dark");
    });

    it("returns light when theme is light regardless of system state", () => {
      expect(resolveTheme("light", false)).toBe("light");
      expect(resolveTheme("light", true)).toBe("light");
    });

    it("resolves system theme based on isSystemDark parameter", () => {
      expect(resolveTheme("system", true)).toBe("dark");
      expect(resolveTheme("system", false)).toBe("light");
    });
  });

  describe("getNextTheme", () => {
    it("toggles dark to light", () => {
      expect(getNextTheme("dark")).toBe("light");
    });

    it("toggles light to dark", () => {
      expect(getNextTheme("light")).toBe("dark");
    });
  });

  describe("isValidTheme", () => {
    it("validates dark, light, and system", () => {
      expect(isValidTheme("dark")).toBe(true);
      expect(isValidTheme("light")).toBe(true);
      expect(isValidTheme("system")).toBe(true);
      expect(isValidTheme("blue")).toBe(false);
      expect(isValidTheme(null)).toBe(false);
      expect(isValidTheme(123)).toBe(false);
    });
  });
});
