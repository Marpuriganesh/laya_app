import { describe, it, expect } from "vitest";
import {
  GAMUT_MASK_PRESETS,
  getGamutMaskVertices,
  isPointInPolygon,
  projectPointOnSegment,
  clampPointToGamutMask,
  type GamutMaskType,
} from "../gamut_mask";

describe("Gamut Mask Mathematics (Krita / James Gurney)", () => {
  it("contains all 5 standard presets", () => {
    expect(GAMUT_MASK_PRESETS).toHaveLength(5);
    const ids = GAMUT_MASK_PRESETS.map((p) => p.id);
    expect(ids).toContain("triad");
    expect(ids).toContain("complementary");
    expect(ids).toContain("split-complementary");
    expect(ids).toContain("analogous");
    expect(ids).toContain("muted-accent");
  });

  describe("getGamutMaskVertices", () => {
    it("generates rotated canvas vertices centered at (cx, cy)", () => {
      const center = 100;
      const radius = 50;
      const vertices = getGamutMaskVertices("triad", 0, radius, center);
      expect(vertices.length).toBeGreaterThanOrEqual(3);

      // Apex at angle 0° should be at (center, center - normRadius * radius)
      // For triad, primary apex radius is 0.92: y = 100 - 0.92 * 50 = 54
      expect(vertices[0].x).toBeCloseTo(100, 1);
      expect(vertices[0].y).toBeCloseTo(54, 1);

      // Rotating by 90° clockwise should move the apex to East (+X)
      const rotated = getGamutMaskVertices("triad", 90, radius, center);
      expect(rotated[0].x).toBeCloseTo(100 + 0.92 * 50, 1);
      expect(rotated[0].y).toBeCloseTo(100, 1);
    });
  });

  describe("isPointInPolygon", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it("correctly identifies interior points", () => {
      expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
      expect(isPointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
      expect(isPointInPolygon({ x: 9, y: 9 }, square)).toBe(true);
    });

    it("correctly identifies exterior points", () => {
      expect(isPointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
      expect(isPointInPolygon({ x: 11, y: 5 }, square)).toBe(false);
      expect(isPointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
      expect(isPointInPolygon({ x: 5, y: 11 }, square)).toBe(false);
    });
  });

  describe("projectPointOnSegment", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };

    it("projects point perpendicular to segment", () => {
      const proj = projectPointOnSegment({ x: 5, y: 5 }, a, b);
      expect(proj.x).toBeCloseTo(5);
      expect(proj.y).toBeCloseTo(0);
    });

    it("clamps to start point if projection falls before start", () => {
      const proj = projectPointOnSegment({ x: -5, y: 5 }, a, b);
      expect(proj.x).toBeCloseTo(0);
      expect(proj.y).toBeCloseTo(0);
    });

    it("clamps to end point if projection falls past end", () => {
      const proj = projectPointOnSegment({ x: 15, y: 5 }, a, b);
      expect(proj.x).toBeCloseTo(10);
      expect(proj.y).toBeCloseTo(0);
    });
  });

  describe("clampPointToGamutMask", () => {
    const triangle = [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    it("leaves points inside the mask untouched", () => {
      const insidePt = { x: 50, y: 50 };
      const clamped = clampPointToGamutMask(insidePt, triangle);
      expect(clamped.x).toBeCloseTo(50);
      expect(clamped.y).toBeCloseTo(50);
    });

    it("projects exterior points onto the nearest perimeter boundary", () => {
      // Point directly above the apex
      const aboveApex = { x: 50, y: -20 };
      const clampedApex = clampPointToGamutMask(aboveApex, triangle);
      expect(clampedApex.x).toBeCloseTo(50);
      expect(clampedApex.y).toBeCloseTo(0);

      // Point directly below the bottom edge
      const belowBottom = { x: 50, y: 120 };
      const clampedBottom = clampPointToGamutMask(belowBottom, triangle);
      expect(clampedBottom.x).toBeCloseTo(50);
      expect(clampedBottom.y).toBeCloseTo(100);
    });

    it("works across all preset shapes without crash or NaN", () => {
      const presets: GamutMaskType[] = ["triad", "complementary", "split-complementary", "analogous", "muted-accent"];
      const testPoint = { x: 1000, y: -500 };

      for (const preset of presets) {
        const poly = getGamutMaskVertices(preset, 45, 100, 117);
        const clamped = clampPointToGamutMask(testPoint, poly);
        expect(Number.isFinite(clamped.x)).toBe(true);
        expect(Number.isFinite(clamped.y)).toBe(true);
      }
    });
  });
});
