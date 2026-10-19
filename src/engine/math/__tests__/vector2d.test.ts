import { describe, it, expect } from "vitest";
import {
  calculateDistance,
  calculateDistanceSquared,
  interpolateLinear2D,
  calculateVectorLength,
  normalizeVector,
  interpolateCatmullRom1D,
  interpolateCatmullRom2D,
  evaluateCubicBezier2D,
  evaluateCubicBezierTangent2D,
} from "../vector2d";

describe("Vector2D & Spline Math", () => {
  it("calculates Euclidean distance and squared distance", () => {
    const pointA = { x: 0, y: 0 };
    const pointB = { x: 3, y: 4 };

    expect(calculateDistance(pointA, pointB)).toBe(5);
    expect(calculateDistanceSquared(pointA, pointB)).toBe(25);
  });

  it("linearly interpolates between two 2D points", () => {
    const pointA = { x: 10, y: 20 };
    const pointB = { x: 30, y: 60 };

    expect(interpolateLinear2D(pointA, pointB, 0.0)).toEqual({ x: 10, y: 20 });
    expect(interpolateLinear2D(pointA, pointB, 1.0)).toEqual({ x: 30, y: 60 });
    expect(interpolateLinear2D(pointA, pointB, 0.5)).toEqual({ x: 20, y: 40 });
  });

  it("calculates vector length and normalizes vectors", () => {
    const vector = { x: 3, y: 4 };
    expect(calculateVectorLength(vector)).toBe(5);

    const normalized = normalizeVector(vector);
    expect(normalized.x).toBeCloseTo(0.6);
    expect(normalized.y).toBeCloseTo(0.8);
    expect(calculateVectorLength(normalized)).toBeCloseTo(1.0);

    const zeroVector = normalizeVector({ x: 0, y: 0 });
    expect(zeroVector).toEqual({ x: 0, y: 0 });
  });

  it("evaluates 1D and 2D Catmull-Rom splines", () => {
    // Collinear points along X axis
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 0 };
    const p2 = { x: 20, y: 0 };
    const p3 = { x: 30, y: 0 };

    expect(interpolateCatmullRom1D(0, 10, 20, 30, 0.0)).toBeCloseTo(10);
    expect(interpolateCatmullRom1D(0, 10, 20, 30, 1.0)).toBeCloseTo(20);
    expect(interpolateCatmullRom1D(0, 10, 20, 30, 0.5)).toBeCloseTo(15);

    const mid2D = interpolateCatmullRom2D(p0, p1, p2, p3, 0.5);
    expect(mid2D.x).toBeCloseTo(15);
    expect(mid2D.y).toBeCloseTo(0);
  });

  it("evaluates 2D Cubic Bézier curves and tangents", () => {
    const p0 = { x: 0, y: 0 };
    const c1 = { x: 0, y: 10 };
    const c2 = { x: 10, y: 10 };
    const p3 = { x: 10, y: 0 };

    const start = evaluateCubicBezier2D(p0, c1, c2, p3, 0.0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(0);

    const end = evaluateCubicBezier2D(p0, c1, c2, p3, 1.0);
    expect(end.x).toBeCloseTo(10);
    expect(end.y).toBeCloseTo(0);

    const tangentStart = evaluateCubicBezierTangent2D(p0, c1, c2, p3, 0.0);
    // At t=0, tangent is 3 * (C1 - P0) = (0, 30)
    expect(tangentStart.x).toBeCloseTo(0);
    expect(tangentStart.y).toBeCloseTo(30);
  });
});
