import { create } from "zustand";
import {
  type DocumentConfiguration,
  createDefaultDocumentConfiguration,
} from "@/types/document";
import type { ActiveTool, PopoverType, CanvasTransform, SoftProofMode } from "@/types/ui";
import {
  type LayerStack,
  type LayerItem,
  type LayerBlendMode,
  createDefaultLayerStack,
} from "@/types/layer";
import type { DetachablePanelId } from "@/types/window";

export interface DocumentState {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  activePopover: PopoverType;
  softProofMode: SoftProofMode;
  layerStack: LayerStack;
  detachedPanels: Record<DetachablePanelId, boolean>;

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
  setLayerStack: (layerStack: LayerStack) => void;

  // Detached Window State Management
  detachPanel: (panelId: DetachablePanelId) => void;
  dockPanel: (panelId: DetachablePanelId) => void;
  setPanelDetached: (panelId: DetachablePanelId, detached: boolean) => void;

  // Layer Management Actions
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  setActiveLayerId: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, blendMode: LayerBlendMode) => void;
  renameLayer: (id: string, name: string) => void;
}

let layerSequence = 1;

export function generateUniqueLayerId(): string {
  return `layer-${Date.now()}-${layerSequence++}`;
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
  layerStack: createDefaultLayerStack(),
  detachedPanels: {
    color: false,
    layers: false,
    brushLibrary: false,
    brushSettings: false,
  },

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
  setLayerStack: (layerStack) => set({ layerStack }),

  detachPanel: (panelId: DetachablePanelId) =>
    set((state) => ({
      detachedPanels: {
        ...state.detachedPanels,
        [panelId]: true,
      },
      activePopover: state.activePopover === panelId ? "none" : state.activePopover,
    })),

  dockPanel: (panelId: DetachablePanelId) =>
    set((state) => ({
      detachedPanels: {
        ...state.detachedPanels,
        [panelId]: false,
      },
      activePopover: panelId,
    })),

  setPanelDetached: (panelId: DetachablePanelId, detached: boolean) =>
    set((state) => ({
      detachedPanels: {
        ...state.detachedPanels,
        [panelId]: detached,
      },
    })),

  addLayer: () =>
    set((state) => {
      const existingLayers = state.layerStack.layers;
      const layerCount = existingLayers.filter((l) => !l.isBackground).length + 1;
      const newLayerId = generateUniqueLayerId();
      const newLayer: LayerItem = {
        id: newLayerId,
        name: `Layer ${layerCount}`,
        visible: true,
        opacity: 1.0,
        blendMode: "normal",
        locked: false,
      };

      // Insert above current active layer or at the very top (index 0)
      const activeIndex = existingLayers.findIndex((l) => l.id === state.layerStack.activeLayerId);
      const insertIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextLayers = [
        ...existingLayers.slice(0, insertIndex),
        newLayer,
        ...existingLayers.slice(insertIndex),
      ];

      return {
        layerStack: {
          layers: nextLayers,
          activeLayerId: newLayerId,
        },
      };
    }),

  deleteLayer: (id: string) =>
    set((state) => {
      const existingLayers = state.layerStack.layers;
      const target = existingLayers.find((l) => l.id === id);
      // Prevent deleting background layer or the last remaining layer
      if (!target || target.isBackground || existingLayers.filter((l) => !l.isBackground).length <= 1) {
        return state;
      }

      const nextLayers = existingLayers.filter((l) => l.id !== id);
      const nextActiveId =
        state.layerStack.activeLayerId === id
          ? (nextLayers.find((l) => !l.isBackground)?.id ?? nextLayers[0].id)
          : state.layerStack.activeLayerId;

      return {
        layerStack: {
          layers: nextLayers,
          activeLayerId: nextActiveId,
        },
      };
    }),

  duplicateLayer: (id: string) =>
    set((state) => {
      const existingLayers = state.layerStack.layers;
      const targetIndex = existingLayers.findIndex((l) => l.id === id);
      if (targetIndex < 0) return state;

      const target = existingLayers[targetIndex];
      const newLayerId = generateUniqueLayerId();
      const clonedLayer: LayerItem = {
        ...target,
        id: newLayerId,
        name: `${target.name} Copy`,
        isBackground: false,
      };

      const nextLayers = [
        ...existingLayers.slice(0, targetIndex),
        clonedLayer,
        ...existingLayers.slice(targetIndex),
      ];

      return {
        layerStack: {
          layers: nextLayers,
          activeLayerId: newLayerId,
        },
      };
    }),

  setActiveLayerId: (activeLayerId: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        activeLayerId,
      },
    })),

  toggleLayerVisibility: (id: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, visible: !l.visible } : l
        ),
      },
    })),

  toggleLayerLock: (id: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, locked: !l.locked } : l
        ),
      },
    })),

  setLayerOpacity: (id: string, opacity: number) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
        ),
      },
    })),

  setLayerBlendMode: (id: string, blendMode: LayerBlendMode) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, blendMode } : l
        ),
      },
    })),

  renameLayer: (id: string, name: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, name: name.trim() || l.name } : l
        ),
      },
    })),
}));
