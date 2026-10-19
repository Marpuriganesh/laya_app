import { describe, it, expect } from "vitest";
import { DrawingAppEngine } from "../drawing_app_engine";
import type { StrokePoint } from "@/types/stroke";

describe("Stroke Curvature & Anti-Faceting", () => {
  it("guarantees smooth continuous Bézier curvature with max angle delta < 5 degrees", () => {
    const engine = new DrawingAppEngine(2480, 3508);
    engine.setBrushSize(24);

    // Track dabs blitted to raster target
    const blittedDabs: { x: number; y: number; diameter: number }[] = [];
    const target = engine.getRasterTarget();
    const origBlit = target.blitDab.bind(target);
    target.blitDab = (pixels, cx, cy, diam, mode) => {
      blittedDabs.push({ x: cx, y: cy, diameter: diam });
      return origBlit(pixels, cx, cy, diam, mode);
    };

    // Draw a scribble with sharp direction changes (similar to user scribble loops)
    const scribblePoints: StrokePoint[] = [
      { canvasX: 200, canvasY: 200, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 0 },
      { canvasX: 300, canvasY: 150, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 16 },
      { canvasX: 450, canvasY: 220, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 32 },
      { canvasX: 400, canvasY: 350, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 48 },
      { canvasX: 250, canvasY: 400, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 64 },
      { canvasX: 180, canvasY: 300, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 80 },
      { canvasX: 220, canvasY: 180, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 96 },
      { canvasX: 350, canvasY: 120, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 500, timeMs: 112 },
    ];

    engine.beginStroke(scribblePoints[0]);
    for (let i = 1; i < scribblePoints.length; i++) {
      engine.extendStroke(scribblePoints[i]);
    }
    engine.endStroke();

    expect(blittedDabs.length).toBeGreaterThan(100);

    // Verify that consecutive dabs form smooth curves without sharp kinks
    let maxAngleChange = 0;
    for (let i = 2; i < blittedDabs.length; i++) {
      const v1 = { x: blittedDabs[i - 1].x - blittedDabs[i - 2].x, y: blittedDabs[i - 1].y - blittedDabs[i - 2].y };
      const v2 = { x: blittedDabs[i].x - blittedDabs[i - 1].x, y: blittedDabs[i].y - blittedDabs[i - 1].y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag1 = Math.hypot(v1.x, v1.y);
      const mag2 = Math.hypot(v2.x, v2.y);
      if (mag1 > 0.1 && mag2 > 0.1) {
        const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        const angleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
        maxAngleChange = Math.max(maxAngleChange, angleDeg);
      }
    }

    // Maximum direction delta between consecutive dabs must be < 5.0 degrees (no polygon faceting)
    expect(maxAngleChange).toBeLessThan(5.0);
  });

  it("filters out zero-distance duplicate points without corrupting spline curve", () => {
    const engine = new DrawingAppEngine(500, 500);
    const p1: StrokePoint = { canvasX: 100, canvasY: 100, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 0, timeMs: 0 };
    const p2: StrokePoint = { canvasX: 150, canvasY: 120, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 100, timeMs: 16 };

    engine.beginStroke(p1);
    engine.extendStroke(p2);
    // Duplicate call with exact same coordinates (simulates event bubbling)
    engine.extendStroke(p2);
    engine.extendStroke({ ...p2, canvasX: p2.canvasX + 0.1, canvasY: p2.canvasY + 0.1 });
    engine.endStroke();

    const target = engine.getRasterTarget();
    const pixelData = target.getPixelData();
    const drawn = pixelData.some((_, i) => i % 4 === 3 && pixelData[i] > 0);
    expect(drawn).toBe(true);
  });
});

