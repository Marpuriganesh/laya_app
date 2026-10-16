import { describe, it, expect } from "vitest";
import {
  pointToSaturationValue,
  saturationValueToPoint,
  clampPointToTriangle,
  type TriangleVertices,
} from "../barycentric_triangle";

describe("Barycentric Triangle Mathematics", () => {
  const vertices: TriangleVertices = {
    hueVertex: { x: 50, y: 10 },    // Top apex
    whiteVertex: { x: 10, y: 90 },  // Bottom-left
    blackVertex: { x: 90, y: 90 },  // Bottom-right
  };

  it("maps top apex to Saturation=1.0, Value=1.0", () => {
    const [s, v] = pointToSaturationValue(vertices.hueVertex, vertices);
    expect(s).toBeCloseTo(1.0);
    expect(v).toBeCloseTo(1.0);
  });

  it("maps bottom-left to Saturation=0.0, Value=1.0 (pure white)", () => {
    const [s, v] = pointToSaturationValue(vertices.whiteVertex, vertices);
    expect(s).toBeCloseTo(0.0);
    expect(v).toBeCloseTo(1.0);
  });

  it("maps bottom-right to Value=0.0 (pure black)", () => {
    const [, v] = pointToSaturationValue(vertices.blackVertex, vertices);
    expect(v).toBeCloseTo(0.0);
  });

  it("round-trips (S, V) -> Point -> (S, V)", () => {
    const testCases: [number, number][] = [
      [1.0, 1.0],
      [0.0, 1.0],
      [0.5, 0.5],
      [0.2, 0.8],
      [0.8, 0.3],
    ];

    for (const [targetS, targetV] of testCases) {
      const pt = saturationValueToPoint(targetS, targetV, vertices);
      const [calcS, calcV] = pointToSaturationValue(pt, vertices);
      expect(calcS).toBeCloseTo(targetS, 2);
      expect(calcV).toBeCloseTo(targetV, 2);
    }
  });

  it("clamps points far outside the triangle to the nearest boundary without NaN", () => {
    const farPoint = { x: -500, y: -500 };
    const clamped = clampPointToTriangle(farPoint, vertices);
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(Number.isFinite(clamped.y)).toBe(true);

    const [s, v] = pointToSaturationValue(farPoint, vertices);
    expect(s).toBeGreaterThanOrEqual(0.0);
    expect(s).toBeLessThanOrEqual(1.0);
    expect(v).toBeGreaterThanOrEqual(0.0);
    expect(v).toBeLessThanOrEqual(1.0);
  });
});
