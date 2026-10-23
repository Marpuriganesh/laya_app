/**
 * Pointer Event Normalizer
 * Unprojects screen-space PointerEvents into canvas pixel coordinates,
 * extracts hardware sensor telemetry (pressure, tilt, rotation), and
 * computes real-time stroke velocity.
 */

import type { CanvasTransform } from "@/types/ui";
import type { StrokePoint } from "@/types/stroke";

export interface PointerEventLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure: number;
  readonly pointerType: string;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
  readonly timeStamp?: number;
  getCoalescedEvents?: () => PointerEventLike[];
}

/**
 * Unprojects a screen-space coordinate into canvas space using scale, pan, and rotation.
 */
export function unprojectScreenToCanvas(
  screenX: number,
  screenY: number,
  transform: CanvasTransform
): { canvasX: number; canvasY: number } {
  const safeScale = Math.max(transform.scale, 1e-4);
  const unscaledX = (screenX - transform.panX) / safeScale;
  const unscaledY = (screenY - transform.panY) / safeScale;

  if (transform.rotation) {
    const angleRad = (transform.rotation * Math.PI) / 180;
    const cosAngle = Math.cos(angleRad);
    const sinAngle = Math.sin(angleRad);
    const canvasX = unscaledX * cosAngle + unscaledY * sinAngle;
    const canvasY = -unscaledX * sinAngle + unscaledY * cosAngle;
    return { canvasX, canvasY };
  }

  return { canvasX: unscaledX, canvasY: unscaledY };
}

/**
 * Normalizes pressure for different input devices.
 * Stylus: preserves hardware pressure (0.0 to 1.0).
 * Mouse: defaults to 1.0 when left button is pressed.
 * Touch: defaults to 1.0 if hardware returns 0 or 0.5.
 */
export function normalizePressure(rawPressure: number, pointerType: string): number {
  // If explicitly a pen / stylus, directly preserve hardware analog pressure
  if (pointerType === "pen") {
    return Math.max(0.0, Math.min(1.0, rawPressure));
  }

  // If tablet driver sends analog pressure (non-default value)
  if (rawPressure > 0 && rawPressure !== 0.5) {
    return Math.max(0.0, Math.min(1.0, rawPressure));
  }

  // Default mouse click (W3C standard is 0.5 when button is pressed)
  if (pointerType === "mouse") {
    return rawPressure > 0 ? 1.0 : 0.0;
  }

  // Touch fallback if hardware doesn't report 3D Touch / pressure
  if (pointerType === "touch" && (rawPressure === 0 || rawPressure === 0.5)) {
    return 1.0;
  }

  return Math.max(0.0, Math.min(1.0, rawPressure));
}

/**
 * Computes instantaneous stroke velocity in canvas pixels per second.
 */
export function computeStrokeSpeed(
  currentCanvasX: number,
  currentCanvasY: number,
  currentTimeMs: number,
  previousPoint?: StrokePoint | null
): number {
  if (!previousPoint) return 0.0;

  const deltaX = currentCanvasX - previousPoint.canvasX;
  const deltaY = currentCanvasY - previousPoint.canvasY;
  const distance = Math.hypot(deltaX, deltaY);

  const deltaSeconds = Math.max((currentTimeMs - previousPoint.timeMs) / 1000.0, 0.001);
  return distance / deltaSeconds;
}

/**
 * Normalizes a single raw pointer event into a standard StrokePoint.
 */
export function normalizePointerEvent(
  event: PointerEventLike,
  transform: CanvasTransform,
  previousPoint?: StrokePoint | null,
  customTimeMs?: number
): StrokePoint {
  const { canvasX, canvasY } = unprojectScreenToCanvas(event.clientX, event.clientY, transform);
  const timeMs = customTimeMs ?? event.timeStamp ?? Date.now();
  const pressure = normalizePressure(event.pressure, event.pointerType);
  const speed = computeStrokeSpeed(canvasX, canvasY, timeMs, previousPoint);

  return {
    canvasX,
    canvasY,
    pressure,
    tiltX: event.tiltX ?? 0,
    tiltY: event.tiltY ?? 0,
    rotation: event.twist ?? 0,
    speed,
    timeMs,
  };
}

/**
 * Extracts and normalizes all coalesced hardware events from a PointerEvent.
 * High-end styluses (Apple Pencil, Wacom) generate 120Hz-240Hz coalesced events
 * between standard browser animation frames.
 */
export function normalizeCoalescedPointerEvents(
  event: PointerEventLike,
  transform: CanvasTransform,
  lastKnownPoint?: StrokePoint | null
): StrokePoint[] {
  const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];

  if (coalesced.length === 0) {
    return [normalizePointerEvent(event, transform, lastKnownPoint)];
  }

  const normalizedPoints: StrokePoint[] = [];
  let currentPrevious = lastKnownPoint;
  const count = coalesced.length;
  const eventTime = event.timeStamp ?? Date.now();
  const prevTime = lastKnownPoint?.timeMs ?? (eventTime - count * 8);
  const timeDelta = Math.max(eventTime - prevTime, count * 4);

  // Check if coalesced events have distinct, strictly increasing timestamps
  let hasValidDistinctTimestamps = true;
  let lastTimestamp = prevTime;
  for (const sub of coalesced) {
    const t = sub.timeStamp;
    if (typeof t !== "number" || t <= lastTimestamp || t > eventTime + 5) {
      hasValidDistinctTimestamps = false;
      break;
    }
    lastTimestamp = t;
  }

  for (let i = 0; i < count; i++) {
    const subEvent = coalesced[i];
    const customTime = hasValidDistinctTimestamps
      ? (subEvent.timeStamp as number)
      : prevTime + ((i + 1) / count) * timeDelta;

    const point = normalizePointerEvent(subEvent, transform, currentPrevious, customTime);
    normalizedPoints.push(point);
    currentPrevious = point;
  }

  return normalizedPoints;
}
