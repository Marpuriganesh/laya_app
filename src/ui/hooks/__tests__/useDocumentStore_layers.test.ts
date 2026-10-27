import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { createDefaultLayerStack } from "@/types/layer";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";

describe("useDocumentStore - Layer Alpha Lock, Clipping & Masks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      layerStack: createDefaultLayerStack(),
    });
  });

  it("toggles layer alpha lock and synchronizes with bridges", () => {
    const rustSpy = vi.spyOn(globalRustBrushBridge, "setLayerAlphaLock").mockResolvedValue();
    const wasmSpy = vi.spyOn(globalWasmBrushBridge, "setLayerAlphaLock").mockReturnValue(true);

    const { layerStack, toggleLayerAlphaLock } = useDocumentStore.getState();
    const activeLayer = layerStack.layers[0];
    expect(activeLayer.alphaLocked).toBe(false);

    toggleLayerAlphaLock(activeLayer.id);

    const updatedActive = useDocumentStore
      .getState()
      .layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(updatedActive?.alphaLocked).toBe(true);
    expect(rustSpy).toHaveBeenCalledWith(activeLayer.id, true);
    expect(wasmSpy).toHaveBeenCalledWith(activeLayer.id, true);

    // Toggle off
    toggleLayerAlphaLock(activeLayer.id);
    const updatedAgain = useDocumentStore
      .getState()
      .layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(updatedAgain?.alphaLocked).toBe(false);
    expect(rustSpy).toHaveBeenCalledWith(activeLayer.id, false);
    expect(wasmSpy).toHaveBeenCalledWith(activeLayer.id, false);
  });

  it("toggles layer clipping and synchronizes with bridges", () => {
    const rustSpy = vi.spyOn(globalRustBrushBridge, "setLayerClipped").mockResolvedValue();
    const wasmSpy = vi.spyOn(globalWasmBrushBridge, "setLayerClipped").mockReturnValue(true);

    const { layerStack, toggleLayerClipping } = useDocumentStore.getState();
    const activeLayer = layerStack.layers[0];
    expect(activeLayer.isClipped).toBe(false);

    toggleLayerClipping(activeLayer.id);

    const updatedActive = useDocumentStore
      .getState()
      .layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(updatedActive?.isClipped).toBe(true);
    expect(rustSpy).toHaveBeenCalledWith(activeLayer.id, true);
    expect(wasmSpy).toHaveBeenCalledWith(activeLayer.id, true);
  });

  it("adds, disables, targets, and deletes layer masks", () => {
    const addRustSpy = vi.spyOn(globalRustBrushBridge, "addLayerMask").mockResolvedValue();
    const addWasmSpy = vi.spyOn(globalWasmBrushBridge, "addLayerMask").mockReturnValue(true);
    const delRustSpy = vi.spyOn(globalRustBrushBridge, "deleteLayerMask").mockResolvedValue();
    const delWasmSpy = vi.spyOn(globalWasmBrushBridge, "deleteLayerMask").mockReturnValue(true);
    const targetRustSpy = vi.spyOn(globalRustBrushBridge, "setLayerEditTarget").mockResolvedValue();
    const targetWasmSpy = vi.spyOn(globalWasmBrushBridge, "setLayerEditTarget").mockReturnValue(true);

    const { layerStack, addLayerMask, deleteLayerMask, toggleLayerMaskEnabled, setLayerEditTarget } =
      useDocumentStore.getState();
    const activeLayer = layerStack.layers[0];
    expect(activeLayer.mask).toBeUndefined();

    // 1. Add mask
    addLayerMask(activeLayer.id);
    let current = useDocumentStore.getState().layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(current?.mask).toBeDefined();
    expect(current?.mask?.enabled).toBe(true);
    expect(current?.activeTarget).toBe("mask");
    expect(addRustSpy).toHaveBeenCalledWith(activeLayer.id);
    expect(addWasmSpy).toHaveBeenCalledWith(activeLayer.id);

    // 2. Toggle mask enabled
    toggleLayerMaskEnabled(activeLayer.id);
    current = useDocumentStore.getState().layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(current?.mask?.enabled).toBe(false);

    // 3. Switch edit target back to pixels
    setLayerEditTarget(activeLayer.id, "pixels");
    current = useDocumentStore.getState().layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(current?.activeTarget).toBe("pixels");
    expect(targetRustSpy).toHaveBeenCalledWith(activeLayer.id, "pixels");
    expect(targetWasmSpy).toHaveBeenCalledWith(activeLayer.id, "pixels");

    // 4. Delete mask
    deleteLayerMask(activeLayer.id);
    current = useDocumentStore.getState().layerStack.layers.find((l) => l.id === activeLayer.id);
    expect(current?.mask).toBeUndefined();
    expect(current?.activeTarget).toBe("pixels");
    expect(delRustSpy).toHaveBeenCalledWith(activeLayer.id);
    expect(delWasmSpy).toHaveBeenCalledWith(activeLayer.id);
  });

  it("creates a vector layer and synchronizes with bridges", () => {
    const addRustSpy = vi.spyOn(globalRustBrushBridge, "addVectorLayer").mockResolvedValue();
    const addWasmSpy = vi.spyOn(globalWasmBrushBridge, "addVectorLayer").mockReturnValue();

    const { addVectorLayer } = useDocumentStore.getState();
    addVectorLayer();

    const state = useDocumentStore.getState();
    const activeLayerId = state.layerStack.activeLayerId;
    const activeLayer = state.layerStack.layers.find((l) => l.id === activeLayerId);

    expect(activeLayer).toBeDefined();
    expect(activeLayer?.kind).toBe("vector");
    expect(activeLayer?.name).toMatch(/^Vector \d+$/);
    expect(addRustSpy).toHaveBeenCalledWith(activeLayerId, activeLayer?.name);
    expect(addWasmSpy).toHaveBeenCalledWith(activeLayerId, activeLayer?.name);
  });

  it("adjusts vector line width and synchronizes with bridges", () => {
    const rustSpy = vi.spyOn(globalRustBrushBridge, "adjustVectorLineWidth").mockResolvedValue(null);
    const wasmSpy = vi.spyOn(globalWasmBrushBridge, "adjustVectorLineWidth").mockReturnValue(null);

    const { adjustVectorLineWidth } = useDocumentStore.getState();
    adjustVectorLineWidth("layer-1", 1.25);

    expect(rustSpy).toHaveBeenCalledWith("layer-1", 1.25);
    expect(wasmSpy).toHaveBeenCalledWith("layer-1", 1.25);
  });
});
