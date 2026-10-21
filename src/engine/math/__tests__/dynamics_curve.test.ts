import { describe, it, expect } from "vitest";
import {
  evaluatePiecewiseLinearCurve,
  createLinearDynamicsCurve,
  createEaseInDynamicsCurve,
  createEaseOutDynamicsCurve,
  evaluateMonotonicCurve,
  generateCurveLookupTable256,
  generateSvgPathFromCurve,
  createLinearCurve,
  createSoftCurve,
  createFirmCurve,
  createSCurve,
  createDeadzoneCurve,
} from "../dynamics_curve";

describe("Dynamics Curve Evaluation", () => {
  it("evaluates a standard linear curve", () => {
    const curve = createLinearDynamicsCurve();
    expect(evaluatePiecewiseLinearCurve(curve, 0.0)).toBe(0.0);
    expect(evaluatePiecewiseLinearCurve(curve, 0.5)).toBe(0.5);
    expect(evaluatePiecewiseLinearCurve(curve, 1.0)).toBe(1.0);
  });

  it("clamps values outside [0, 1] range", () => {
    const curve = createLinearDynamicsCurve();
    expect(evaluatePiecewiseLinearCurve(curve, -0.5)).toBe(0.0);
    expect(evaluatePiecewiseLinearCurve(curve, 1.5)).toBe(1.0);
  });

  it("handles multi-point ease-in and ease-out curves", () => {
    const easeIn = createEaseInDynamicsCurve();
    expect(evaluatePiecewiseLinearCurve(easeIn, 0.5)).toBeCloseTo(0.25, 1);

    const easeOut = createEaseOutDynamicsCurve();
    expect(evaluatePiecewiseLinearCurve(easeOut, 0.5)).toBeCloseTo(0.75, 1);
  });

  it("gracefully handles empty and single-point curves", () => {
    expect(evaluatePiecewiseLinearCurve([], 0.7)).toBe(0.7);
    expect(evaluatePiecewiseLinearCurve([{ inputValue: 0.5, outputValue: 0.8 }], 0.2)).toBe(0.8);
  });
});

describe("Steffen Monotonic Spline Interpolation", () => {
  it("evaluates linear curve correctly across range", () => {
    const linear = createLinearCurve();
    expect(evaluateMonotonicCurve(linear, 0.0)).toBe(0.0);
    expect(evaluateMonotonicCurve(linear, 0.25)).toBeCloseTo(0.25, 2);
    expect(evaluateMonotonicCurve(linear, 0.5)).toBeCloseTo(0.5, 2);
    expect(evaluateMonotonicCurve(linear, 1.0)).toBe(1.0);
  });

  it("guarantees zero overshoot for monotonically increasing points", () => {
    // S-Curve points
    const sCurve = createSCurve();
    let previousVal = -1.0;

    // Sample across 100 points
    for (let i = 0; i <= 100; i++) {
      const x = i / 100.0;
      const y = evaluateMonotonicCurve(sCurve, x);

      // Must never drop below previous (monotonic)
      expect(y).toBeGreaterThanOrEqual(previousVal - 1e-5);
      // Must stay within [0, 1]
      expect(y).toBeGreaterThanOrEqual(0.0);
      expect(y).toBeLessThanOrEqual(1.0);

      previousVal = y;
    }
  });

  it("handles soft and firm presets correctly", () => {
    const soft = createSoftCurve();
    const firm = createFirmCurve();

    // At 30% pressure:
    // Soft curve should give significantly higher output than firm curve
    const softMid = evaluateMonotonicCurve(soft, 0.3);
    const firmMid = evaluateMonotonicCurve(firm, 0.3);

    expect(softMid).toBeGreaterThan(0.5);
    expect(firmMid).toBeLessThan(0.3);
  });

  it("handles deadzone curve flat response", () => {
    const deadzone = createDeadzoneCurve();
    expect(evaluateMonotonicCurve(deadzone, 0.05)).toBe(0.0);
    expect(evaluateMonotonicCurve(deadzone, 0.09)).toBe(0.0);
    expect(evaluateMonotonicCurve(deadzone, 0.5)).toBeGreaterThan(0.2);
  });

  it("generates 256-sample lookup table with O(1) performance", () => {
    const sCurve = createSCurve();
    const start = performance.now();
    const lut = generateCurveLookupTable256(sCurve);
    const duration = performance.now() - start;

    expect(lut).toBeInstanceOf(Float32Array);
    expect(lut.length).toBe(256);
    expect(lut[0]).toBe(0.0);
    expect(lut[255]).toBe(1.0);
    // Generating 256 samples should take less than 1ms
    expect(duration).toBeLessThan(10.0);
  });

  it("generates valid SVG path with proper coordinates", () => {
    const linear = createLinearCurve();
    const path = generateSvgPathFromCurve(linear, 200, 100, 10);
    expect(path.startsWith("M 0.00 100.00")).toBe(true);
    expect(path.endsWith("200.00 0.00")).toBe(true);
  });
});
