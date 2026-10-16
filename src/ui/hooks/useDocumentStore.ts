import { create } from "zustand";
import {
  type DocumentConfiguration,
  createDefaultDocumentConfiguration,
} from "@/types/document";
import type { ActiveTool, PopoverType, CanvasTransform, SoftProofMode } from "@/types/ui";

export interface DocumentState {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  activePopover: PopoverType;
  softProofMode: SoftProofMode;

  setDocument: (document: DocumentConfiguration) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setActiveColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setTransform: (transform: CanvasTransform) => void;
  setActivePopover: (popover: PopoverType) => void;
  togglePopover: (popover: PopoverType) => void;
  setSoftProofMode: (mode: SoftProofMode) => void;
  resetTransform: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  document: createDefaultDocumentConfiguration(),
  activeTool: "brush",
  activeColor: "#1e1e1e",
  brushSize: 32,
  brushOpacity: 1.0,
  transform: {
    scale: 0.8,
    panX: 0,
    panY: 0,
  },
  activePopover: "none",
  softProofMode: "none",

  setDocument: (document) => set({ document }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity }),
  setTransform: (transform) => set({ transform }),
  setActivePopover: (activePopover) => set({ activePopover }),
  togglePopover: (popover) =>
    set((state) => ({
      activePopover: state.activePopover === popover ? "none" : popover,
    })),
  setSoftProofMode: (softProofMode) => set({ softProofMode }),
  resetTransform: () =>
    set({
      transform: { scale: 0.8, panX: 0, panY: 0 },
    }),
}));
