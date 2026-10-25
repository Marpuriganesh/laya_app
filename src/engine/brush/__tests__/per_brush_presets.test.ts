/**
 * Per-Brush Presets and State Synchronization Unit Tests
 * Validates that each brush maintains its own independent parameters,
 * that setActiveBrush updates the engine configuration, and that modifications
 * persist across preset switches.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DrawingAppEngine,
  createDefaultTechnicalPencilPreset,
  createDefaultCalligraphyPenPreset,
} from "../../drawing_app_engine";

describe("DrawingAppEngine - Per-Brush Presets", () => {
  let engine: DrawingAppEngine;

  beforeEach(() => {
    engine = new DrawingAppEngine(800, 600);
  });

  it("initializes with default presets and sets Studio Pen as active", () => {
    const presets = engine.getLoadedPresets();
    expect(presets.length).toBeGreaterThanOrEqual(1);

    const active = engine.getActiveBrush();
    expect(active).not.toBeNull();
    expect(active?.displayName).toBe("Studio Pen");
  });

  it("applies preset parameters to active engine state on setActiveBrush", () => {
    const technicalPencil = createDefaultTechnicalPencilPreset();
    engine.setActiveBrush(technicalPencil);
    expect(engine.getActiveBrush()?.presetId).toBe(technicalPencil.presetId);

    // Verify that engine softness and size match the Technical Pencil preset
    const params = technicalPencil.engineParameters;
    if (params.engineId === "pixelbrush") {
      expect(engine.getBrushSoftness()).toBeCloseTo(params.softness);
      expect(engine.getBrushSize()).toBe(params.baseSizePx);
      expect(engine.getBrushSpacing()).toBeCloseTo(params.spacingFraction);
    }
  });

  it("updates and persists modified parameters via updateActivePreset", () => {
    const activeBefore = engine.getActiveBrush();
    expect(activeBefore).not.toBeNull();

    // Modify active preset softness and spacing
    engine.updateActivePreset({
      softness: 0.85,
      spacingFraction: 0.25,
      baseSizePx: 48,
    });

    const activeAfter = engine.getActiveBrush();
    expect(activeAfter?.engineParameters.engineId).toBe("pixelbrush");
    if (activeAfter?.engineParameters.engineId === "pixelbrush") {
      expect(activeAfter.engineParameters.softness).toBe(0.85);
      expect(activeAfter.engineParameters.spacingFraction).toBe(0.25);
      expect(activeAfter.engineParameters.baseSizePx).toBe(48);
    }

    // Verify engine state reflects updates
    expect(engine.getBrushSoftness()).toBeCloseTo(0.85);
    expect(engine.getBrushSpacing()).toBeCloseTo(0.25);
    expect(engine.getBrushSize()).toBe(48);
  });

  it("preserves independent customizations when switching between brushes", () => {
    const studioPen = engine.getLoadedPresets()[0];
    const pencil = createDefaultTechnicalPencilPreset();

    // Select Studio Pen and customize
    engine.setActiveBrush(studioPen);
    engine.setBrushSoftness(0.12);
    engine.setBrushSize(55);

    // Switch to Pencil and customize differently
    engine.setActiveBrush(pencil);
    engine.setBrushSoftness(0.78);
    engine.setBrushSize(8);

    // Switch back to Studio Pen and verify its custom values were preserved
    engine.setActiveBrush(studioPen);
    expect(engine.getBrushSoftness()).toBeCloseTo(0.12);
    expect(engine.getBrushSize()).toBe(55);

    // Switch back to Pencil and verify its custom values were preserved
    engine.setActiveBrush(pencil);
    expect(engine.getBrushSoftness()).toBeCloseTo(0.78);
    expect(engine.getBrushSize()).toBe(8);
  });

  it("maintains independent stroke smoothing configurations per brush", () => {
    const studioPen = engine.getLoadedPresets()[0];
    const calligraphy = createDefaultCalligraphyPenPreset();

    expect(studioPen).toBeDefined();
    expect(calligraphy).toBeDefined();

    // 1. Activate Studio Pen -> Moving average enabled, Pull String disabled
    engine.setActiveBrush(studioPen);
    expect(engine.getMovingAverageConfig().enabled).toBe(true);
    expect(engine.getPullStringConfig().enabled).toBe(false);

    // Customize Studio Pen moving average
    engine.setMovingAverageConfig({ enabled: true, windowSize: 18, velocityMultiplier: 2.5 });
    expect(engine.getMovingAverageConfig().windowSize).toBe(18);

    // 2. Activate Calligraphy Pen -> Pull String enabled, Moving average disabled
    engine.setActiveBrush(calligraphy);
    expect(engine.getPullStringConfig().enabled).toBe(true);
    expect(engine.getMovingAverageConfig().enabled).toBe(false);

    // Customize Calligraphy Pen pull string
    engine.setPullStringConfig({
      ...engine.getPullStringConfig(),
      enabled: true,
      maxStringLength: 75,
      velocityMultiplier: 3.0,
    });
    expect(engine.getPullStringConfig().maxStringLength).toBe(75);

    // 3. Switch back to Studio Pen -> Should restore windowSize 18 and pullString disabled
    engine.setActiveBrush(studioPen);
    expect(engine.getMovingAverageConfig().enabled).toBe(true);
    expect(engine.getMovingAverageConfig().windowSize).toBe(18);
    expect(engine.getPullStringConfig().enabled).toBe(false);

    // 4. Switch back to Calligraphy Pen -> Should restore maxStringLength 75 and moving average disabled
    engine.setActiveBrush(calligraphy);
    expect(engine.getPullStringConfig().enabled).toBe(true);
    expect(engine.getPullStringConfig().maxStringLength).toBe(75);
    expect(engine.getMovingAverageConfig().enabled).toBe(false);
  });
});
