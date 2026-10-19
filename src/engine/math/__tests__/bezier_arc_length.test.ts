import { describe, expect, it } from "vitest";
import {
  calculateCubicBezierTotalLength,
  CubicBezierArcLengthTable,
} from "../bezier_arc_length";

describe("Cubic Bézier Arc Length & Numerical Integration", () => {
  it("calculates exact length of a straight horizontal line", () => {
    // Horizontal line from (0, 0) to (120, 0)
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 40, y: 0 };
    const c2 = { x: 80, y: 0 };
    const p3 = { x: 120, y: 0 };

    const totalLength = calculateCubicBezierTotalLength(p0, c1, c2, p3);
    expect(totalLength).toBeCloseTo(120.0, 5);

    const table = new CubicBezierArcLengthTable(p0, c1, c2, p3);
    expect(table.totalLength).toBeCloseTo(120.0, 5);

    // Midpoint at arc length 60 should have t = 0.5 and pos = (60, 0)
    const tMid = table.getTForArcLength(60.0);
    expect(tMid).toBeCloseTo(0.5, 5);

    const posMid = table.evaluatePositionAtArcLength(60.0);
    expect(posMid.x).toBeCloseTo(60.0, 5);
    expect(posMid.y).toBeCloseTo(0.0, 5);

    // Quarter point at arc length 30
    const tQuarter = table.getTForArcLength(30.0);
    expect(tQuarter).toBeCloseTo(0.25, 5);
    const posQuarter = table.evaluatePositionAtArcLength(30.0);
    expect(posQuarter.x).toBeCloseTo(30.0, 5);
  });

  it("calculates arc length of a diagonal line", () => {
    // Diagonal line from (0, 0) to (30, 40) => length = 50
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 10, y: 13.333333333333334 };
    const c2 = { x: 20, y: 26.666666666666668 };
    const p3 = { x: 30, y: 40 };

    const table = new CubicBezierArcLengthTable(p0, c1, c2, p3);
    expect(table.totalLength).toBeCloseTo(50.0, 4);

    const tMid = table.getTForArcLength(25.0);
    expect(tMid).toBeCloseTo(0.5, 4);
    const posMid = table.evaluatePositionAtArcLength(25.0);
    expect(posMid.x).toBeCloseTo(15.0, 4);
    expect(posMid.y).toBeCloseTo(20.0, 4);
  });

  it("calculates arc length of a circular arc approximation", () => {
    // 90-degree circular arc of radius R = 100 from (100, 0) to (0, 100)
    // Standard cubic Bézier circular approximation: k = 4 * (sqrt(2) - 1) / 3 ≈ 0.5522847498
    const r = 100;
    const k = (4 * (Math.SQRT2 - 1)) / 3;
    const p0 = { x: r, y: 0 };
    const c1 = { x: r, y: r * k };
    const c2 = { x: r * k, y: r };
    const p3 = { x: 0, y: r };

    const expectedCircumference = 0.5 * Math.PI * r; // ~157.0796
    const table = new CubicBezierArcLengthTable(p0, c1, c2, p3);

    // Cubic Bézier circle approximation is accurate to within 0.1%
    expect(table.totalLength).toBeCloseTo(expectedCircumference, 1);

    // Halfway along the arc should be at 45 degrees
    const halfwayDistance = table.totalLength * 0.5;
    const midPos = table.evaluatePositionAtArcLength(halfwayDistance);
    const expectedX = r * Math.cos(Math.PI / 4);
    const expectedY = r * Math.sin(Math.PI / 4);

    expect(midPos.x).toBeCloseTo(expectedX, 0.5);
    expect(midPos.y).toBeCloseTo(expectedY, 0.5);
  });

  it("handles degenerate curve with zero length gracefully", () => {
    const p = { x: 50, y: 50 };
    const table = new CubicBezierArcLengthTable(p, p, p, p);

    expect(table.totalLength).toBeCloseTo(0.0, 6);
    expect(table.getTForArcLength(0)).toBe(0);
    expect(table.getTForArcLength(10)).toBe(0);
    const pos = table.evaluatePositionAtArcLength(5);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(50);
  });

  it("clamps out-of-bounds arc length queries", () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 10, y: 0 };
    const c2 = { x: 20, y: 0 };
    const p3 = { x: 30, y: 0 };
    const table = new CubicBezierArcLengthTable(p0, c1, c2, p3);

    expect(table.getTForArcLength(-10)).toBe(0.0);
    expect(table.getTForArcLength(500)).toBe(1.0);
    expect(table.getArcLengthForT(-0.5)).toBe(0.0);
    expect(table.getArcLengthForT(1.5)).toBeCloseTo(30.0);
  });

  it("provides monotonic and continuous parameter inversion on an S-curve", () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 0, y: 100 };
    const c2 = { x: 100, y: 0 };
    const p3 = { x: 100, y: 100 };
    const table = new CubicBezierArcLengthTable(p0, c1, c2, p3);

    const stepPx = 5.0;
    let previousT = -1;

    for (let distance = 0; distance <= table.totalLength; distance += stepPx) {
      const t = table.getTForArcLength(distance);
      const measuredS = table.getArcLengthForT(t);

      // t must be strictly non-decreasing
      expect(t).toBeGreaterThanOrEqual(previousT);
      // Measured arc length at t must match target distance with high precision
      expect(measuredS).toBeCloseTo(distance, 3);

      previousT = t;
    }
  });
});
