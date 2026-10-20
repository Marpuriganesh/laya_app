import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../useDocumentStore";
import { createDefaultDocumentConfiguration } from "@/types/document";
import { createDefaultLayerStack } from "@/types/layer";

describe("useDocumentStore (Zustand)", () => {
  beforeEach(() => {
    // Reset store before each test
    useDocumentStore.setState({
      document: createDefaultDocumentConfiguration(),
      activeTool: "brush",
      activeColor: "#1e1e1e",
      brushSize: 32,
      brushOpacity: 1.0,
      transform: { scale: 0.8, panX: 0, panY: 0 },
      activePopover: "none",
      softProofMode: "none",
      layerStack: createDefaultLayerStack(),
    });
  });

  it("initializes with default state values", () => {
    const state = useDocumentStore.getState();
    expect(state.activeTool).toBe("brush");
    expect(state.activeColor).toBe("#1e1e1e");
    expect(state.brushSize).toBe(32);
    expect(state.brushOpacity).toBe(1.0);
    expect(state.softProofMode).toBe("none");
    expect(state.activePopover).toBe("none");
  });

  it("updates tool, size, and opacity", () => {
    const { setActiveTool, setBrushSize, setBrushOpacity } = useDocumentStore.getState();

    setActiveTool("eraser");
    expect(useDocumentStore.getState().activeTool).toBe("eraser");

    setBrushSize(64);
    expect(useDocumentStore.getState().brushSize).toBe(64);

    setBrushOpacity(0.5);
    expect(useDocumentStore.getState().brushOpacity).toBe(0.5);
  });

  it("toggles popover state cleanly", () => {
    const { togglePopover } = useDocumentStore.getState();

    togglePopover("color");
    expect(useDocumentStore.getState().activePopover).toBe("color");

    // Toggle same popover closes it
    togglePopover("color");
    expect(useDocumentStore.getState().activePopover).toBe("none");

    // Toggle different popover switches to it
    togglePopover("brushLibrary");
    expect(useDocumentStore.getState().activePopover).toBe("brushLibrary");
  });

  it("updates and resets transform", () => {
    const { setTransform, resetTransform } = useDocumentStore.getState();

    setTransform({ scale: 2.5, panX: 100, panY: 200 });
    expect(useDocumentStore.getState().transform).toEqual({
      scale: 2.5,
      panX: 100,
      panY: 200,
    });

    resetTransform();
    expect(useDocumentStore.getState().transform).toEqual({
      scale: 0.8,
      panX: 0,
      panY: 0,
    });
  });

  it("updates soft proof mode", () => {
    const { setSoftProofMode } = useDocumentStore.getState();

    setSoftProofMode("grayscale-values");
    expect(useDocumentStore.getState().softProofMode).toBe("grayscale-values");

    setSoftProofMode("cmyk-print");
    expect(useDocumentStore.getState().softProofMode).toBe("cmyk-print");
  });

  it("manages layers correctly: add, duplicate, visibility, opacity, blendMode, delete", () => {
    const {
      addLayer,
      duplicateLayer,
      toggleLayerVisibility,
      setLayerOpacity,
      setLayerBlendMode,
      deleteLayer,
    } = useDocumentStore.getState();

    // Initial stack has Layer 1 and Background
    expect(useDocumentStore.getState().layerStack.layers.length).toBe(2);

    // Add Layer
    addLayer();
    let currentLayers = useDocumentStore.getState().layerStack.layers;
    expect(currentLayers.length).toBe(3);
    const newLayerId = useDocumentStore.getState().layerStack.activeLayerId;
    expect(currentLayers[0].id).toBe(newLayerId);

    // Duplicate Layer
    duplicateLayer(newLayerId);
    currentLayers = useDocumentStore.getState().layerStack.layers;
    expect(currentLayers.length).toBe(4);

    // Toggle Visibility
    toggleLayerVisibility(newLayerId);
    let target = useDocumentStore.getState().layerStack.layers.find((l) => l.id === newLayerId);
    expect(target?.visible).toBe(false);

    // Set Opacity
    setLayerOpacity(newLayerId, 0.75);
    target = useDocumentStore.getState().layerStack.layers.find((l) => l.id === newLayerId);
    expect(target?.opacity).toBe(0.75);

    // Set Blend Mode
    setLayerBlendMode(newLayerId, "multiply");
    target = useDocumentStore.getState().layerStack.layers.find((l) => l.id === newLayerId);
    expect(target?.blendMode).toBe("multiply");

    // Delete Layer
    deleteLayer(newLayerId);
    currentLayers = useDocumentStore.getState().layerStack.layers;
    expect(currentLayers.length).toBe(3);
    expect(currentLayers.some((l) => l.id === newLayerId)).toBe(false);
  });

  it("manages detachable panel state transitions", () => {
    const { detachPanel, dockPanel, setPanelDetached, setActivePopover } = useDocumentStore.getState();

    setActivePopover("color");
    expect(useDocumentStore.getState().activePopover).toBe("color");

    // Detach color panel
    detachPanel("color");
    expect(useDocumentStore.getState().detachedPanels.color).toBe(true);
    expect(useDocumentStore.getState().activePopover).toBe("none");

    // Dock color panel
    dockPanel("color");
    expect(useDocumentStore.getState().detachedPanels.color).toBe(false);
    expect(useDocumentStore.getState().activePopover).toBe("color");

    // Explicit set
    setPanelDetached("layers", true);
    expect(useDocumentStore.getState().detachedPanels.layers).toBe(true);
  });
});
