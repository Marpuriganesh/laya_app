/**
 * Dynamics Curve Math & Response Evaluation
 * Evaluates Krita and Photoshop-style dynamics response curves for brush sensors.
 * Pure, side-effect free algorithmic module.
 */

import type { DynamicsCurvePoint, DynamicsMapping } from "../../types/brush";

/**
 * Clamps a number to the range [minimum, maximum].
 */
export function clampScalar(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/**
 * Evaluates a piecewise linear response curve defined by sorted control points.
 * If sensor input is outside the control point range, clamps to the nearest endpoint value.
 *
 * @param curvePoints Array of sorted control points where inputValue is in [0, 1]
 * @param sensorInputValue Current sensor input value (e.g. pressure, speed, tilt)
 * @returns Evaluated output parameter scaling in [0, 1]
 */
export function evaluatePiecewiseLinearCurve(
  curvePoints: readonly DynamicsCurvePoint[],
  sensorInputValue: number
): number {
  if (curvePoints.length === 0) {
    return clampScalar(sensorInputValue, 0.0, 1.0);
  }

  if (curvePoints.length === 1) {
    return clampScalar(curvePoints[0].outputValue, 0.0, 1.0);
  }

  const clampedInput = clampScalar(sensorInputValue, 0.0, 1.0);

  // If input is before or at the first point
  if (clampedInput <= curvePoints[0].inputValue) {
    return clampScalar(curvePoints[0].outputValue, 0.0, 1.0);
  }

  // If input is after or at the last point
  const lastIndex = curvePoints.length - 1;
  if (clampedInput >= curvePoints[lastIndex].inputValue) {
    return clampScalar(curvePoints[lastIndex].outputValue, 0.0, 1.0);
  }

  // Find the bounding segment [pointIndex, pointIndex + 1]
  for (let pointIndex = 0; pointIndex < lastIndex; pointIndex++) {
    const startPoint = curvePoints[pointIndex];
    const endPoint = curvePoints[pointIndex + 1];

    if (clampedInput >= startPoint.inputValue && clampedInput <= endPoint.inputValue) {
      const segmentSpan = endPoint.inputValue - startPoint.inputValue;
      if (segmentSpan < 1e-6) {
        return clampScalar(endPoint.outputValue, 0.0, 1.0);
      }

      const segmentRatio = (clampedInput - startPoint.inputValue) / segmentSpan;
      const interpolatedOutput = startPoint.outputValue + (endPoint.outputValue - startPoint.outputValue) * segmentRatio;
      return clampScalar(interpolatedOutput, 0.0, 1.0);
    }
  }

  return clampScalar(curvePoints[lastIndex].outputValue, 0.0, 1.0);
}

/**
 * Creates a standard linear 1:1 default curve: (0, 0) -> (1, 1).
 */
export function createLinearDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

/**
 * Creates a standard ease-in (harder pressure required) curve.
 */
export function createEaseInDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 0.5, outputValue: 0.25 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

/**
 * Creates a standard ease-out (softer pressure required) curve.
 */
export function createEaseOutDynamicsCurve(): readonly DynamicsCurvePoint[] {
  return [
    { inputValue: 0.0, outputValue: 0.0 },
    { inputValue: 0.5, outputValue: 0.75 },
    { inputValue: 1.0, outputValue: 1.0 },
  ];
}

/**
 * Evaluates a sensor dynamics curve or mapping for a given sensor input value.
 * If mapping is null, undefined, or disabled, returns fallbackValue (default 1.0).
 *
 * @param mappingOrPoints DynamicsMapping, array of DynamicsCurvePoint, or null/undefined
 * @param sensorInputValue Sensor input value (e.g. pressure, speed, tilt) in range [0, 1]
 * @param fallbackValue Value to return if curve is absent or disabled (default 1.0)
 * @returns Evaluated output parameter scaling in range [0, 1]
 */
export function evaluateDynamicsCurve(
  mappingOrPoints: DynamicsMapping | readonly DynamicsCurvePoint[] | null | undefined,
  sensorInputValue: number,
  fallbackValue: number = 1.0
): number {
  if (!mappingOrPoints) {
    return fallbackValue;
  }

  if ("isEnabled" in mappingOrPoints) {
    if (!mappingOrPoints.isEnabled) {
      return fallbackValue;
    }
    return evaluatePiecewiseLinearCurve(mappingOrPoints.curvePoints, sensorInputValue);
  }

  return evaluatePiecewiseLinearCurve(mappingOrPoints, sensorInputValue);
}
