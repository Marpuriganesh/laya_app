import { describe, it, expect } from "vitest";
import {
  pointToSaturationValue,
  saturationValueToPoint,
  clampPointToTriangle,
  calculateEquilateralTriangleSignedDistance,
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

  it("calculates exact signed perpendicular distance for equilateral triangles", () => {
    const center = 117;
    const shapeRadius = 82;
    const equilateralVertices: TriangleVertices = {
      hueVertex: { x: center, y: center - shapeRadius }, // Apex at (117, 35)
      whiteVertex: { x: center - shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 }, // (46.01, 158)
      blackVertex: { x: center + shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 }, // (187.99, 158)
    };

    // Exactly on the bottom horizontal edge (y = 158): distance is 0
    const onEdge = calculateEquilateralTriangleSignedDistance({ x: 117, y: 158 }, equilateralVertices, shapeRadius);
    expect(onEdge).toBeCloseTo(0.0, 5);

    // 1 pixel inside bottom edge (y = 157): distance is +1.0
    const inside1px = calculateEquilateralTriangleSignedDistance({ x: 117, y: 157 }, equilateralVertices, shapeRadius);
    expect(inside1px).toBeCloseTo(1.0, 5);

    // 1 pixel outside bottom edge (y = 159): distance is -1.0
    const outside1px = calculateEquilateralTriangleSignedDistance({ x: 117, y: 159 }, equilateralVertices, shapeRadius);
    expect(outside1px).toBeCloseTo(-1.0, 5);

    // Centroid of equilateral triangle: distance is inradius (shapeRadius / 2 = 41)
    const centroidDist = calculateEquilateralTriangleSignedDistance({ x: center, y: center }, equilateralVertices, shapeRadius);
    expect(centroidDist).toBeCloseTo(41.0, 5);
  });
});
