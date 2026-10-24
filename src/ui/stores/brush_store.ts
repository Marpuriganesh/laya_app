/**
 * Brush Subsystem Store (Zustand)
 *
 * Dedicated, decoupled state management for:
 * 1. Active brush parameters (size, opacity, blend mode, active preset ID).
 * 2. Brush revision triggers and Studio panel visibility.
 * 3. Input dynamics & smoothing (moving average, pull-string stabilizer, global pressure curve).
 * 4. Krita-inspired preset lifecycle & dirty tracking:
 *    - In-memory dirty tweaks cache (`dirtyPresets`).
 *    - "Temporarily Save Tweaks To Presets" toggle (Krita parity).
 *    - Revert tweaks, overwrite preset, and save as new preset.
 *    - Local persistence of custom presets.
 */

import { create } from "zustand";
import type {
  BrushPreset,
  MovingAverageConfig,
  PullStringConfig,
  PixelBrushParameters,
  StrokeSmoothingConfig,
} from "@/types/brush";
import {
  DEFAULT_MOVING_AVERAGE_CONFIG,
  DEFAULT_PULL_STRING_CONFIG,
  DEFAULT_STROKE_SMOOTHING_CONFIG,
} from "@/types/brush";
import { createLinearCurve, type CurvePoint } from "@/engine/math/dynamics_curve";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";

const STORAGE_KEY_PRESSURE_CURVE = "sketch-global-pressure-curve";
const STORAGE_KEY_SAVE_TWEAKS = "sketch-brush-temporarily-save-tweaks";
const STORAGE_KEY_CUSTOM_PRESETS = "sketch-custom-presets-v1";

export interface SerializedPreset {
  presetId: string;
  displayName: string;
  tags: readonly string[];
  engineParameters: Record<string, unknown>;
  smoothingConfig: StrokeSmoothingConfig;
  thumbnailBase64?: string;
}

export interface BrushSubsystemState {
  // --- Active Brush Parameters ---
  activePresetId: string;
  brushSize: number;
  brushOpacity: number;
  brushBlendMode: string;
  brushSettingsRevision: number;
  isBrushStudioOpen: boolean;

  // --- Smoothing & Input Dynamics ---
  movingAverageConfig: MovingAverageConfig;
  pullStringConfig: PullStringConfig;
  globalPressureCurve: CurvePoint[];

  // --- Krita-style Dirty Tweaks & Preset Management ---
  temporarilySaveTweaks: boolean;
  dirtyPresets: Record<string, Partial<PixelBrushParameters>>;
  basePresets: Record<string, BrushPreset>;
  isCurrentBrushDirty: boolean;

  // --- Actions ---
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushBlendMode: (mode: string) => void;
  setActivePresetId: (id: string) => void;
  setBrushStudioOpen: (open: boolean) => void;
  bumpBrushSettingsRevision: () => void;
  setMovingAverageConfig: (config: Partial<MovingAverageConfig>) => void;
  setPullStringConfig: (config: Partial<PullStringConfig>) => void;
  setGlobalPressureCurve: (points: CurvePoint[]) => void;
  setTemporarilySaveTweaks: (enabled: boolean) => void;

  // Dirty State & Preset Lifecycle
  registerBasePreset: (preset: BrushPreset) => void;
  markPresetDirty: (presetId: string, tweaks: Partial<PixelBrushParameters>) => void;
  clearPresetDirty: (presetId: string) => void;
  revertActivePreset: () => void;
  overwriteActivePreset: () => void;
  saveActivePresetAsNew: (title: string) => BrushPreset | null;
  loadSavedCustomPresets: () => void;
}

function loadInitialPressureCurve(): CurvePoint[] {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PRESSURE_CURVE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          setTimeout(() => globalDrawingEngine.setPressureCurve?.(parsed), 0);
          return parsed;
        }
      }
    } catch {}
  }
  return createLinearCurve();
}

function loadInitialSaveTweaks(): boolean {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SAVE_TWEAKS);
      if (stored !== null) {
        return stored === "true";
      }
    } catch {}
  }
  return true;
}

function saveCustomPresetsToDisk(presets: BrushPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    const serializable: SerializedPreset[] = presets.map((p) => {
      let thumbBase64: string | undefined;
      if (p.thumbnailPngData && p.thumbnailPngData.length > 0) {
        const binary = Array.from(p.thumbnailPngData).map((b) => String.fromCharCode(b)).join("");
        thumbBase64 = btoa(binary);
      }
      return {
        presetId: p.presetId,
        displayName: p.displayName,
        tags: p.tags,
        engineParameters: p.engineParameters as unknown as Record<string, unknown>,
        smoothingConfig: p.smoothingConfig,
        thumbnailBase64: thumbBase64,
      };
    });
    localStorage.setItem(STORAGE_KEY_CUSTOM_PRESETS, JSON.stringify(serializable));
  } catch (err) {
    console.warn("Failed to persist custom presets to disk:", err);
  }
}

export const useBrushStore = create<BrushSubsystemState>((set, get) => ({
  activePresetId: "default-studio-pen",
  brushSize: 32,
  brushOpacity: 1.0,
  brushBlendMode: "normal",
  brushSettingsRevision: 0,
  isBrushStudioOpen: false,

  movingAverageConfig:
    globalDrawingEngine.getMovingAverageConfig?.() ?? DEFAULT_MOVING_AVERAGE_CONFIG,
  pullStringConfig:
    globalDrawingEngine.getPullStringConfig?.() ?? DEFAULT_PULL_STRING_CONFIG,
  globalPressureCurve: loadInitialPressureCurve(),

  temporarilySaveTweaks: loadInitialSaveTweaks(),
  dirtyPresets: {},
  basePresets: {},
  isCurrentBrushDirty: false,

  setBrushSize: (size: number) => {
    const clamped = Math.max(1, size);
    globalDrawingEngine.setBrushSize(clamped);
    const { activePresetId, basePresets, dirtyPresets } = get();
    const base = basePresets[activePresetId];
    const isDirty =
      base && base.engineParameters.engineId === "pixelbrush"
        ? base.engineParameters.baseSizePx !== clamped
        : false;

    set((state) => ({
      brushSize: clamped,
      brushSettingsRevision: state.brushSettingsRevision + 1,
      isCurrentBrushDirty: isDirty || Boolean(dirtyPresets[activePresetId]),
      dirtyPresets: isDirty
        ? {
            ...dirtyPresets,
            [activePresetId]: {
              ...dirtyPresets[activePresetId],
              baseSizePx: clamped,
            },
          }
        : dirtyPresets,
    }));
  },

  setBrushOpacity: (opacity: number) => {
    const clamped = Math.max(0, Math.min(1, opacity));
    globalDrawingEngine.setBrushOpacity(clamped);
    const { activePresetId, basePresets, dirtyPresets } = get();
    const base = basePresets[activePresetId];
    const isDirty =
      base && base.engineParameters.engineId === "pixelbrush"
        ? Math.abs((base.engineParameters.baseOpacity ?? 1.0) - clamped) > 0.001
        : false;

    set((state) => ({
      brushOpacity: clamped,
      brushSettingsRevision: state.brushSettingsRevision + 1,
      isCurrentBrushDirty: isDirty || Boolean(dirtyPresets[activePresetId]),
      dirtyPresets: isDirty
        ? {
            ...dirtyPresets,
            [activePresetId]: {
              ...dirtyPresets[activePresetId],
              baseOpacity: clamped,
            },
          }
        : dirtyPresets,
    }));
  },

  setBrushBlendMode: (mode: string) => {
    set({ brushBlendMode: mode });
    globalDrawingEngine.setBlendMode?.(mode as any);
    void globalRustBrushBridge.setBrushBlendMode(mode);
    globalWasmBrushBridge.setBrushBlendMode(mode);
  },

  setActivePresetId: (activePresetId: string) => {
    const { dirtyPresets } = get();
    set({
      activePresetId,
      isCurrentBrushDirty: Boolean(dirtyPresets[activePresetId]),
    });
  },

  setBrushStudioOpen: (isBrushStudioOpen: boolean) => set({ isBrushStudioOpen }),

  bumpBrushSettingsRevision: () =>
    set((state) => ({ brushSettingsRevision: state.brushSettingsRevision + 1 })),

  setMovingAverageConfig: (config: Partial<MovingAverageConfig>) => {
    set((state) => {
      const updated: MovingAverageConfig = { ...state.movingAverageConfig, ...config };
      globalDrawingEngine.setMovingAverageConfig?.(updated);
      return { movingAverageConfig: updated };
    });
  },

  setPullStringConfig: (config: Partial<PullStringConfig>) => {
    set((state) => {
      const updated: PullStringConfig = { ...state.pullStringConfig, ...config };
      globalDrawingEngine.setPullStringConfig?.(updated);
      return { pullStringConfig: updated };
    });
  },

  setGlobalPressureCurve: (points: CurvePoint[]) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_PRESSURE_CURVE, JSON.stringify(points));
      } catch {}
    }
    globalDrawingEngine.setPressureCurve?.(points);
    set({ globalPressureCurve: points });
  },

  setTemporarilySaveTweaks: (temporarilySaveTweaks: boolean) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SAVE_TWEAKS, String(temporarilySaveTweaks));
      } catch {}
    }
    set({ temporarilySaveTweaks });
  },

  registerBasePreset: (preset: BrushPreset) => {
    const { basePresets } = get();
    if (!basePresets[preset.presetId]) {
      set({
        basePresets: {
          ...basePresets,
          [preset.presetId]: JSON.parse(JSON.stringify(preset)),
        },
      });
    }
  },

  markPresetDirty: (presetId: string, tweaks: Partial<PixelBrushParameters>) => {
    set((state) => ({
      dirtyPresets: {
        ...state.dirtyPresets,
        [presetId]: {
          ...state.dirtyPresets[presetId],
          ...tweaks,
        },
      },
      isCurrentBrushDirty: state.activePresetId === presetId ? true : state.isCurrentBrushDirty,
      brushSettingsRevision: state.brushSettingsRevision + 1,
    }));
  },

  clearPresetDirty: (presetId: string) => {
    set((state) => {
      const nextDirty = { ...state.dirtyPresets };
      delete nextDirty[presetId];
      return {
        dirtyPresets: nextDirty,
        isCurrentBrushDirty: state.activePresetId === presetId ? false : state.isCurrentBrushDirty,
        brushSettingsRevision: state.brushSettingsRevision + 1,
      };
    });
  },

  revertActivePreset: () => {
    const { activePresetId, basePresets } = get();
    const base = basePresets[activePresetId];
    if (!base) return;

    // Restore pristine parameters to drawing engine
    if (base.engineParameters.engineId === "pixelbrush") {
      globalDrawingEngine.updateActivePreset?.(base.engineParameters, base.smoothingConfig);
      set((state) => {
        const nextDirty = { ...state.dirtyPresets };
        delete nextDirty[activePresetId];
        const isPixel = base.engineParameters.engineId === "pixelbrush";
        return {
          dirtyPresets: nextDirty,
          isCurrentBrushDirty: false,
          brushSize: isPixel ? (base.engineParameters.baseSizePx ?? state.brushSize) : state.brushSize,
          brushOpacity: isPixel ? (base.engineParameters.baseOpacity ?? state.brushOpacity) : state.brushOpacity,
          brushSettingsRevision: state.brushSettingsRevision + 1,
        };
      });
    }
  },

  overwriteActivePreset: () => {
    const { activePresetId } = get();
    const currentActive = globalDrawingEngine.getActiveBrush?.();
    if (!currentActive || currentActive.presetId !== activePresetId) return;

    // Snapshot current active brush as the new base preset
    const snapshot: BrushPreset = JSON.parse(JSON.stringify(currentActive));

    set((state) => {
      const nextDirty = { ...state.dirtyPresets };
      delete nextDirty[activePresetId];
      const updatedBases = {
        ...state.basePresets,
        [activePresetId]: snapshot,
      };

      // Persist all custom/overwritten presets
      const customPresets = Object.values(updatedBases).filter((p) =>
        p.tags.includes("Custom") || p.tags.includes("Modified") || p.presetId.startsWith("custom-")
      );
      saveCustomPresetsToDisk(customPresets);

      return {
        basePresets: updatedBases,
        dirtyPresets: nextDirty,
        isCurrentBrushDirty: false,
        brushSettingsRevision: state.brushSettingsRevision + 1,
      };
    });
  },

  saveActivePresetAsNew: (displayName: string): BrushPreset | null => {
    const currentActive = globalDrawingEngine.getActiveBrush?.();
    if (!currentActive) return null;

    const newId = `custom-${Date.now()}`;
    const newName = displayName.trim() || `${currentActive.displayName} Copy`;

    const newPreset: BrushPreset = {
      ...JSON.parse(JSON.stringify(currentActive)),
      presetId: newId,
      displayName: newName,
      tags: [...currentActive.tags.filter((t) => t !== "Default"), "Custom", "Modified"],
    };

    // Register into engine
    globalDrawingEngine.addPreset?.(newPreset);
    globalDrawingEngine.setActiveBrush(newPreset);

    set((state) => {
      const updatedBases = {
        ...state.basePresets,
        [newId]: JSON.parse(JSON.stringify(newPreset)),
      };

      const customPresets = Object.values(updatedBases).filter((p) =>
        p.tags.includes("Custom") || p.tags.includes("Modified") || p.presetId.startsWith("custom-")
      );
      saveCustomPresetsToDisk(customPresets);

      return {
        activePresetId: newId,
        basePresets: updatedBases,
        isCurrentBrushDirty: false,
        brushSettingsRevision: state.brushSettingsRevision + 1,
      };
    });

    return newPreset;
  },

  loadSavedCustomPresets: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_PRESETS);
      if (!stored) return;
      const parsed: SerializedPreset[] = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;

      for (const item of parsed) {
        let thumbPng: Uint8Array | undefined;
        if (item.thumbnailBase64) {
          const binary = atob(item.thumbnailBase64);
          thumbPng = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            thumbPng[i] = binary.charCodeAt(i);
          }
        }

        const preset: BrushPreset = {
          presetId: item.presetId,
          displayName: item.displayName,
          engineType: "pixelbrush",
          tags: item.tags,
          engineParameters: item.engineParameters as unknown as PixelBrushParameters,
          smoothingConfig: item.smoothingConfig ?? DEFAULT_STROKE_SMOOTHING_CONFIG,
          thumbnailPngData: thumbPng ?? null,
        };

        globalDrawingEngine.addPreset?.(preset);
        get().registerBasePreset(preset);
      }
      get().bumpBrushSettingsRevision();
    } catch (err) {
      console.warn("Failed to load saved custom presets:", err);
    }
  },
}));

// Wire engine preset change notifications directly into useBrushStore
if (typeof globalDrawingEngine !== "undefined" && globalDrawingEngine?.setOnPresetChangedListener) {
  globalDrawingEngine.setOnPresetChangedListener((preset) => {
    const isPixel = preset.engineParameters.engineId === "pixelbrush";
    useBrushStore.getState().registerBasePreset(preset);
    useBrushStore.setState((state) => ({
      activePresetId: preset.presetId,
      brushSize: isPixel ? (preset.engineParameters.baseSizePx ?? state.brushSize) : state.brushSize,
      brushOpacity: isPixel ? (preset.engineParameters.baseOpacity ?? state.brushOpacity) : state.brushOpacity,
      movingAverageConfig:
        globalDrawingEngine.getMovingAverageConfig?.() ?? DEFAULT_MOVING_AVERAGE_CONFIG,
      pullStringConfig:
        globalDrawingEngine.getPullStringConfig?.() ?? DEFAULT_PULL_STRING_CONFIG,
      isCurrentBrushDirty: Boolean(state.dirtyPresets[preset.presetId]),
    }));
  });
}
