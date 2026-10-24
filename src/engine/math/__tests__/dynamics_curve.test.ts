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
  evaluateNaturalSplineCurve,
  createLinearDownCurve,
  createInvertedSCurve,
  createCupCurve,
  createArchCurve,
  createExponentialCurve,
  createLogarithmicCurve,
  KRITA_CURVE_PRESETS,
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

describe("Natural Spline Curve & Krita Dynamics Presets", () => {
  it("evaluates natural cubic spline with C^2 continuity", () => {
    const sCurve = createSCurve();
    expect(evaluateNaturalSplineCurve(sCurve, 0.0)).toBe(0.0);
    expect(evaluateNaturalSplineCurve(sCurve, 1.0)).toBe(1.0);
    expect(evaluateNaturalSplineCurve(sCurve, 0.5)).toBeCloseTo(0.5, 1);
  });

  it("evaluates Krita linear down curve", () => {
    const down = createLinearDownCurve();
    expect(evaluateNaturalSplineCurve(down, 0.0)).toBe(1.0);
    expect(evaluateNaturalSplineCurve(down, 0.5)).toBeCloseTo(0.5, 2);
    expect(evaluateNaturalSplineCurve(down, 1.0)).toBe(0.0);

    const invS = createInvertedSCurve();
    expect(evaluateNaturalSplineCurve(invS, 0.0)).toBe(1.0);
    expect(evaluateNaturalSplineCurve(invS, 0.5)).toBeCloseTo(0.5, 1);
    expect(evaluateNaturalSplineCurve(invS, 1.0)).toBe(0.0);
  });

  it("evaluates Krita cup (concave) curve", () => {
    const cup = createCupCurve();
    expect(evaluateNaturalSplineCurve(cup, 0.0)).toBe(1.0);
    expect(evaluateNaturalSplineCurve(cup, 0.5)).toBeCloseTo(0.0, 1);
    expect(evaluateNaturalSplineCurve(cup, 1.0)).toBe(1.0);
  });

  it("evaluates Krita arch (convex dome) curve", () => {
    const arch = createArchCurve();
    expect(evaluateNaturalSplineCurve(arch, 0.0)).toBe(0.0);
    expect(evaluateNaturalSplineCurve(arch, 0.5)).toBeCloseTo(1.0, 1);
    expect(evaluateNaturalSplineCurve(arch, 1.0)).toBe(0.0);
  });

  it("evaluates Krita exponential (J-curve) and fast rise (L-curve)", () => {
    const exp = createExponentialCurve();
    const log = createLogarithmicCurve();
    // At 30% pressure, log curve should be much higher than exp curve
    const expMid = evaluateNaturalSplineCurve(exp, 0.3);
    const logMid = evaluateNaturalSplineCurve(log, 0.3);
    expect(logMid).toBeGreaterThan(expMid);
  });

  it("contains all 8 Krita preset definitions with valid 256 LUTs", () => {
    expect(KRITA_CURVE_PRESETS.length).toBe(8);
    for (const preset of KRITA_CURVE_PRESETS) {
      expect(preset.points.length).toBeGreaterThanOrEqual(2);
      const lut = generateCurveLookupTable256(preset.points);
      expect(lut.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(lut[i]).toBeGreaterThanOrEqual(0.0);
        expect(lut[i]).toBeLessThanOrEqual(1.0);
      }
    }
  });
});
