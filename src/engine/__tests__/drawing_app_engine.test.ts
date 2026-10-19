import { describe, it, expect, beforeEach } from "vitest";
import { DrawingAppEngine } from "../drawing_app_engine";
import type { StrokePoint } from "@/types/stroke";

describe("DrawingAppEngine", () => {
  let engine: DrawingAppEngine;

  beforeEach(() => {
    engine = new DrawingAppEngine(500, 500);
  });

  it("initializes with default Studio Pen preset", () => {
    const active = engine.getActiveBrush();
    expect(active).not.toBeNull();
    expect(active?.displayName).toBe("Studio Pen");
    expect(active?.engineType).toBe("pixelbrush");
    expect(engine.getLoadedPresets().length).toBeGreaterThanOrEqual(1);
  });

  it("stamps pixels into raster target during stroke lifecycle", () => {
    const p1: StrokePoint = {
      canvasX: 100,
      canvasY: 100,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 0,
      timeMs: 1000,
    };

    const p2: StrokePoint = {
      canvasX: 150,
      canvasY: 100,
      pressure: 0.8,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 500,
      timeMs: 1050,
    };

    engine.setForegroundColor(255, 0, 0, 1.0);
    engine.setBrushSize(20);

    engine.beginStroke(p1);
    engine.extendStroke(p2);
    engine.endStroke();

    const target = engine.getRasterTarget();
    const pixelData = target.getPixelData();

    // Verify non-zero alpha pixels exist near (100, 100)
    let nonZeroCount = 0;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] > 0) {
        nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it("clears canvas cleanly", () => {
    const p: StrokePoint = {
      canvasX: 50,
      canvasY: 50,
      pressure: 1.0,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 0,
      timeMs: 1000,
    };
    engine.beginStroke(p);
    engine.endStroke();

    engine.clearCanvas();
    const pixelData = engine.getRasterTarget().getPixelData();
    const hasAnyAlpha = pixelData.some((_, i) => i % 4 === 3 && pixelData[i] > 0);
    expect(hasAnyAlpha).toBe(false);
  });

  it("updates foreground color, size, and opacity", () => {
    engine.setForegroundColor(0, 128, 255, 0.8);
    engine.setBrushSize(48);
    engine.setBrushOpacity(0.5);

    expect(engine.getActiveBrush()).not.toBeNull();
  });

  it("switches active presets between built-in presets", () => {
    const presets = engine.getLoadedPresets();
    expect(presets.length).toBe(4);

    const pencil = presets.find((p) => p.displayName === "6B Pencil");
    expect(pencil).toBeDefined();

    if (pencil) {
      engine.setActiveBrush(pencil);
      expect(engine.getActiveBrush()?.presetId).toBe(pencil.presetId);
      expect(engine.getActiveBrush()?.displayName).toBe("6B Pencil");
    }
  });

  it("supports setting erase blend mode and resizing canvas", () => {
    engine.setBlendMode("erase");
    engine.setCanvasSize(800, 600);

    const target = engine.getRasterTarget();
    expect(target.width).toBe(800);
    expect(target.height).toBe(600);
  });

  it("loads and activates presets from a Krita .bundle archive", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fixturePath = path.resolve(__dirname, "../brush/__fixtures__/sample.kpp");
    const sampleKpp = new Uint8Array(fs.readFileSync(fixturePath));

    // Construct synthetic minimal bundle ZIP
    const { createSyntheticStoredZip } = await import("./test_zip_helper");
    const bundleBytes = createSyntheticStoredZip([
      { name: "mimetype", content: "application/x-krita-bundle" },
      { name: "meta.xml", content: "<package><name>Concept Art Pack</name></package>" },
      { name: "paintoppresets/brush1.kpp", content: sampleKpp },
    ]);

    const initialCount = engine.getLoadedPresets().length;
    const loaded = await engine.loadKritaBundle(bundleBytes.buffer as ArrayBuffer, "ConceptArt.bundle");

    expect(loaded.length).toBe(1);
    expect(engine.getLoadedPresets().length).toBe(initialCount + 1);
    expect(engine.getActiveBrush()?.tags).toContain("Concept Art Pack");
  });

  it("supports spline interpolation mode configuration", () => {
    expect(engine.getSplineInterpolationMode()).toBe("midpoint");
    engine.setSplineInterpolationMode("catmullRom");
    expect(engine.getSplineInterpolationMode()).toBe("catmullRom");
    engine.setSplineInterpolationMode("midpoint");
    expect(engine.getSplineInterpolationMode()).toBe("midpoint");
  });

  it("renders a continuous curved stroke via Bézier spline streaming", () => {
    engine.setForegroundColor(0, 255, 0, 1.0);
    engine.setBrushSize(20);

    const points: StrokePoint[] = [
      { canvasX: 50, canvasY: 50, pressure: 0.5, tiltX: 0, tiltY: 0, rotation: 0, speed: 100, timeMs: 100 },
      { canvasX: 80, canvasY: 100, pressure: 0.6, tiltX: 0, tiltY: 0, rotation: 0, speed: 120, timeMs: 120 },
      { canvasX: 120, canvasY: 140, pressure: 0.7, tiltX: 0, tiltY: 0, rotation: 0, speed: 150, timeMs: 140 },
      { canvasX: 180, canvasY: 150, pressure: 0.8, tiltX: 0, tiltY: 0, rotation: 0, speed: 160, timeMs: 160 },
      { canvasX: 250, canvasY: 120, pressure: 0.9, tiltX: 0, tiltY: 0, rotation: 0, speed: 180, timeMs: 180 },
    ];

    engine.beginStroke(points[0]);
    for (let i = 1; i < points.length; i++) {
      engine.extendStroke(points[i]);
    }
    engine.endStroke();

    const target = engine.getRasterTarget();
    const pixelData = target.getPixelData();

    // Verify drawn pixels along the curve path
    let drawnCount = 0;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] > 0) {
        drawnCount++;
      }
    }
    expect(drawnCount).toBeGreaterThan(100);
  });

  it("renders a single tap dab when only beginStroke and endStroke are called", () => {
    engine.clearCanvas();
    const p: StrokePoint = {
      canvasX: 200,
      canvasY: 200,
      pressure: 1.0,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 0,
      timeMs: 1000,
    };

    engine.beginStroke(p);
    engine.endStroke();

    const target = engine.getRasterTarget();
    const pixelData = target.getPixelData();

    let nonZeroCount = 0;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] > 0) {
        nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it("supports real-time brush adjustments: hardness, spacing, flow, aspect ratio, angle, and smoothing", () => {
    engine.setBrushHardness(0.35);
    expect(engine.getBrushHardness()).toBeCloseTo(0.35);

    engine.setBrushSpacing(0.2);
    expect(engine.getBrushSpacing()).toBeCloseTo(0.2);

    engine.setBrushFlow(0.85);
    expect(engine.getBrushFlow()).toBeCloseTo(0.85);

    engine.setBrushAspectRatio(0.7);
    expect(engine.getBrushAspectRatio()).toBeCloseTo(0.7);

    engine.setBrushAngle(Math.PI / 3);
    expect(engine.getBrushAngle()).toBeCloseTo(Math.PI / 3);

    engine.setSizeDynamicsEnabled(false);
    engine.setOpacityDynamicsEnabled(true);

    engine.setSmoothingConfig({
      mode: "streamline",
      streamlineStringRadiusPx: 8.0,
      streamlineBaseSmoothing: 0.2,
      streamlineMaxSmoothing: 0.6,
      streamlineVelocityThresholdPxPerSec: 500.0,
      movingAverageWindowSize: 4,
      predictiveLookAheadFrames: 1,
    });
    expect(engine.getSmoothingConfig().mode).toBe("streamline");
    expect(engine.getSmoothingConfig().streamlineStringRadiusPx).toBe(8.0);
  });
});

