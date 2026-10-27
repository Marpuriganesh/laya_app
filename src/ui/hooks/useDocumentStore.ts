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
import type { DetachablePanelId, GamutMaskConfiguration } from "@/types/window";
import {
  type DiscreteWheelConfig,
  DEFAULT_DISCRETE_WHEEL_CONFIG,
} from "@/engine/color/discrete_wheel";
import { type CurvePoint } from "@/engine/math/dynamics_curve";
import {
  type PullStringConfig,
  type MovingAverageConfig,
} from "@/types/brush";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { useBrushStore } from "@/ui/stores/brush_store";

export interface DocumentState {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  activePopover: PopoverType;
  isBrushStudioOpen: boolean;
  activePresetId: string;
  softProofMode: SoftProofMode;
  palmRejection: boolean;
  layerStack: LayerStack;
  detachedPanels: Record<DetachablePanelId, boolean>;
  gamutMask: GamutMaskConfiguration;
  wheelConfig: DiscreteWheelConfig;
  holdThresholdMs: number;
  globalPressureCurve: CurvePoint[];
  movingAverageConfig: MovingAverageConfig;
  pullStringConfig: PullStringConfig;
  brushSettingsRevision: number;
  bumpBrushSettingsRevision: () => void;

  setDocument: (document: DocumentConfiguration) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setActiveColor: (color: string) => void;
  brushBlendMode: string;
  setBrushBlendMode: (mode: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setTransform: (transform: CanvasTransform) => void;
  setActivePopover: (popover: PopoverType) => void;
  setBrushStudioOpen: (open: boolean) => void;
  setActivePresetId: (id: string) => void;
  togglePopover: (popover: PopoverType) => void;
  setSoftProofMode: (mode: SoftProofMode) => void;
  setPalmRejection: (enabled: boolean) => void;
  togglePalmRejection: () => void;
  setHoldThresholdMs: (ms: number) => void;
  setGlobalPressureCurve: (points: CurvePoint[]) => void;
  setMovingAverageConfig: (config: Partial<MovingAverageConfig>) => void;
  setPullStringConfig: (config: Partial<PullStringConfig>) => void;
  resetTransform: () => void;
  setLayerStack: (layerStack: LayerStack) => void;
  setGamutMask: (mask: Partial<GamutMaskConfiguration>) => void;
  setWheelConfig: (config: Partial<DiscreteWheelConfig>) => void;

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
  toggleLayerAlphaLock: (id: string) => void;
  toggleLayerClipping: (id: string) => void;
  addLayerMask: (id: string) => void;
  deleteLayerMask: (id: string) => void;
  toggleLayerMaskEnabled: (id: string) => void;
  setLayerEditTarget: (id: string, target: "pixels" | "mask") => void;
}

let layerSequence = 1;

export function generateUniqueLayerId(): string {
  return `layer-${Date.now()}-${layerSequence++}`;
}

let pendingLayerOpacityRaf: number | null = null;
const pendingLayerOpacities: Map<string, number> = new Map();

function flushLayerOpacities() {
  pendingLayerOpacityRaf = null;
  pendingLayerOpacities.forEach((opacity, id) => {
    globalRustBrushBridge.setLayerOpacity(id, opacity);
    globalWasmBrushBridge.setLayerOpacity(id, opacity);
  });
  pendingLayerOpacities.clear();
}

export const useDocumentStore = create<DocumentState>((set) => ({
  document: createDefaultDocumentConfiguration(),
  activeTool: "brush",
  activeColor: "#1e1e1e",
  brushBlendMode: useBrushStore.getState().brushBlendMode,
  brushSize: useBrushStore.getState().brushSize,
  brushOpacity: useBrushStore.getState().brushOpacity,
  transform: {
    scale: 0.8,
    panX: 0,
    panY: 0,
  },
  activePopover: "none",
  isBrushStudioOpen: useBrushStore.getState().isBrushStudioOpen,
  activePresetId: useBrushStore.getState().activePresetId,
  softProofMode: "none",
  palmRejection: true,
  layerStack: createDefaultLayerStack(),
  detachedPanels: {
    color: false,
    layers: false,
    brushLibrary: false,
    brushSettings: false,
    colorGamut: false,
    colorGrid: false,
  },
  gamutMask: {
    enabled: false,
    type: "triad",
    rotation: 0,
    opacity: 0.8,
  },
  wheelConfig: DEFAULT_DISCRETE_WHEEL_CONFIG,
  holdThresholdMs: (() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("sketch-hold-threshold");
        if (stored) {
          const parsed = Number(stored);
          if (!isNaN(parsed) && parsed >= 50 && parsed <= 2000) return parsed;
        }
      } catch {}
    }
    return 250;
  })(),
  globalPressureCurve: useBrushStore.getState().globalPressureCurve,
  movingAverageConfig: useBrushStore.getState().movingAverageConfig,
  pullStringConfig: useBrushStore.getState().pullStringConfig,
  brushSettingsRevision: useBrushStore.getState().brushSettingsRevision,
  bumpBrushSettingsRevision: () => {
    useBrushStore.getState().bumpBrushSettingsRevision();
    set((state) => ({ brushSettingsRevision: state.brushSettingsRevision + 1 }));
  },

  setDocument: (document) => set({ document }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setBrushBlendMode: (mode: string) => {
    useBrushStore.getState().setBrushBlendMode(mode);
    set({ brushBlendMode: mode });
  },
  setBrushSize: (brushSize) => {
    useBrushStore.getState().setBrushSize(brushSize);
    set((state) => ({ brushSize, brushSettingsRevision: state.brushSettingsRevision + 1 }));
  },
  setBrushOpacity: (brushOpacity) => {
    useBrushStore.getState().setBrushOpacity(brushOpacity);
    set((state) => ({ brushOpacity, brushSettingsRevision: state.brushSettingsRevision + 1 }));
  },
  setTransform: (transform) => set({ transform }),
  setActivePopover: (activePopover) => {
    if (activePopover === "brushSettings") {
      useBrushStore.getState().setBrushStudioOpen(true);
    }
    set({
      activePopover,
      ...(activePopover === "brushSettings" ? { isBrushStudioOpen: true } : {}),
    });
  },
  setBrushStudioOpen: (open) => {
    useBrushStore.getState().setBrushStudioOpen(open);
    set({ isBrushStudioOpen: open });
  },
  setActivePresetId: (activePresetId) => {
    useBrushStore.getState().setActivePresetId(activePresetId);
    set({ activePresetId });
  },
  togglePopover: (popover) =>
    set((state) => {
      const willOpenStudio = popover === "brushSettings" && state.activePopover !== "brushSettings";
      if (popover === "brushSettings") {
        useBrushStore.getState().setBrushStudioOpen(willOpenStudio);
      }
      return {
        activePopover: state.activePopover === popover ? "none" : popover,
        ...(popover === "brushSettings" ? { isBrushStudioOpen: willOpenStudio } : {}),
      };
    }),
  setSoftProofMode: (softProofMode) => set({ softProofMode }),
  setPalmRejection: (palmRejection) => set({ palmRejection }),
  togglePalmRejection: () => set((state) => ({ palmRejection: !state.palmRejection })),
  setHoldThresholdMs: (ms) => {
    const clamped = Math.max(50, Math.min(2000, ms));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sketch-hold-threshold", String(clamped));
      } catch {}
    }
    set({ holdThresholdMs: clamped });
  },
  setGlobalPressureCurve: (points: CurvePoint[]) => {
    useBrushStore.getState().setGlobalPressureCurve(points);
    set({ globalPressureCurve: points });
  },
  setMovingAverageConfig: (config: Partial<MovingAverageConfig>) => {
    useBrushStore.getState().setMovingAverageConfig(config);
    set((state) => ({
      movingAverageConfig: { ...state.movingAverageConfig, ...config },
    }));
  },
  setPullStringConfig: (config: Partial<PullStringConfig>) => {
    useBrushStore.getState().setPullStringConfig(config);
    set((state) => ({
      pullStringConfig: { ...state.pullStringConfig, ...config },
    }));
  },
  resetTransform: () =>
    set({
      transform: { scale: 0.8, panX: 0, panY: 0 },
    }),
  setLayerStack: (layerStack) => set({ layerStack }),
  setGamutMask: (mask) =>
    set((state) => ({
      gamutMask: {
        ...state.gamutMask,
        ...mask,
      },
    })),
  setWheelConfig: (config) =>
    set((state) => ({
      wheelConfig: {
        ...state.wheelConfig,
        ...config,
      },
    })),

  detachPanel: (panelId: DetachablePanelId) =>
    set((state) => ({
      detachedPanels: {
        ...state.detachedPanels,
        [panelId]: true,
      },
      activePopover: state.activePopover === panelId ? "none" : state.activePopover,
    })),

  dockPanel: (panelId: DetachablePanelId) =>
    set((state) => {
      const targetPopover: PopoverType =
        panelId === "colorGamut" || panelId === "colorGrid" ? "color" : panelId;
      return {
        detachedPanels: {
          ...state.detachedPanels,
          [panelId]: false,
        },
        activePopover: targetPopover,
      };
    }),

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
        alphaLocked: false,
        isClipped: false,
        kind: "raster",
      };

      // Sync layer creation to Rust core
      globalRustBrushBridge.addLayer(newLayer.id, newLayer.name);
      globalWasmBrushBridge.addLayer(newLayer.id, newLayer.name);

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

      // Sync layer deletion to Rust core
      globalRustBrushBridge.deleteLayer(id);
      globalWasmBrushBridge.removeLayer(id);

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

      // Sync layer duplication to Rust core
      globalRustBrushBridge.duplicateLayer(target.id, clonedLayer.id, clonedLayer.name);
      globalWasmBrushBridge.duplicateLayer(target.id, clonedLayer.id, clonedLayer.name);

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

  setActiveLayerId: (activeLayerId: string) => {
    globalRustBrushBridge.setActiveLayer(activeLayerId);
    globalWasmBrushBridge.setActiveLayer(activeLayerId);
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        activeLayerId,
      },
    }));
  },

  toggleLayerVisibility: (id: string) =>
    set((state) => {
      const target = state.layerStack.layers.find((l) => l.id === id);
      if (target) {
        const nextVisible = !target.visible;
        globalRustBrushBridge.setLayerVisibility(id, nextVisible);
        globalWasmBrushBridge.setLayerVisibility(id, nextVisible);
      }
      return {
        layerStack: {
          ...state.layerStack,
          layers: state.layerStack.layers.map((l) =>
            l.id === id ? { ...l, visible: !l.visible } : l
          ),
        },
      };
    }),

  toggleLayerLock: (id: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, locked: !l.locked } : l
        ),
      },
    })),

  setLayerOpacity: (id: string, opacity: number) => {
    const clamped = Math.max(0, Math.min(1, opacity));
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, opacity: clamped } : l
        ),
      },
    }));

    // Debounce expensive multi-layer composite IPC across the Rust/Wasm bridge to animation frame cadence
    pendingLayerOpacities.set(id, clamped);
    if (typeof requestAnimationFrame !== "undefined") {
      if (pendingLayerOpacityRaf === null) {
        pendingLayerOpacityRaf = requestAnimationFrame(flushLayerOpacities);
      }
    } else {
      flushLayerOpacities();
    }
  },

  setLayerBlendMode: (id: string, blendMode: LayerBlendMode) => {
    globalRustBrushBridge.setLayerBlendMode(id, blendMode);
    globalWasmBrushBridge.setLayerBlendMode(id, blendMode);
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, blendMode } : l
        ),
      },
    }));
  },

  renameLayer: (id: string, name: string) =>
    set((state) => ({
      layerStack: {
        ...state.layerStack,
        layers: state.layerStack.layers.map((l) =>
          l.id === id ? { ...l, name: name.trim() || l.name } : l
        ),
      },
    })),

  toggleLayerAlphaLock: (id: string) =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id || l.isBackground) return l;
        const nextLocked = !l.alphaLocked;
        globalRustBrushBridge.setLayerAlphaLock(id, nextLocked);
        globalWasmBrushBridge.setLayerAlphaLock(id, nextLocked);
        return { ...l, alphaLocked: nextLocked };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),

  toggleLayerClipping: (id: string) =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id || l.isBackground) return l;
        const nextClipped = !l.isClipped;
        globalRustBrushBridge.setLayerClipped(id, nextClipped);
        globalWasmBrushBridge.setLayerClipped(id, nextClipped);
        return { ...l, isClipped: nextClipped };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),

  addLayerMask: (id: string) =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id || l.isBackground) return l;
        globalRustBrushBridge.addLayerMask(id);
        globalWasmBrushBridge.addLayerMask(id);
        return {
          ...l,
          mask: { enabled: true, inverted: false },
          activeTarget: "mask" as const,
        };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),

  deleteLayerMask: (id: string) =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id || l.isBackground) return l;
        globalRustBrushBridge.deleteLayerMask(id);
        globalWasmBrushBridge.deleteLayerMask(id);
        const { mask, ...rest } = l;
        return { ...rest, activeTarget: "pixels" as const };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),

  toggleLayerMaskEnabled: (id: string) =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id || !l.mask) return l;
        const nextEnabled = !l.mask.enabled;
        globalRustBrushBridge.setLayerMaskEnabled(id, nextEnabled);
        globalWasmBrushBridge.setLayerMaskEnabled(id, nextEnabled);
        return {
          ...l,
          mask: { ...l.mask, enabled: nextEnabled },
        };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),

  setLayerEditTarget: (id: string, target: "pixels" | "mask") =>
    set((state) => {
      const nextLayers = state.layerStack.layers.map((l) => {
        if (l.id !== id) return l;
        if (target === "mask" && !l.mask) return l;
        globalRustBrushBridge.setLayerEditTarget(id, target);
        globalWasmBrushBridge.setLayerEditTarget(id, target);
        return { ...l, activeTarget: target };
      });
      return { layerStack: { ...state.layerStack, layers: nextLayers } };
    }),
}));

// Subscribe to dedicated brush store so useDocumentStore stays synchronized
useBrushStore.subscribe((brushState) => {
  useDocumentStore.setState({
    brushSize: brushState.brushSize,
    brushOpacity: brushState.brushOpacity,
    brushBlendMode: brushState.brushBlendMode,
    activePresetId: brushState.activePresetId,
    brushSettingsRevision: brushState.brushSettingsRevision,
    isBrushStudioOpen: brushState.isBrushStudioOpen,
    movingAverageConfig: brushState.movingAverageConfig,
    pullStringConfig: brushState.pullStringConfig,
    globalPressureCurve: brushState.globalPressureCurve,
  });
});
