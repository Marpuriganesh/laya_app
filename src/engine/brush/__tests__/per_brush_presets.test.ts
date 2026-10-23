/**
 * Per-Brush Presets and State Synchronization Unit Tests
 * Validates that each brush maintains its own independent parameters,
 * that setActiveBrush updates the engine configuration, and that modifications
 * persist across preset switches.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DrawingAppEngine } from "../../drawing_app_engine";

describe("DrawingAppEngine - Per-Brush Presets", () => {
  let engine: DrawingAppEngine;

  beforeEach(() => {
    engine = new DrawingAppEngine(800, 600);
  });

  it("initializes with default presets and sets the first preset as active", () => {
    const presets = engine.getLoadedPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);

    const active = engine.getActiveBrush();
    expect(active).not.toBeNull();
    expect(active?.displayName).toBe("Studio Pen");
  });

  it("applies preset parameters to active engine state on setActiveBrush", () => {
    const presets = engine.getLoadedPresets();
    const technicalPencil = presets.find((p) => p.displayName === "Technical Pencil");
    expect(technicalPencil).toBeDefined();

    if (technicalPencil) {
      engine.setActiveBrush(technicalPencil);
      expect(engine.getActiveBrush()?.presetId).toBe(technicalPencil.presetId);

      // Verify that engine softness and size match the Technical Pencil preset
      const params = technicalPencil.engineParameters;
      if (params.engineId === "pixelbrush") {
        expect(engine.getBrushSoftness()).toBeCloseTo(params.softness);
        expect(engine.getBrushSize()).toBe(params.baseSizePx);
        expect(engine.getBrushSpacing()).toBeCloseTo(params.spacingFraction);
      }
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
    const presets = engine.getLoadedPresets();
    const studioPen = presets[0];
    const pencil = presets[1];

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
});
