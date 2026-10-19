import { describe, it, expect } from "vitest";
import {
  evaluatePiecewiseLinearCurve,
  createLinearDynamicsCurve,
  createEaseInDynamicsCurve,
  createEaseOutDynamicsCurve,
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
    expect(evaluatePiecewiseLinearCurve(easeIn, 0.5)).toBeCloseTo(0.25);

    const easeOut = createEaseOutDynamicsCurve();
    expect(evaluatePiecewiseLinearCurve(easeOut, 0.5)).toBeCloseTo(0.75);
  });

  it("gracefully handles empty and single-point curves", () => {
    expect(evaluatePiecewiseLinearCurve([], 0.7)).toBe(0.7);
    expect(evaluatePiecewiseLinearCurve([{ inputValue: 0.5, outputValue: 0.8 }], 0.2)).toBe(0.8);
  });
});
