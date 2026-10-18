import { describe, it, expect } from "vitest";
import {
  calculateWindowBoundaries,
  applyMagneticResistance,
  calculateSnappedPosition,
} from "../useDraggableWindow";

describe("calculateWindowBoundaries", () => {
  it("enforces strict top navbar barrier (minY = 0)", () => {
    const bounds = calculateWindowBoundaries(1920, 1080, 320, 520, 64, 16);
    expect(bounds.minY).toBe(0);
  });

  it("calculates maxX as 0 for right-anchored popovers", () => {
    const bounds = calculateWindowBoundaries(1920, 1080, 320, 520, 64, 16);
    expect(bounds.maxX).toBe(0);
  });

  it("calculates correct negative minX for leftward translation across viewport", () => {
    // Viewport width = 1920, window = 320, margin = 16 (both sides = 32)
    // 1920 - 320 - 32 = 1568
    const bounds = calculateWindowBoundaries(1920, 1080, 320, 520, 64, 16);
    expect(bounds.minX).toBe(-1568);
  });

  it("calculates correct maxY accounting for navbar and window height", () => {
    // 1080 - 64 (navbar) - 520 (window) - 16 (margin) = 480
    const bounds = calculateWindowBoundaries(1920, 1080, 320, 520, 64, 16);
    expect(bounds.maxY).toBe(480);
  });

  it("handles zero or negative viewport gracefully without crashing", () => {
    const bounds = calculateWindowBoundaries(0, 0, 320, 520);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(0);
  });
});

describe("applyMagneticResistance", () => {
  const minBound = -1000;
  const maxBound = 0;
  const magneticBand = 24;

  it("leaves values untouched when well within normal interior bounds", () => {
    const result = applyMagneticResistance(-500, minBound, maxBound, magneticBand, 0.4);
    expect(result).toBe(-500);
  });

  it("dampens movement near max bound with resistance factor 0.4", () => {
    // rawValue = -10 is within magneticBand (24) of maxBound (0)
    // damped = 0 + (-10 - 0) * 0.4 = -4
    const result = applyMagneticResistance(-10, minBound, maxBound, magneticBand, 0.4);
    expect(result).toBeCloseTo(-4);
  });

  it("dampens movement near min bound with resistance factor 0.4", () => {
    // rawValue = -990 is within magneticBand (24) of minBound (-1000)
    // delta = -990 - (-1000) = 10
    // damped = -1000 + 10 * 0.4 = -996
    const result = applyMagneticResistance(-990, minBound, maxBound, magneticBand, 0.4);
    expect(result).toBeCloseTo(-996);
  });

  it("strictly clamps values that exceed maximum bound", () => {
    const result = applyMagneticResistance(50, minBound, maxBound, magneticBand, 0.4);
    expect(result).toBe(maxBound);
  });

  it("strictly clamps values that exceed minimum bound", () => {
    const result = applyMagneticResistance(-1200, minBound, maxBound, magneticBand, 0.4);
    expect(result).toBe(minBound);
  });
});

describe("calculateSnappedPosition", () => {
  const boundaries = {
    minX: -1500,
    maxX: 0,
    minY: 0,
    maxY: 500,
  };
  const homeX = 0;
  const homeY = 0;
  const snapDistance = 45;

  it("snaps to home when close to initial dock position", () => {
    // Distance = sqrt(20^2 + 20^2) ≈ 28.3 < 45 * 1.5 = 67.5
    const snapped = calculateSnappedPosition(-20, 20, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(0);
    expect(snapped.snappedY).toBe(0);
  });

  it("snaps to right margin (maxX = 0) when close to right edge", () => {
    // Distance from home = sqrt(10^2 + 200^2) > 67.5, but x = -10 is within snapDistance (45) of maxX (0)
    const snapped = calculateSnappedPosition(-10, 200, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(0);
    expect(snapped.snappedY).toBe(200);
  });

  it("snaps to left margin (minX) when close to left edge", () => {
    const snapped = calculateSnappedPosition(-1480, 200, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(-1500);
    expect(snapped.snappedY).toBe(200);
  });

  it("snaps to top navbar barrier (minY = 0) when close to top", () => {
    const snapped = calculateSnappedPosition(-400, 25, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(-400);
    expect(snapped.snappedY).toBe(0);
  });

  it("snaps to bottom edge (maxY) when close to bottom", () => {
    const snapped = calculateSnappedPosition(-400, 485, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(-400);
    expect(snapped.snappedY).toBe(500);
  });

  it("retains custom position when floating in open space", () => {
    const snapped = calculateSnappedPosition(-300, 250, homeX, homeY, boundaries, snapDistance);
    expect(snapped.snappedX).toBe(-300);
    expect(snapped.snappedY).toBe(250);
  });
});
