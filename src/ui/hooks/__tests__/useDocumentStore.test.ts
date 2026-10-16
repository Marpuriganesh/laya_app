import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../useDocumentStore";
import { createDefaultDocumentConfiguration } from "@/types/document";

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
});
