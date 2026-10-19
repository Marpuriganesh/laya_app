import { describe, expect, it } from "vitest";
import type { StrokePoint } from "../../../types/stroke";
import { evaluateCubicBezierTangent2D } from "../../math/vector2d";
import {
  elevateQuadraticToBezierHandles,
  extrapolateBoundaryPoint,
  fitCatmullRomToBezier,
  fitMidpointSegmentToBezier,
  generateCatmullRomSpline,
  generateMidpointSpline,
  interpolateSegmentProperties,
  interpolateStrokePointMidpoint,
  SplineInterpolator,
} from "../spline_interpolator";

function createTestStrokePoint(
  x: number,
  y: number,
  pressure = 0.5,
  tiltX = 0,
  tiltY = 0,
  speed = 100,
  timeMs = 0
): StrokePoint {
  return {
    canvasX: x,
    canvasY: y,
    pressure,
    tiltX,
    tiltY,
    rotation: 0,
    speed,
    timeMs,
  };
}

describe("Spline Interpolator", () => {
  describe("Mathematical Primitives", () => {
    it("fits Catmull-Rom to Cubic Bézier for collinear points", () => {
      // 4 collinear points spaced 30px apart
      const p0 = createTestStrokePoint(0, 0);
      const p1 = createTestStrokePoint(30, 0);
      const p2 = createTestStrokePoint(60, 0);
      const p3 = createTestStrokePoint(90, 0);

      const segment = fitCatmullRomToBezier(p0, p1, p2, p3);

      expect(segment.p0.x).toBe(30);
      expect(segment.p0.y).toBe(0);
      // C1 = P1 + (P2 - P0) / 6 = 30 + (60 - 0) / 6 = 40
      expect(segment.c1.x).toBeCloseTo(40, 5);
      expect(segment.c1.y).toBeCloseTo(0, 5);
      // C2 = P2 - (P3 - P1) / 6 = 60 - (90 - 30) / 6 = 50
      expect(segment.c2.x).toBeCloseTo(50, 5);
      expect(segment.c2.y).toBeCloseTo(0, 5);
      expect(segment.p3.x).toBe(60);
      expect(segment.p3.y).toBe(0);
    });

    it("elevates quadratic Bézier to cubic handles with exact mathematical equivalence", () => {
      const start = { x: 0, y: 0 };
      const control = { x: 30, y: 60 };
      const end = { x: 60, y: 0 };

      const handles = elevateQuadraticToBezierHandles(start, control, end);

      // C1 = start + (2/3) * (control - start) = 0 + (2/3) * 30 = 20
      expect(handles.c1.x).toBeCloseTo(20, 5);
      expect(handles.c1.y).toBeCloseTo(40, 5);
      // C2 = end + (2/3) * (control - end) = 60 + (2/3) * (30 - 60) = 40
      expect(handles.c2.x).toBeCloseTo(40, 5);
      expect(handles.c2.y).toBeCloseTo(40, 5);
    });

    it("interpolates midpoints across all physical sensor properties", () => {
      const pA = createTestStrokePoint(10, 20, 0.2, -10, 20, 150, 100);
      const pB = createTestStrokePoint(30, 40, 0.8, 30, 40, 250, 200);

      const midpoint = interpolateStrokePointMidpoint(pA, pB);

      expect(midpoint.canvasX).toBe(20);
      expect(midpoint.canvasY).toBe(30);
      expect(midpoint.pressure).toBeCloseTo(0.5);
      expect(midpoint.tiltX).toBeCloseTo(10);
      expect(midpoint.tiltY).toBeCloseTo(30);
      expect(midpoint.speed).toBeCloseTo(200);
      expect(midpoint.timeMs).toBeCloseTo(150);
    });

    it("extrapolates virtual boundary points symmetrically", () => {
      const anchor = createTestStrokePoint(50, 50, 0.6, 10, -5, 200, 100);
      const opposite = createTestStrokePoint(30, 20, 0.4, 0, 5, 100, 80);

      const extrapolated = extrapolateBoundaryPoint(anchor, opposite);

      // 2 * 50 - 30 = 70
      expect(extrapolated.canvasX).toBe(70);
      // 2 * 50 - 20 = 80
      expect(extrapolated.canvasY).toBe(80);
      // 2 * 0.6 - 0.4 = 0.8
      expect(extrapolated.pressure).toBeCloseTo(0.8);
      expect(extrapolated.timeMs).toBe(120);
    });
  });

  describe("C¹ Continuity Across Spline Segments", () => {
    it("guarantees C¹ continuous tangents at Catmull-Rom junctions", () => {
      // 5 points forming a curve
      const p0 = createTestStrokePoint(0, 0);
      const p1 = createTestStrokePoint(20, 40);
      const p2 = createTestStrokePoint(60, 50);
      const p3 = createTestStrokePoint(100, 30);
      const p4 = createTestStrokePoint(130, 80);

      // Segment A connects P1 -> P2 using P0, P1, P2, P3
      const segmentA = fitCatmullRomToBezier(p0, p1, p2, p3);
      // Segment B connects P2 -> P3 using P1, P2, P3, P4
      const segmentB = fitCatmullRomToBezier(p1, p2, p3, p4);

      // Exit tangent of Segment A at t = 1.0 (junction P2)
      const tangentA = evaluateCubicBezierTangent2D(
        segmentA.p0,
        segmentA.c1,
        segmentA.c2,
        segmentA.p3,
        1.0
      );

      // Entrance tangent of Segment B at t = 0.0 (junction P2)
      const tangentB = evaluateCubicBezierTangent2D(
        segmentB.p0,
        segmentB.c1,
        segmentB.c2,
        segmentB.p3,
        0.0
      );

      // The tangents must match exactly
      expect(tangentA.x).toBeCloseTo(tangentB.x, 5);
      expect(tangentA.y).toBeCloseTo(tangentB.y, 5);
    });

    it("guarantees C¹ continuous tangents at Midpoint Bézier junctions", () => {
      const p0 = createTestStrokePoint(0, 0);
      const p1 = createTestStrokePoint(40, 80);
      const p2 = createTestStrokePoint(100, 60);
      const p3 = createTestStrokePoint(140, 10);

      const m0 = interpolateStrokePointMidpoint(p0, p1);
      const m1 = interpolateStrokePointMidpoint(p1, p2);
      const m2 = interpolateStrokePointMidpoint(p2, p3);

      // Segment 1 connects M0 -> M1 with control point P1
      const segment1 = fitMidpointSegmentToBezier(m0, p1, m1);
      // Segment 2 connects M1 -> M2 with control point P2
      const segment2 = fitMidpointSegmentToBezier(m1, p2, m2);

      const exitTangent = evaluateCubicBezierTangent2D(
        segment1.p0,
        segment1.c1,
        segment1.c2,
        segment1.p3,
        1.0
      );

      const entranceTangent = evaluateCubicBezierTangent2D(
        segment2.p0,
        segment2.c1,
        segment2.c2,
        segment2.p3,
        0.0
      );

      expect(exitTangent.x).toBeCloseTo(entranceTangent.x, 5);
      expect(exitTangent.y).toBeCloseTo(entranceTangent.y, 5);
    });
  });

  describe("Streaming Spline Interpolator", () => {
    it("streams Catmull-Rom spline curves incrementally without missing segments", () => {
      const interpolator = new SplineInterpolator("catmullRom");

      const p0 = createTestStrokePoint(0, 0);
      const p1 = createTestStrokePoint(30, 20);
      const p2 = createTestStrokePoint(70, 50);
      const p3 = createTestStrokePoint(110, 40);
      const p4 = createTestStrokePoint(150, 90);

      // P0: stroke start -> 0 segments
      const segs0 = interpolator.beginStroke(p0);
      expect(segs0).toHaveLength(0);

      // P1: waiting for lookahead -> 0 segments
      const segs1 = interpolator.pushPoint(p1);
      expect(segs1).toHaveLength(0);

      // P2: first segment P0->P1 emitted
      const segs2 = interpolator.pushPoint(p2);
      expect(segs2).toHaveLength(1);
      expect(segs2[0].p0.x).toBe(p0.canvasX);
      expect(segs2[0].p3.x).toBe(p1.canvasX);

      // P3: segment P1->P2 emitted
      const segs3 = interpolator.pushPoint(p3);
      expect(segs3).toHaveLength(1);
      expect(segs3[0].p0.x).toBe(p1.canvasX);
      expect(segs3[0].p3.x).toBe(p2.canvasX);

      // P4: segment P2->P3 emitted
      const segs4 = interpolator.pushPoint(p4);
      expect(segs4).toHaveLength(1);
      expect(segs4[0].p0.x).toBe(p2.canvasX);
      expect(segs4[0].p3.x).toBe(p3.canvasX);

      // endStroke: final boundary segment P3->P4 emitted
      const finalSegs = interpolator.endStroke();
      expect(finalSegs).toHaveLength(1);
      expect(finalSegs[0].p0.x).toBe(p3.canvasX);
      expect(finalSegs[0].p3.x).toBe(p4.canvasX);
    });

    it("streams Midpoint Bézier curves with immediate emission per event", () => {
      const interpolator = new SplineInterpolator("midpoint");

      const p0 = createTestStrokePoint(0, 0);
      const p1 = createTestStrokePoint(40, 40);
      const p2 = createTestStrokePoint(80, 20);

      const segs0 = interpolator.beginStroke(p0);
      expect(segs0).toHaveLength(0);

      // P1: emits P0 -> M0
      const segs1 = interpolator.pushPoint(p1);
      expect(segs1).toHaveLength(1);
      expect(segs1[0].p0.x).toBe(0);
      expect(segs1[0].p3.x).toBe(20); // Midpoint of 0 and 40

      // P2: emits M0 -> M1 with control P1
      const segs2 = interpolator.pushPoint(p2);
      expect(segs2).toHaveLength(1);
      expect(segs2[0].p0.x).toBe(20);
      expect(segs2[0].p3.x).toBe(60); // Midpoint of 40 and 80

      // endStroke: emits M1 -> P2
      const finalSegs = interpolator.endStroke();
      expect(finalSegs).toHaveLength(1);
      expect(finalSegs[0].p0.x).toBe(60);
      expect(finalSegs[0].p3.x).toBe(80);
    });
  });

  describe("Degenerate & Boundary Conditions", () => {
    it("handles single-point stroke without emitting segments", () => {
      const interpolatorCatmull = new SplineInterpolator("catmullRom");
      interpolatorCatmull.beginStroke(createTestStrokePoint(50, 50));
      expect(interpolatorCatmull.endStroke()).toHaveLength(0);

      const interpolatorMidpoint = new SplineInterpolator("midpoint");
      interpolatorMidpoint.beginStroke(createTestStrokePoint(50, 50));
      expect(interpolatorMidpoint.endStroke()).toHaveLength(0);
    });

    it("handles two-point stroke correctly in both modes", () => {
      const p0 = createTestStrokePoint(10, 10);
      const p1 = createTestStrokePoint(50, 90);

      // Catmull-Rom
      const catmull = new SplineInterpolator("catmullRom");
      catmull.beginStroke(p0);
      catmull.pushPoint(p1);
      const catmullSegs = catmull.endStroke();
      expect(catmullSegs).toHaveLength(1);
      expect(catmullSegs[0].p0.x).toBe(10);
      expect(catmullSegs[0].p3.x).toBe(50);

      // Midpoint
      const midpoint = new SplineInterpolator("midpoint");
      midpoint.beginStroke(p0);
      const mid1 = midpoint.pushPoint(p1);
      expect(mid1).toHaveLength(1);
      const midFinal = midpoint.endStroke();
      expect(midFinal).toHaveLength(1);

      // Total path connects p0 -> M -> p1
      expect(mid1[0].p0.x).toBe(10);
      expect(mid1[0].p3.x).toBe(30);
      expect(midFinal[0].p0.x).toBe(30);
      expect(midFinal[0].p3.x).toBe(50);
    });

    it("handles completely coincident points without NaN or infinite values", () => {
      const p = createTestStrokePoint(75, 75, 0.5);
      const interpolator = new SplineInterpolator("catmullRom");

      interpolator.beginStroke(p);
      interpolator.pushPoint(p);
      interpolator.pushPoint(p);
      interpolator.pushPoint(p);
      const segments = interpolator.endStroke();

      for (const seg of segments) {
        expect(Number.isFinite(seg.c1.x)).toBe(true);
        expect(Number.isFinite(seg.c1.y)).toBe(true);
        expect(Number.isFinite(seg.c2.x)).toBe(true);
        expect(Number.isFinite(seg.c2.y)).toBe(true);
        expect(seg.p0.x).toBe(75);
        expect(seg.p3.x).toBe(75);
      }
    });
  });

  describe("Physical Sensor Interpolation", () => {
    it("smoothly interpolates pressure, tilt, speed, and timeMs along a segment", () => {
      const p1 = createTestStrokePoint(0, 0, 0.2, -15, 30, 100, 1000);
      const p2 = createTestStrokePoint(100, 0, 0.8, 25, -10, 400, 1100);

      const segment = fitCatmullRomToBezier(
        createTestStrokePoint(-50, 0),
        p1,
        p2,
        createTestStrokePoint(150, 0)
      );

      const midProps = interpolateSegmentProperties(segment, 0.5);
      expect(midProps.pressure).toBeCloseTo(0.5, 4);
      expect(midProps.tiltX).toBeCloseTo(5, 4);
      expect(midProps.tiltY).toBeCloseTo(10, 4);
      expect(midProps.speed).toBeCloseTo(250, 4);
      expect(midProps.timeMs).toBeCloseTo(1050, 4);

      const startProps = interpolateSegmentProperties(segment, 0.0);
      expect(startProps.pressure).toBeCloseTo(0.2, 4);
      expect(startProps.speed).toBeCloseTo(100, 4);

      const endProps = interpolateSegmentProperties(segment, 1.0);
      expect(endProps.pressure).toBeCloseTo(0.8, 4);
      expect(endProps.speed).toBeCloseTo(400, 4);
    });
  });

  describe("Batch Spline Utilities", () => {
    it("generates entire spline path matching point count and bounds", () => {
      const points = [
        createTestStrokePoint(0, 0),
        createTestStrokePoint(20, 50),
        createTestStrokePoint(50, 80),
        createTestStrokePoint(90, 40),
        createTestStrokePoint(120, 10),
      ];

      const catmullSpline = generateCatmullRomSpline(points);
      expect(catmullSpline).toHaveLength(4);
      expect(catmullSpline[0].p0.x).toBe(0);
      expect(catmullSpline[3].p3.x).toBe(120);

      const midpointSpline = generateMidpointSpline(points);
      expect(midpointSpline).toHaveLength(5);
      expect(midpointSpline[0].p0.x).toBe(0);
      expect(midpointSpline[4].p3.x).toBe(120);
    });
  });
});
