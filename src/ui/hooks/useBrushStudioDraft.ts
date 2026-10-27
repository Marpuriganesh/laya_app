import { useState, useCallback, useMemo } from "react";
import type {
  BrushPreset,
  StrokeSmoothingConfig,
  PixelBrushParameters,
  BrushTextureConfig,
  BrushTip,
  PredefinedBrushTip,
  GeneratedBrushTip,
} from "@/types/brush";
import { DEFAULT_STROKE_SMOOTHING_CONFIG } from "@/types/brush";
import type { CurvePoint } from "@/engine/math/dynamics_curve";
import { createLinearCurve } from "@/engine/math/dynamics_curve";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { useBrushStore } from "@/ui/stores/brush_store";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import type { BrushStudioCategoryId } from "@/ui/components/brush_studio/BrushStudioTypes";

/**
 * Deep-clones a BrushPreset preserving typed arrays (Uint8Array / Uint8ClampedArray)
 * in predefined tip masks and grain textures.
 */
export function deepClonePreset(preset: BrushPreset): BrushPreset {
  const cloned: BrushPreset = {
    presetId: preset.presetId,
    displayName: preset.displayName,
    engineType: preset.engineType,
    thumbnailPngData: preset.thumbnailPngData ? new Uint8Array(preset.thumbnailPngData) : null,
    tags: [...preset.tags],
    smoothingConfig: {
      ...preset.smoothingConfig,
      movingAverage: preset.smoothingConfig.movingAverage
        ? { ...preset.smoothingConfig.movingAverage }
        : undefined,
      pullString: preset.smoothingConfig.pullString
        ? { ...preset.smoothingConfig.pullString }
        : undefined,
    },
    engineParameters: cloneEngineParams(preset.engineParameters),
  };
  return cloned;
}

function cloneEngineParams(params: BrushPreset["engineParameters"]): BrushPreset["engineParameters"] {
  if (params.engineId === "pixelbrush") {
    let clonedTip: BrushTip = params.brushTip;
    if (params.brushTip.tipType === "predefined") {
      const pre = params.brushTip as PredefinedBrushTip;
      clonedTip = {
        tipType: "predefined",
        imageData: new Uint8ClampedArray(pre.imageData),
        width: pre.width,
        height: pre.height,
      };
    } else if (params.brushTip.tipType === "generated") {
      const gen = params.brushTip as GeneratedBrushTip;
      clonedTip = { ...gen };
    }

    let clonedTexture: BrushTextureConfig | null = null;
    if (params.grainTexture) {
      clonedTexture = {
        ...params.grainTexture,
        bytes: new Uint8Array(params.grainTexture.bytes),
      };
    }

    return {
      ...params,
      brushTip: clonedTip,
      grainTexture: clonedTexture,
      sizeDynamics: params.sizeDynamics ? JSON.parse(JSON.stringify(params.sizeDynamics)) : null,
      opacityDynamics: params.opacityDynamics ? JSON.parse(JSON.stringify(params.opacityDynamics)) : null,
      flowDynamics: params.flowDynamics ? JSON.parse(JSON.stringify(params.flowDynamics)) : null,
      angleDynamics: params.angleDynamics ? JSON.parse(JSON.stringify(params.angleDynamics)) : null,
      scatterDynamics: params.scatterDynamics ? JSON.parse(JSON.stringify(params.scatterDynamics)) : null,
      multiDynamics: params.multiDynamics ? JSON.parse(JSON.stringify(params.multiDynamics)) : undefined,
    };
  }

  // Fallback for colorsmudge or mypaint
  return JSON.parse(JSON.stringify(params));
}

export interface UseBrushStudioDraftReturn {
  initialPreset: BrushPreset;
  draftPreset: BrushPreset;
  draftSmoothing: StrokeSmoothingConfig;
  draftPressureCurve: CurvePoint[];
  isDirty: boolean;
  selectedCategory: BrushStudioCategoryId;
  setSelectedCategory: (cat: BrushStudioCategoryId) => void;
  updateDraftEngineParams: (params: Partial<PixelBrushParameters>) => void;
  updateDraftSmoothing: (smoothing: Partial<StrokeSmoothingConfig>) => void;
  updateDraftPressureCurve: (curve: CurvePoint[]) => void;
  updateDraftMetadata: (meta: { displayName?: string; tags?: string[] }) => void;
  revertToInitial: () => void;
  commitToEngine: () => BrushPreset;
  saveAsNewPreset: (customName?: string) => BrushPreset | null;
}

/**
 * Hook to manage isolated in-memory brush editing.
 * Does not mutate active engine canvas brush until explicitly committed.
 */
export function useBrushStudioDraft(
  sourcePreset?: BrushPreset | null
): UseBrushStudioDraftReturn {
  const activePreset = useMemo<BrushPreset>(() => {
    return sourcePreset ?? globalDrawingEngine.getActiveBrush?.() ?? {
      presetId: "fallback-brush",
      displayName: "Basic Brush",
      engineType: "pixelbrush" as const,
      thumbnailPngData: null,
      tags: ["Basic"],
      smoothingConfig: DEFAULT_STROKE_SMOOTHING_CONFIG,
      engineParameters: {
        engineId: "pixelbrush" as const,
        brushTip: {
          tipType: "generated",
          diameter: 32,
          hardness: 0.8,
          aspectRatio: 1.0,
          angleRadians: 0,
        },
        spacingFraction: 0.1,
        baseOpacity: 1.0,
        baseFlow: 1.0,
        baseSizePx: 32,
        softness: 0.2,
        scatterAmplitude: 0,
        isAirbrushMode: false,
        sizeDynamics: null,
        opacityDynamics: null,
        flowDynamics: null,
        angleDynamics: null,
        scatterDynamics: null,
      },
    };
  }, [sourcePreset]);

  const [initialPreset, setInitialPreset] = useState<BrushPreset>(() => deepClonePreset(activePreset));
  const [draftPreset, setDraftPreset] = useState<BrushPreset>(() => deepClonePreset(activePreset));
  const [draftSmoothing, setDraftSmoothing] = useState<StrokeSmoothingConfig>(() => ({
    ...DEFAULT_STROKE_SMOOTHING_CONFIG,
    ...activePreset.smoothingConfig,
    movingAverage: {
      ...(DEFAULT_STROKE_SMOOTHING_CONFIG.movingAverage ?? { enabled: false, windowSize: 8, velocityMultiplier: 1.5 }),
      ...(activePreset.smoothingConfig.movingAverage ?? {}),
    },
    pullString: {
      ...(DEFAULT_STROKE_SMOOTHING_CONFIG.pullString ?? {
        enabled: false,
        maxStringLength: 36,
        velocityMultiplier: 1.5,
        catchUpSpeed: 0.35,
        baseDeadzone: 0.0,
        connectToTipOnRelease: true,
        pressureSmoothing: 0.35,
      }),
      ...(activePreset.smoothingConfig.pullString ?? {}),
    },
  }));
  const [draftPressureCurve, setDraftPressureCurve] = useState<CurvePoint[]>(() => {
    const stored = useBrushStore.getState().globalPressureCurve;
    return stored && stored.length >= 2 ? [...stored] : createLinearCurve();
  });
  const [isDirty, setIsDirty] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BrushStudioCategoryId>("stroke_path");

  const updateDraftEngineParams = useCallback((updates: Partial<PixelBrushParameters>) => {
    setDraftPreset((prev) => {
      if (prev.engineParameters.engineId !== "pixelbrush") return prev;
      const nextParams: PixelBrushParameters = {
        ...prev.engineParameters,
        ...updates,
      };
      return {
        ...prev,
        engineParameters: nextParams,
      };
    });
    setIsDirty(true);
  }, []);

  const updateDraftSmoothing = useCallback((updates: Partial<StrokeSmoothingConfig>) => {
    setDraftSmoothing((prev) => {
      const next: StrokeSmoothingConfig = {
        ...prev,
        ...updates,
        movingAverage: updates.movingAverage
          ? { ...(prev.movingAverage ?? DEFAULT_STROKE_SMOOTHING_CONFIG.movingAverage!), ...updates.movingAverage }
          : prev.movingAverage,
        pullString: updates.pullString
          ? { ...(prev.pullString ?? DEFAULT_STROKE_SMOOTHING_CONFIG.pullString!), ...updates.pullString }
          : prev.pullString,
      };
      return next;
    });
    setIsDirty(true);
  }, []);

  const updateDraftPressureCurve = useCallback((curve: CurvePoint[]) => {
    setDraftPressureCurve([...curve]);
    setIsDirty(true);
  }, []);

  const updateDraftMetadata = useCallback((meta: { displayName?: string; tags?: string[] }) => {
    setDraftPreset((prev) => ({
      ...prev,
      displayName: meta.displayName ?? prev.displayName,
      tags: meta.tags ? [...meta.tags] : prev.tags,
    }));
    setIsDirty(true);
  }, []);

  const revertToInitial = useCallback(() => {
    setDraftPreset(deepClonePreset(initialPreset));
    setDraftSmoothing({
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      ...initialPreset.smoothingConfig,
    });
    const stored = useBrushStore.getState().globalPressureCurve;
    setDraftPressureCurve(stored && stored.length >= 2 ? [...stored] : createLinearCurve());
    setIsDirty(false);
  }, [initialPreset]);

  const commitToEngine = useCallback((): BrushPreset => {
    const params = draftPreset.engineParameters;

    if (params.engineId === "pixelbrush") {
      // 1. Commit preset to DrawingAppEngine
      globalDrawingEngine.updateActivePreset?.(params, draftSmoothing);

      if (typeof params.baseSizePx === "number") {
        globalDrawingEngine.setBrushSize(params.baseSizePx);
        useBrushStore.getState().setBrushSize(params.baseSizePx);
      }
      if (typeof params.baseOpacity === "number") {
        globalDrawingEngine.setBrushOpacity(params.baseOpacity);
        useBrushStore.getState().setBrushOpacity(params.baseOpacity);
      }
      if (typeof params.softness === "number") {
        globalDrawingEngine.setBrushSoftness?.(params.softness);
      }
      if (typeof params.spacingFraction === "number") {
        globalDrawingEngine.setBrushSpacing?.(params.spacingFraction);
      }
      if (typeof params.baseFlow === "number") {
        globalDrawingEngine.setBrushFlow?.(params.baseFlow);
      }

      globalWasmBrushBridge.setBrushConfig({
        diameter: params.baseSizePx,
        softness: params.softness,
        spacing: params.spacingFraction,
        flow: params.baseFlow,
        opacity: params.baseOpacity,
      });

      void globalRustBrushBridge.setBrushConfig({
        diameter: params.baseSizePx ?? 32,
        spacing: params.spacingFraction ?? 0.08,
        softness: params.softness ?? 0.45,
        color: [0, 0, 0, 255],
        opacity: params.baseOpacity ?? 1.0,
        flow: params.baseFlow ?? 1.0,
        size_by_pressure: params.sizeDynamics?.isEnabled ?? true,
        opacity_by_pressure: params.opacityDynamics?.isEnabled ?? false,
        is_erase: false,
      });

      // Smoothing configs
      if (draftSmoothing.movingAverage) {
        globalDrawingEngine.setMovingAverageConfig?.(draftSmoothing.movingAverage);
        useBrushStore.getState().setMovingAverageConfig(draftSmoothing.movingAverage);
      }
      if (draftSmoothing.pullString) {
        globalDrawingEngine.setPullStringConfig?.(draftSmoothing.pullString);
        useBrushStore.getState().setPullStringConfig(draftSmoothing.pullString);
      }

      // Pressure curve
      if (draftPressureCurve.length >= 2) {
        globalDrawingEngine.setPressureCurve?.(draftPressureCurve);
        useBrushStore.getState().setGlobalPressureCurve(draftPressureCurve);
      }

      // Overwrite preset in brush store
      useBrushStore.getState().overwriteActivePreset();
      useBrushStore.getState().bumpBrushSettingsRevision();
      useDocumentStore.getState().bumpBrushSettingsRevision();
    }

    setInitialPreset(deepClonePreset(draftPreset));
    setIsDirty(false);
    return draftPreset;
  }, [draftPreset, draftSmoothing, draftPressureCurve]);

  const saveAsNewPreset = useCallback((customName?: string): BrushPreset | null => {
    const name = customName?.trim() || `${draftPreset.displayName} Copy`;
    const newPreset = useBrushStore.getState().saveActivePresetAsNew(name);
    if (newPreset && draftPreset.engineParameters.engineId === "pixelbrush") {
      globalDrawingEngine.updateActivePreset?.(draftPreset.engineParameters, draftSmoothing);
      useBrushStore.getState().overwriteActivePreset();
      useBrushStore.getState().bumpBrushSettingsRevision();
      useDocumentStore.getState().bumpBrushSettingsRevision();
    }
    return newPreset;
  }, [draftPreset, draftSmoothing]);

  return {
    initialPreset,
    draftPreset,
    draftSmoothing,
    draftPressureCurve,
    isDirty,
    selectedCategory,
    setSelectedCategory,
    updateDraftEngineParams,
    updateDraftSmoothing,
    updateDraftPressureCurve,
    updateDraftMetadata,
    revertToInitial,
    commitToEngine,
    saveAsNewPreset,
  };
}
