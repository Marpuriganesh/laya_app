import { describe, it, expect } from "vitest";
import {
  unprojectScreenToCanvas,
  normalizePressure,
  computeStrokeSpeed,
  normalizePointerEvent,
  normalizeCoalescedPointerEvents,
  type PointerEventLike,
} from "../pointer_event_normalizer";
import type { CanvasTransform } from "@/types/ui";

describe("pointer_event_normalizer", () => {
  const defaultTransform: CanvasTransform = {
    scale: 1.0,
    panX: 0,
    panY: 0,
  };

  it("unprojects screen coordinates at 1:1 scale with zero pan", () => {
    const result = unprojectScreenToCanvas(150, 250, defaultTransform);
    expect(result.canvasX).toBe(150);
    expect(result.canvasY).toBe(250);
  });

  it("unprojects screen coordinates with pan offset and 2x zoom", () => {
    const transform: CanvasTransform = {
      scale: 2.0,
      panX: 100,
      panY: 50,
    };
    // screenX = 300 -> (300 - 100) / 2 = 100
    // screenY = 250 -> (250 - 50) / 2 = 100
    const result = unprojectScreenToCanvas(300, 250, transform);
    expect(result.canvasX).toBe(100);
    expect(result.canvasY).toBe(100);
  });

  it("unprojects screen coordinates when canvas is rotated by 90 degrees", () => {
    // 90° clockwise rotation around origin:
    // A point at (100, 0) in canvas coordinates rotates to (0, 100) on screen.
    const transform: CanvasTransform = {
      scale: 1.0,
      panX: 0,
      panY: 0,
      rotation: 90,
    };
    const result = unprojectScreenToCanvas(0, 100, transform);
    expect(result.canvasX).toBeCloseTo(100);
    expect(result.canvasY).toBeCloseTo(0);
  });

  it("normalizes pressure correctly across stylus, mouse, and touch", () => {
    // Stylus: preserves hardware pressure
    expect(normalizePressure(0.72, "pen")).toBe(0.72);
    expect(normalizePressure(0.0, "pen")).toBe(0.0);
    expect(normalizePressure(1.5, "pen")).toBe(1.0); // Clamped

    // Mouse: active click gives 1.0
    expect(normalizePressure(0.5, "mouse")).toBe(1.0);
    expect(normalizePressure(0.0, "mouse")).toBe(0.0);

    // Touch: default touch without pressure returns 1.0
    expect(normalizePressure(0.5, "touch")).toBe(1.0);
    expect(normalizePressure(0.85, "touch")).toBe(0.85);
  });

  it("computes instantaneous stroke speed accurately", () => {
    const point1 = {
      canvasX: 0,
      canvasY: 0,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 0,
      timeMs: 1000,
    };

    // Moved 100 pixels in 0.1 seconds (100ms) -> 1000 px/sec
    const speed = computeStrokeSpeed(100, 0, 1100, point1);
    expect(speed).toBeCloseTo(1000);
  });

  it("normalizes a full pointer event", () => {
    const mockEvent: PointerEventLike = {
      clientX: 500,
      clientY: 300,
      pressure: 0.65,
      pointerType: "pen",
      tiltX: 15,
      tiltY: -20,
      twist: 45,
      timeStamp: 2000,
    };

    const strokePoint = normalizePointerEvent(mockEvent, defaultTransform);
    expect(strokePoint.canvasX).toBe(500);
    expect(strokePoint.canvasY).toBe(300);
    expect(strokePoint.pressure).toBe(0.65);
    expect(strokePoint.tiltX).toBe(15);
    expect(strokePoint.tiltY).toBe(-20);
    expect(strokePoint.rotation).toBe(45);
    expect(strokePoint.speed).toBe(0);
    expect(strokePoint.timeMs).toBe(2000);
  });

  it("handles coalesced events when available", () => {
    const subEvents: PointerEventLike[] = [
      { clientX: 10, clientY: 10, pressure: 0.2, pointerType: "pen", timeStamp: 1000 },
      { clientX: 20, clientY: 20, pressure: 0.4, pointerType: "pen", timeStamp: 1008 },
      { clientX: 30, clientY: 30, pressure: 0.6, pointerType: "pen", timeStamp: 1016 },
    ];

    const mainEvent: PointerEventLike = {
      clientX: 30,
      clientY: 30,
      pressure: 0.6,
      pointerType: "pen",
      timeStamp: 1016,
      getCoalescedEvents: () => subEvents,
    };

    const points = normalizeCoalescedPointerEvents(mainEvent, defaultTransform);
    expect(points.length).toBe(3);
    expect(points[0].canvasX).toBe(10);
    expect(points[1].canvasX).toBe(20);
    expect(points[2].canvasX).toBe(30);
  });

  it("smoothly interpolates timestamps for coalesced events with identical browser timestamps", () => {
    // Browsers often emit identical timestamps across all coalesced items
    const subEvents: PointerEventLike[] = [
      { clientX: 10, clientY: 10, pressure: 0.5, pointerType: "pen", timeStamp: 1016 },
      { clientX: 20, clientY: 20, pressure: 0.5, pointerType: "pen", timeStamp: 1016 },
      { clientX: 30, clientY: 30, pressure: 0.5, pointerType: "pen", timeStamp: 1016 },
    ];

    const mainEvent: PointerEventLike = {
      clientX: 30,
      clientY: 30,
      pressure: 0.5,
      pointerType: "pen",
      timeStamp: 1016,
      getCoalescedEvents: () => subEvents,
    };

    const prevPoint = {
      canvasX: 0,
      canvasY: 0,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 0,
      timeMs: 1000,
    };

    const points = normalizeCoalescedPointerEvents(mainEvent, defaultTransform, prevPoint);
    expect(points.length).toBe(3);
    // Timestamps must be strictly increasing and not equal to prevent speed explosion
    expect(points[0].timeMs).toBeGreaterThan(1000);
    expect(points[1].timeMs).toBeGreaterThan(points[0].timeMs);
    expect(points[2].timeMs).toBeGreaterThan(points[1].timeMs);
    // Speeds should remain reasonable, not 5000+ px/sec
    for (const p of points) {
      expect(p.speed).toBeLessThan(3000);
    }
  });
});
