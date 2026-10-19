import { describe, expect, it } from "vitest";
import type { CubicBezierSegment, StrokePoint } from "../../../types/stroke";
import {
  CubicBezierArcLengthTable,
} from "../../math/bezier_arc_length";
import { calculateDistance } from "../../math/vector2d";
import { DabSpacingCalculator } from "../dab_spacing_calculator";
import { SplineInterpolator } from "../spline_interpolator";

function createPoint(
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

describe("Dab Spacing Calculator", () => {
  describe("Constant Euclidean Spacing Along Straight Lines", () => {
    it("emits dabs at exact Euclidean distance intervals along a straight horizontal Bézier segment", () => {
      const calculator = new DabSpacingCalculator();
      const origin = createPoint(0, 0);
      const initialDabs = calculator.beginStroke(origin);
      expect(initialDabs).toHaveLength(1);
      expect(initialDabs[0].canvasX).toBe(0);

      // Horizontal straight line segment of length 120px
      const segment: CubicBezierSegment = {
        p0: { x: 0, y: 0 },
        c1: { x: 40, y: 0 },
        c2: { x: 80, y: 0 },
        p3: { x: 120, y: 0 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 0,
        endTimeMs: 120,
      };

      const stepPx = 10.0;
      const dabs = calculator.processBezierSegment(segment, stepPx);

      // 12 dabs expected at x = 10, 20, 30, ..., 120
      expect(dabs).toHaveLength(12);

      for (let index = 0; index < dabs.length; index += 1) {
        const expectedX = (index + 1) * stepPx;
        expect(dabs[index].canvasX).toBeCloseTo(expectedX, 4);
        expect(dabs[index].canvasY).toBeCloseTo(0.0, 4);
      }

      // Check distance between consecutive dabs
      for (let index = 1; index < dabs.length; index += 1) {
        const dist = calculateDistance(
          { x: dabs[index - 1].canvasX, y: dabs[index - 1].canvasY },
          { x: dabs[index].canvasX, y: dabs[index].canvasY }
        );
        expect(dist).toBeCloseTo(stepPx, 4);
      }

      // Exact leftover distance at end of 120px with step 10px should be 0
      expect(calculator.getLeftoverDistance()).toBeCloseTo(0.0, 4);
    });

    it("emits dabs along diagonal lines with exact Euclidean distance spacing", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(0, 0));

      // 3-4-5 right triangle: (0,0) to (60, 80) -> length = 100px
      const segment: CubicBezierSegment = {
        p0: { x: 0, y: 0 },
        c1: { x: 20, y: 26.666666666666668 },
        c2: { x: 40, y: 53.333333333333336 },
        p3: { x: 60, y: 80 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 0,
        endTimeMs: 100,
      };

      const stepPx = 15.0;
      const dabs = calculator.processBezierSegment(segment, stepPx);

      // 100 / 15 = 6 dabs (at 15, 30, 45, 60, 75, 90)
      expect(dabs).toHaveLength(6);

      // Verify distance between consecutive dabs
      for (let index = 1; index < dabs.length; index += 1) {
        const dist = calculateDistance(
          { x: dabs[index - 1].canvasX, y: dabs[index - 1].canvasY },
          { x: dabs[index].canvasX, y: dabs[index].canvasY }
        );
        expect(dist).toBeCloseTo(stepPx, 4);
      }

      // Leftover should be 100 - 90 = 10px
      expect(calculator.getLeftoverDistance()).toBeCloseTo(10.0, 4);
    });
  });

  describe("Arc-Length Spacing on Sharp S-Curves", () => {
    it("guarantees constant arc-length spacing along high-curvature S-curves", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(0, 0));

      // Classic S-curve with non-linear parameter velocity
      const sCurve: CubicBezierSegment = {
        p0: { x: 0, y: 0 },
        c1: { x: 0, y: 120 },
        c2: { x: 120, y: 0 },
        p3: { x: 120, y: 120 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 0,
        endTimeMs: 100,
      };

      const arcTable = new CubicBezierArcLengthTable(
        sCurve.p0,
        sCurve.c1,
        sCurve.c2,
        sCurve.p3
      );
      const totalCurveLength = arcTable.totalLength;
      expect(totalCurveLength).toBeGreaterThan(150);

      const stepPx = 8.0;
      const dabs = calculator.processBezierSegment(sCurve, stepPx);

      const expectedDabCount = Math.floor(totalCurveLength / stepPx);
      expect(dabs).toHaveLength(expectedDabCount);

      // Verify each dab is at exactly k * stepPx arc length along the curve
      for (let index = 0; index < dabs.length; index += 1) {
        const expectedArcDistance = (index + 1) * stepPx;
        const expectedPos = arcTable.evaluatePositionAtArcLength(expectedArcDistance);

        expect(dabs[index].canvasX).toBeCloseTo(expectedPos.x, 3);
        expect(dabs[index].canvasY).toBeCloseTo(expectedPos.y, 3);
      }
    });
  });

  describe("Leftover Distance Continuity Across Segments", () => {
    it("seamlessly transfers leftover distance between consecutive spline segments without gaps or clumping", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(0, 0));

      const stepPx = 10.0;

      // Segment 1: length = 25px
      const seg1: CubicBezierSegment = {
        p0: { x: 0, y: 0 },
        c1: { x: 8.333, y: 0 },
        c2: { x: 16.666, y: 0 },
        p3: { x: 25, y: 0 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 0,
        endTimeMs: 25,
      };

      const dabs1 = calculator.processBezierSegment(seg1, stepPx);
      // Dabs at 10px and 20px -> 2 dabs
      expect(dabs1).toHaveLength(2);
      expect(dabs1[0].canvasX).toBeCloseTo(10.0, 3);
      expect(dabs1[1].canvasX).toBeCloseTo(20.0, 3);
      // Leftover = 25 - 20 = 5px
      expect(calculator.getLeftoverDistance()).toBeCloseTo(5.0, 3);

      // Segment 2: length = 8px (from x=25 to x=33)
      const seg2: CubicBezierSegment = {
        p0: { x: 25, y: 0 },
        c1: { x: 27.666, y: 0 },
        c2: { x: 30.333, y: 0 },
        p3: { x: 33, y: 0 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 25,
        endTimeMs: 33,
      };

      const dabs2 = calculator.processBezierSegment(seg2, stepPx);
      // First dab in seg2 at stepPx - leftover = 10 - 5 = 5px into seg2 -> canvasX = 30px!
      expect(dabs2).toHaveLength(1);
      expect(dabs2[0].canvasX).toBeCloseTo(30.0, 3);

      // Distance between last dab of seg1 (x=20) and first dab of seg2 (x=30) must be EXACTLY 10px!
      const distanceAcrossBoundary = dabs2[0].canvasX - dabs1[1].canvasX;
      expect(distanceAcrossBoundary).toBeCloseTo(stepPx, 3);

      // Leftover = 8 - 5 = 3px
      expect(calculator.getLeftoverDistance()).toBeCloseTo(3.0, 3);

      // Segment 3: length = 4px (from x=33 to x=37)
      // Step = 10px, required distance = 10 - 3 = 7px > 4px -> 0 dabs!
      const seg3: CubicBezierSegment = {
        p0: { x: 33, y: 0 },
        c1: { x: 34.333, y: 0 },
        c2: { x: 35.666, y: 0 },
        p3: { x: 37, y: 0 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 33,
        endTimeMs: 37,
      };

      const dabs3 = calculator.processBezierSegment(seg3, stepPx);
      expect(dabs3).toHaveLength(0);
      // Leftover accumulates: 3 + 4 = 7px!
      expect(calculator.getLeftoverDistance()).toBeCloseTo(7.0, 3);

      // Segment 4: length = 15px (from x=37 to x=52)
      // First dab at 10 - 7 = 3px into seg4 -> canvasX = 40px!
      // Second dab at 3 + 10 = 13px into seg4 -> canvasX = 50px!
      const seg4: CubicBezierSegment = {
        p0: { x: 37, y: 0 },
        c1: { x: 42, y: 0 },
        c2: { x: 47, y: 0 },
        p3: { x: 52, y: 0 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 37,
        endTimeMs: 52,
      };

      const dabs4 = calculator.processBezierSegment(seg4, stepPx);
      expect(dabs4).toHaveLength(2);
      expect(dabs4[0].canvasX).toBeCloseTo(40.0, 3);
      expect(dabs4[1].canvasX).toBeCloseTo(50.0, 3);

      // Distance from dab in seg2 (x=30) to first dab in seg4 (x=40) must be EXACTLY 10px!
      expect(dabs4[0].canvasX - dabs2[0].canvasX).toBeCloseTo(stepPx, 3);
      // Leftover = 15 - 13 = 2px
      expect(calculator.getLeftoverDistance()).toBeCloseTo(2.0, 3);
    });
  });

  describe("High-Speed Simulated Stylus Flicks", () => {
    it("maintains uniform, unbroken dab density during rapid stylus movements", () => {
      // Simulate high-speed flick where pointer events arrive 80px apart
      const flickPoints = [
        createPoint(100, 100, 0.8, 10, 15, 600, 10),
        createPoint(180, 130, 0.7, 12, 10, 800, 20),
        createPoint(260, 170, 0.5, 14, 5, 950, 30),
        createPoint(350, 220, 0.3, 15, 0, 1100, 40),
        createPoint(440, 280, 0.1, 15, -5, 1200, 50),
      ];

      const interpolator = new SplineInterpolator("catmullRom");
      const calculator = new DabSpacingCalculator();

      calculator.beginStroke(flickPoints[0]);
      interpolator.beginStroke(flickPoints[0]);

      const allEmittedDabs = [];
      const stepPx = 5.0;

      for (let index = 1; index < flickPoints.length; index += 1) {
        const segments = interpolator.pushPoint(flickPoints[index]);
        for (const seg of segments) {
          const dabs = calculator.processBezierSegment(seg, stepPx);
          allEmittedDabs.push(...dabs);
        }
      }

      const finalSegments = interpolator.endStroke();
      for (const seg of finalSegments) {
        const dabs = calculator.processBezierSegment(seg, stepPx);
        allEmittedDabs.push(...dabs);
      }

      // Total Euclidean distance from (100,100) to (440,280) is ~384px direct chord, curve > 390px
      // With step 5px, we expect around ~75-85 dabs
      expect(allEmittedDabs.length).toBeGreaterThan(70);

      // Verify that no two consecutive dabs have distance > 1.2 * stepPx (no gaps)
      // and no two consecutive dabs have distance < 0.8 * stepPx (no clumping)
      for (let index = 1; index < allEmittedDabs.length; index += 1) {
        const prev = allEmittedDabs[index - 1];
        const curr = allEmittedDabs[index];
        const dist = calculateDistance(
          { x: prev.canvasX, y: prev.canvasY },
          { x: curr.canvasX, y: curr.canvasY }
        );

        expect(dist).toBeGreaterThan(stepPx * 0.85);
        expect(dist).toBeLessThan(stepPx * 1.15);
      }
    });
  });

  describe("Sensor Property Interpolation", () => {
    it("smoothly interpolates pressure, tilt, speed, and timeMs along Bézier segments", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(0, 0));

      const segment: CubicBezierSegment = {
        p0: { x: 0, y: 0 },
        c1: { x: 100 / 3, y: 0 },
        c2: { x: 200 / 3, y: 0 },
        p3: { x: 100, y: 0 },
        startPressure: 0.2,
        endPressure: 0.8,
        startTimeMs: 1000,
        endTimeMs: 1100,
        startTiltX: -20,
        endTiltX: 40,
        startTiltY: 10,
        endTiltY: 50,
        startSpeed: 100,
        endSpeed: 500,
      };

      const stepPx = 25.0;
      const dabs = calculator.processBezierSegment(segment, stepPx);

      // 4 dabs at x = 25, 50, 75, 100 (t = 0.25, 0.5, 0.75, 1.0)
      expect(dabs).toHaveLength(4);

      // At x = 25 (t = 0.25)
      expect(dabs[0].pressure).toBeCloseTo(0.2 + 0.6 * 0.25, 3);
      expect(dabs[0].tiltX).toBeCloseTo(-20 + 60 * 0.25, 3);
      expect(dabs[0].speed).toBeCloseTo(100 + 400 * 0.25, 3);
      expect(dabs[0].timeMs).toBeCloseTo(1000 + 100 * 0.25, 3);

      // At x = 50 (t = 0.5)
      expect(dabs[1].pressure).toBeCloseTo(0.5, 3);
      expect(dabs[1].tiltX).toBeCloseTo(10.0, 3);
      expect(dabs[1].tiltY).toBeCloseTo(30.0, 3);
      expect(dabs[1].speed).toBeCloseTo(300.0, 3);
      expect(dabs[1].timeMs).toBeCloseTo(1050.0, 3);

      // At x = 100 (t = 1.0)
      expect(dabs[3].pressure).toBeCloseTo(0.8, 3);
      expect(dabs[3].tiltX).toBeCloseTo(40.0, 3);
      expect(dabs[3].speed).toBeCloseTo(500.0, 3);
    });
  });

  describe("Degenerate and Edge Cases", () => {
    it("handles zero-length Bézier segments safely without throwing", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(50, 50));

      const degenerateSegment: CubicBezierSegment = {
        p0: { x: 50, y: 50 },
        c1: { x: 50, y: 50 },
        c2: { x: 50, y: 50 },
        p3: { x: 50, y: 50 },
        startPressure: 0.5,
        endPressure: 0.5,
        startTimeMs: 0,
        endTimeMs: 0,
      };

      const dabs = calculator.processBezierSegment(degenerateSegment, 10.0);
      expect(dabs).toHaveLength(0);
    });

    it("resets leftover distance on endStroke", () => {
      const calculator = new DabSpacingCalculator();
      calculator.beginStroke(createPoint(0, 0));
      calculator.setLeftoverDistance(8.5);
      expect(calculator.getLeftoverDistance()).toBeCloseTo(8.5);

      calculator.endStroke();
      expect(calculator.getLeftoverDistance()).toBe(0.0);
    });
  });
});
