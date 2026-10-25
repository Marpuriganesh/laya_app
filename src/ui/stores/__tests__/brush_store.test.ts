import { describe, it, expect, beforeEach } from "vitest";
import { useBrushStore } from "../brush_store";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { createDefaultPresets } from "@/engine/drawing_app_engine";

describe("useBrushStore", () => {
  const dummyPreset = createDefaultPresets()[0];

  beforeEach(() => {
    useBrushStore.setState({
      activePresetId: dummyPreset.presetId,
      brushSize: 24,
      brushOpacity: 1.0,
      brushBlendMode: "normal",
      brushSettingsRevision: 0,
      isBrushStudioOpen: false,
      temporarilySaveTweaks: true,
      dirtyPresets: {},
      basePresets: {
        [dummyPreset.presetId]: JSON.parse(JSON.stringify(dummyPreset)),
      },
      isCurrentBrushDirty: false,
    });
    globalDrawingEngine.setActiveBrush(dummyPreset);
  });

  it("initializes with default baseline values", () => {
    const state = useBrushStore.getState();
    expect(state.activePresetId).toBe(dummyPreset.presetId);
    expect(state.brushSize).toBe(24);
    expect(state.brushOpacity).toBe(1.0);
    expect(state.isCurrentBrushDirty).toBe(false);
  });

  it("marks preset dirty when size is changed", () => {
    const { setBrushSize } = useBrushStore.getState();
    setBrushSize(50);

    const state = useBrushStore.getState();
    expect(state.brushSize).toBe(50);
    expect(state.isCurrentBrushDirty).toBe(true);
    expect(state.dirtyPresets[dummyPreset.presetId]?.baseSizePx).toBe(50);
  });

  it("marks preset dirty when opacity is changed", () => {
    const { setBrushOpacity } = useBrushStore.getState();
    setBrushOpacity(0.5);

    const state = useBrushStore.getState();
    expect(state.brushOpacity).toBe(0.5);
    expect(state.isCurrentBrushDirty).toBe(true);
    expect(state.dirtyPresets[dummyPreset.presetId]?.baseOpacity).toBe(0.5);
  });

  it("reverts active preset back to baseline parameters cleanly", () => {
    const { setBrushSize, setBrushOpacity, revertActivePreset } = useBrushStore.getState();
    setBrushSize(75);
    setBrushOpacity(0.3);

    expect(useBrushStore.getState().isCurrentBrushDirty).toBe(true);

    revertActivePreset();

    const state = useBrushStore.getState();
    expect(state.brushSize).toBe(24);
    expect(state.brushOpacity).toBe(1.0);
    expect(state.isCurrentBrushDirty).toBe(false);
    expect(state.dirtyPresets[dummyPreset.presetId]).toBeUndefined();
  });

  it("overwrites active preset and clears dirty state", () => {
    const { setBrushSize, overwriteActivePreset } = useBrushStore.getState();
    setBrushSize(40);
    expect(useBrushStore.getState().isCurrentBrushDirty).toBe(true);

    overwriteActivePreset();

    const state = useBrushStore.getState();
    expect(state.isCurrentBrushDirty).toBe(false);
    expect(state.dirtyPresets[dummyPreset.presetId]).toBeUndefined();
    const baseParams = state.basePresets[dummyPreset.presetId]?.engineParameters;
    expect(baseParams?.engineId === "pixelbrush" ? baseParams.baseSizePx : null).toBe(40);
  });

  it("saves active preset as a new custom preset", () => {
    const { setBrushSize, saveActivePresetAsNew } = useBrushStore.getState();
    setBrushSize(60);

    const newPreset = saveActivePresetAsNew("Custom Chisel Pen");
    expect(newPreset).not.toBeNull();
    expect(newPreset?.displayName).toBe("Custom Chisel Pen");
    expect(newPreset?.tags).toContain("Custom");

    const state = useBrushStore.getState();
    expect(state.activePresetId).toBe(newPreset?.presetId);
    expect(state.isCurrentBrushDirty).toBe(false);
  });

  it("toggles temporarilySaveTweaks", () => {
    const { setTemporarilySaveTweaks } = useBrushStore.getState();
    setTemporarilySaveTweaks(false);
    expect(useBrushStore.getState().temporarilySaveTweaks).toBe(false);
    setTemporarilySaveTweaks(true);
    expect(useBrushStore.getState().temporarilySaveTweaks).toBe(true);
  });

  it("updates movingAverageConfig and pullStringConfig independently", () => {
    const { setMovingAverageConfig, setPullStringConfig } = useBrushStore.getState();

    setMovingAverageConfig({ enabled: true, windowSize: 10 });
    expect(useBrushStore.getState().movingAverageConfig.enabled).toBe(true);
    expect(useBrushStore.getState().movingAverageConfig.windowSize).toBe(10);

    setPullStringConfig({ enabled: true, maxStringLength: 50 });
    expect(useBrushStore.getState().pullStringConfig.enabled).toBe(true);
    expect(useBrushStore.getState().pullStringConfig.maxStringLength).toBe(50);
  });
});
