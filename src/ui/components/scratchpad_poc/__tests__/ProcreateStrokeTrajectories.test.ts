import { describe, it, expect } from "vitest";
import {
  generateProcreateSCurve,
  generateTaperFlick,
  generateRibbonWave,
  getTrajectoryPoints,
  TRAJECTORY_OPTIONS,
} from "../ProcreateStrokeTrajectories";

describe("ProcreateStrokeTrajectories", () => {
  it("exposes all documented trajectories in TRAJECTORY_OPTIONS", () => {
    expect(TRAJECTORY_OPTIONS.length).toBe(4);
    const ids = TRAJECTORY_OPTIONS.map((t) => t.id);
    expect(ids).toContain("s-curve");
    expect(ids).toContain("taper-flick");
    expect(ids).toContain("ribbon-wave");
    expect(ids).toContain("hatching");
  });

  it("generates a smooth S-curve within canvas bounds with realistic pressure ramp", () => {
    const width = 500;
    const height = 600;
    const points = generateProcreateSCurve(width, height, 60);

    expect(points.length).toBe(61);

    // Initial point has delicate touch-down pressure
    expect(points[0].pressure).toBeGreaterThan(0);
    expect(points[0].pressure).toBeLessThan(0.3);

    // Mid point has peak belly pressure near 1.0
    const midPoint = points[30];
    expect(midPoint.pressure).toBeGreaterThanOrEqual(0.8);
    expect(midPoint.pressure).toBeLessThanOrEqual(1.0);

    // Tail point tapers gracefully
    const tailPoint = points[60];
    expect(tailPoint.pressure).toBeLessThan(0.3);

    // All coordinates stay inside canvas margin
    for (const p of points) {
      expect(p.canvasX).toBeGreaterThanOrEqual(0);
      expect(p.canvasX).toBeLessThanOrEqual(width);
      expect(p.canvasY).toBeGreaterThanOrEqual(0);
      expect(p.canvasY).toBeLessThanOrEqual(height);
      expect(p.speed).toBeGreaterThan(0);
    }
  });

  it("generates a whip & flick stroke with strong taper at the tail", () => {
    const width = 400;
    const height = 500;
    const points = generateTaperFlick(width, height, 48);

    expect(points.length).toBe(49);
    const endPt = points[points.length - 1];
    expect(endPt.pressure).toBeLessThan(0.15);
  });

  it("generates ribbon wave trajectory across peaks", () => {
    const width = 400;
    const height = 500;
    const points = generateRibbonWave(width, height, 64);

    expect(points.length).toBe(65);
    expect(points[0].rotation).toBe(0);
  });

  it("returns multi-stroke array for hatching", () => {
    const width = 400;
    const height = 500;
    const strokes = getTrajectoryPoints("hatching", width, height);

    expect(strokes.length).toBe(4);
    for (const stroke of strokes) {
      expect(stroke.length).toBeGreaterThan(10);
    }
  });
});
