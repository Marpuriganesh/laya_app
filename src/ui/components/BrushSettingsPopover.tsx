import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import {
  SlidersHorizontal,
  Trash2,
  Activity,
  ChevronRight,
  Waves,
  PenLine,
  Save,
  Check,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Paintbrush,
  Undo2,
  CopyPlus,
} from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { useBrushStore } from "@/ui/stores/brush_store";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { globalRustBrushBridge, type ResourceItemDto } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { BrushDynamicsPanel } from "@/ui/components/BrushDynamicsPanel";
import { BrushScratchpad } from "@/ui/components/BrushScratchpad";
import { BrushStrokePreview } from "@/ui/components/BrushStrokePreview";
import type { BrushPreset, BrushTextureConfig, TextureBlendMode } from "@/types/brush";
import {
  createDefaultCanvasTextureConfig,
  createDefaultCharcoalTextureConfig,
  createDefaultColdPressTextureConfig,
} from "@/engine/brush/procedural_textures";

export interface BrushStudioContentProps {
  activeColor?: string;
}

async function decodeImageToRgba(
  bytes: Uint8Array | number[]
): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
  try {
    const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const blob = new Blob([uint8.buffer as ArrayBuffer], { type: "image/png" });
    const img = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    return {
      width: img.width,
      height: img.height,
      rgba: new Uint8Array(imgData.data.buffer),
    };
  } catch (err) {
    console.warn("Failed to decode image file:", err);
    return null;
  }
}

function parseGbrToThumbnailDataUrl(bytes: Uint8Array, size = 36): string {
  try {
    if (bytes.length < 24) return "";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = view.getUint32(0);
    const width = view.getUint32(8);
    const height = view.getUint32(12);
    const bytesPerPixel = view.getUint32(16);
    const dataOffset = headerSize;

    if (width === 0 || height === 0 || dataOffset >= bytes.length) return "";

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const imgData = ctx.createImageData(width, height);
    if (bytesPerPixel === 1) {
      for (let i = 0; i < width * height; i++) {
        const alpha = bytes[dataOffset + i];
        const p = i * 4;
        imgData.data[p] = 24;
        imgData.data[p + 1] = 24;
        imgData.data[p + 2] = 27;
        imgData.data[p + 3] = alpha;
      }
    } else if (bytesPerPixel === 4) {
      for (let i = 0; i < width * height * 4; i += 4) {
        imgData.data[i] = bytes[dataOffset + i];
        imgData.data[i + 1] = bytes[dataOffset + i + 1];
        imgData.data[i + 2] = bytes[dataOffset + i + 2];
        imgData.data[i + 3] = bytes[dataOffset + i + 3];
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const tctx = thumbCanvas.getContext("2d");
    if (tctx) {
      tctx.drawImage(canvas, 0, 0, size, size);
      return thumbCanvas.toDataURL("image/png");
    }
    return canvas.toDataURL("image/png");
  } catch (err) {
    return "";
  }
}

async function generateThumbnailDataUrl(
  bytes: Uint8Array | number[],
  fileName: string,
  size = 36
): Promise<string> {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (fileName.endsWith(".gbr")) {
    return parseGbrToThumbnailDataUrl(uint8, size);
  }
  const decoded = await decodeImageToRgba(uint8);
  if (!decoded) return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = decoded.width;
  srcCanvas.height = decoded.height;
  const sctx = srcCanvas.getContext("2d");
  if (sctx) {
    const imgData = sctx.createImageData(decoded.width, decoded.height);
    imgData.data.set(decoded.rgba);
    sctx.putImageData(imgData, 0, 0);
    ctx.drawImage(srcCanvas, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  }
  return "";
}

function generateGrayscaleThumbnailDataUrl(
  bytes: Uint8Array,
  width: number,
  height: number,
  size = 36
): string {
  if (typeof document === "undefined") return "";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;
    const sctx = srcCanvas.getContext("2d");
    if (!sctx) return "";

    const imgData = sctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const lum = bytes[i];
      imgData.data[i * 4 + 0] = lum;
      imgData.data[i * 4 + 1] = lum;
      imgData.data[i * 4 + 2] = lum;
      imgData.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(imgData, 0, 0);
    ctx.drawImage(srcCanvas, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

const BUILTIN_PROCEDURAL_TEXTURES: readonly BrushTextureConfig[] = [
  createDefaultCanvasTextureConfig(),
  createDefaultCharcoalTextureConfig(),
  createDefaultColdPressTextureConfig(),
];

export const BrushStudioContent: FC<BrushStudioContentProps> = () => {
  const {
    brushSize,
    brushOpacity,
    setBrushSize,
    setBrushOpacity,
    brushBlendMode,
    setBrushBlendMode,
    activePresetId,
    movingAverageConfig,
    setMovingAverageConfig,
    pullStringConfig,
    setPullStringConfig,
    brushSettingsRevision,
  } = useDocumentStore();

  const {
    isCurrentBrushDirty,
    revertActivePreset,
    overwriteActivePreset,
    saveActivePresetAsNew,
    temporarilySaveTweaks,
    setTemporarilySaveTweaks,
    markPresetDirty,
  } = useBrushStore();

  const [activeBrushState, setActiveBrushState] = useState<BrushPreset | null>(() =>
    globalDrawingEngine.getActiveBrush?.()
  );

  const activeBrush = useMemo(() => {
    return globalDrawingEngine.getActiveBrush?.() ?? activeBrushState;
  }, [activePresetId, brushSettingsRevision, activeBrushState]);

  const [softness, setSoftness] = useState(() => globalDrawingEngine.getBrushSoftness?.() ?? 0.45);
  const [spacing, setSpacing] = useState(() => (globalDrawingEngine.getBrushSpacing?.() ?? 0.08) * 100);
  const [flow, setFlow] = useState(() => (globalDrawingEngine.getBrushFlow?.() ?? 1.0) * 100);
  const [sizeDynamics, setSizeDynamics] = useState(() => globalDrawingEngine.getSizeDynamicsEnabled?.() ?? true);
  const [opacityDynamics, setOpacityDynamics] = useState(() => globalDrawingEngine.getOpacityDynamicsEnabled?.() ?? false);
  const [antialias, setAntialias] = useState(() => globalDrawingEngine.getAntialias?.() ?? true);

  const [isCurveOpen, setIsCurveOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const lastPresetIdRef = useRef<string | null>(null);

  // Disk-backed resource state
  const [brushResources, setBrushResources] = useState<ResourceItemDto[]>([]);
  const [patternResources, setPatternResources] = useState<ResourceItemDto[]>([]);
  const [tipThumbnails, setTipThumbnails] = useState<Record<string, string>>({});
  const [patternThumbnails, setPatternThumbnails] = useState<Record<string, string>>({});
  const [selectedTipId, setSelectedTipId] = useState<string | null>(null);
  const [textureEnabled, setTextureEnabled] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [textureMode, setTextureMode] = useState("multiply");
  const [textureScale, setTextureScale] = useState(1.0);
  const [textureStrength, setTextureStrength] = useState(1.0);
  const [textureByPressure, setTextureByPressure] = useState(false);

  const refreshResources = useCallback(async () => {
    const tips = await globalRustBrushBridge.listResources("brushes");
    const pats = await globalRustBrushBridge.listResources("patterns");

    // Register built-in patterns into Rust & Wasm
    for (const bp of BUILTIN_PROCEDURAL_TEXTURES) {
      const bBytes = bp.bytes instanceof Uint8Array ? bp.bytes : new Uint8Array(bp.bytes);
      globalWasmBrushBridge.registerPatternGrayscale(bp.patternId, bp.name, bp.width, bp.height, bBytes);
      void globalRustBrushBridge.registerPatternGrayscale(bp.patternId, bp.name, bp.width, bp.height, bBytes);
    }

    const builtinDtos: ResourceItemDto[] = BUILTIN_PROCEDURAL_TEXTURES.map((bp) => ({
      id: bp.patternId,
      name: bp.name,
      file_name: `${bp.patternId}.pat`,
      path: `__builtin__:${bp.patternId}`,
      resource_type: "patterns",
      file_size_bytes: bp.width * bp.height,
    }));

    const mergedPats = [...pats];
    for (const bDto of builtinDtos) {
      if (!mergedPats.some((p) => p.id === bDto.id)) {
        mergedPats.push(bDto);
      }
    }

    setBrushResources(tips);
    setPatternResources(mergedPats);
  }, []);

  useEffect(() => {
    refreshResources();
  }, [refreshResources]);

  // Asynchronously generate visual stamp thumbnails for predefined tips
  useEffect(() => {
    let active = true;
    async function loadTipThumbnails() {
      const thumbs: Record<string, string> = {};
      for (const res of brushResources) {
        try {
          const bytes = await globalRustBrushBridge.readResourceFile(res.path);
          if (bytes && active) {
            const thumb = await generateThumbnailDataUrl(bytes, res.file_name, 36);
            if (thumb) thumbs[res.id] = thumb;
          }
        } catch {}
      }
      if (active) {
        setTipThumbnails(thumbs);
      }
    }
    if (brushResources.length > 0) {
      loadTipThumbnails();
    }
    return () => {
      active = false;
    };
  }, [brushResources]);

  // Asynchronously generate tile thumbnails for paper textures
  useEffect(() => {
    let active = true;
    async function loadPatternThumbnails() {
      const thumbs: Record<string, string> = {};
      for (const pat of patternResources) {
        try {
          if (pat.path.startsWith("__builtin__:")) {
            const bp = BUILTIN_PROCEDURAL_TEXTURES.find((b) => b.patternId === pat.id);
            if (bp && active) {
              const bBytes = bp.bytes instanceof Uint8Array ? bp.bytes : new Uint8Array(bp.bytes);
              thumbs[pat.id] = generateGrayscaleThumbnailDataUrl(bBytes, bp.width, bp.height, 36);
            }
          } else {
            const bytes = await globalRustBrushBridge.readResourceFile(pat.path);
            if (bytes && active) {
              const thumb = await generateThumbnailDataUrl(bytes, pat.file_name, 36);
              if (thumb) thumbs[pat.id] = thumb;
            }
          }
        } catch {}
      }
      if (active) {
        setPatternThumbnails(thumbs);
      }
    }
    if (patternResources.length > 0) {
      loadPatternThumbnails();
    }
    return () => {
      active = false;
    };
  }, [patternResources]);

  const handleSelectTip = async (item: ResourceItemDto | null) => {
    if (!item) {
      setSelectedTipId(null);
      await globalRustBrushBridge.setActiveTip(null);
      globalWasmBrushBridge.clearBrushPredefinedTip();
      globalDrawingEngine.updateActivePreset?.({
        brushTip: {
          tipType: "generated",
          diameter: brushSize,
          hardness: Math.max(0, 1 - softness),
          aspectRatio: 1.0,
          angleRadians: 0,
        },
      });
      useDocumentStore.getState().bumpBrushSettingsRevision();
      return;
    }
    setSelectedTipId(item.id);
    const bytes = await globalRustBrushBridge.readResourceFile(item.path);
    if (bytes) {
      if (item.file_name.endsWith(".gbr")) {
        await globalRustBrushBridge.registerTipGbr(item.id, bytes);
        globalWasmBrushBridge.registerTipGbr(item.id, bytes);
      } else if (
        item.file_name.endsWith(".png") ||
        item.file_name.endsWith(".webp") ||
        item.file_name.endsWith(".jpg")
      ) {
        const decoded = await decodeImageToRgba(bytes);
        if (decoded) {
          await globalRustBrushBridge.registerTipMask(
            item.id,
            item.name,
            decoded.width,
            decoded.height,
            decoded.rgba,
            false
          );
          globalWasmBrushBridge.registerTipMask(
            item.id,
            item.name,
            decoded.width,
            decoded.height,
            decoded.rgba,
            false
          );

          // Extract 8-bit alpha mask for active preset
          const alphaMask = new Uint8ClampedArray(decoded.width * decoded.height);
          for (let i = 0; i < decoded.width * decoded.height; i++) {
            alphaMask[i] = decoded.rgba[i * 4 + 3];
          }

          globalDrawingEngine.updateActivePreset?.({
            brushTip: {
              tipType: "predefined",
              imageData: alphaMask,
              width: decoded.width,
              height: decoded.height,
            },
          });
        }
      }
      await globalRustBrushBridge.setActiveTip(item.id, 1.0, 0.0);
      globalWasmBrushBridge.setBrushPredefinedTip(item.id, 1.0, 0.0);
      useDocumentStore.getState().bumpBrushSettingsRevision();
    }
  };

  const handleSelectPattern = async (item: ResourceItemDto | null) => {
    if (!item) {
      setSelectedPatternId(null);
      await globalRustBrushBridge.setActivePattern(null);
      globalWasmBrushBridge.clearBrushTexture();
      globalDrawingEngine.updateActivePreset?.({ grainTexture: null });
      useDocumentStore.getState().bumpBrushSettingsRevision();
      return;
    }
    setSelectedPatternId(item.id);

    let texConfig: BrushTextureConfig | null = null;

    if (item.path.startsWith("__builtin__:")) {
      const bp = BUILTIN_PROCEDURAL_TEXTURES.find((b) => b.patternId === item.id);
      if (bp) {
        const bBytes = bp.bytes instanceof Uint8Array ? bp.bytes : new Uint8Array(bp.bytes);
        globalWasmBrushBridge.registerPatternGrayscale(bp.patternId, bp.name, bp.width, bp.height, bBytes);
        void globalRustBrushBridge.registerPatternGrayscale(bp.patternId, bp.name, bp.width, bp.height, bBytes);
        texConfig = {
          patternId: bp.patternId,
          name: bp.name,
          width: bp.width,
          height: bp.height,
          bytes: bBytes,
          scale: textureScale,
          mode: (textureMode as TextureBlendMode) || bp.mode,
          strength: textureStrength,
          byPressure: textureByPressure,
        };
      }
    } else {
      const bytes = await globalRustBrushBridge.readResourceFile(item.path);
      if (bytes) {
        if (item.file_name.endsWith(".pat")) {
          await globalRustBrushBridge.registerPatternPat(item.id, bytes);
          globalWasmBrushBridge.registerPatternPat(item.id, bytes);
        } else if (
          item.file_name.endsWith(".png") ||
          item.file_name.endsWith(".webp") ||
          item.file_name.endsWith(".jpg")
        ) {
          const decoded = await decodeImageToRgba(bytes);
          if (decoded) {
            await globalRustBrushBridge.registerPatternRgba(
              item.id,
              item.name,
              decoded.width,
              decoded.height,
              decoded.rgba
            );
            globalWasmBrushBridge.registerPatternRgba(
              item.id,
              item.name,
              decoded.width,
              decoded.height,
              decoded.rgba
            );

            const lumBytes = new Uint8Array(decoded.width * decoded.height);
            for (let i = 0; i < decoded.width * decoded.height; i++) {
              const r = decoded.rgba[i * 4 + 0];
              const g = decoded.rgba[i * 4 + 1];
              const b = decoded.rgba[i * 4 + 2];
              lumBytes[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }

            texConfig = {
              patternId: item.id,
              name: item.name,
              width: decoded.width,
              height: decoded.height,
              bytes: lumBytes,
              scale: textureScale,
              mode: (textureMode as TextureBlendMode) || "multiply",
              strength: textureStrength,
              byPressure: textureByPressure,
            };
          }
        }
      }
    }

    await globalRustBrushBridge.setActivePattern(
      item.id,
      textureScale,
      textureMode,
      textureStrength,
      false,
      0.0,
      1.0,
      textureByPressure
    );
    globalWasmBrushBridge.setBrushTextureResource(
      item.id,
      textureScale,
      textureMode,
      textureStrength,
      false,
      0.0,
      1.0,
      textureByPressure
    );

    if (texConfig) {
      globalDrawingEngine.updateActivePreset?.({ grainTexture: texConfig });
    }
    useDocumentStore.getState().bumpBrushSettingsRevision();
  };

  const handleTextureToggle = async (enabled: boolean) => {
    setTextureEnabled(enabled);
    if (!enabled) {
      await globalRustBrushBridge.setActivePattern(null);
      globalWasmBrushBridge.clearBrushTexture();
      globalDrawingEngine.updateActivePreset?.({ grainTexture: null });
      useDocumentStore.getState().bumpBrushSettingsRevision();
    } else if (selectedPatternId) {
      const item = patternResources.find((p) => p.id === selectedPatternId);
      if (item) await handleSelectPattern(item);
    } else if (patternResources.length > 0) {
      await handleSelectPattern(patternResources[0]);
    }
  };

  const handleTextureParamChange = (
    scale = textureScale,
    mode = textureMode,
    strength = textureStrength,
    byPressure = textureByPressure
  ) => {
    if (!selectedPatternId || !textureEnabled) return;
    globalRustBrushBridge.setActivePattern(
      selectedPatternId,
      scale,
      mode,
      strength,
      false,
      0.0,
      1.0,
      byPressure
    );
    globalWasmBrushBridge.setBrushTextureResource(
      selectedPatternId,
      scale,
      mode,
      strength,
      false,
      0.0,
      1.0,
      byPressure
    );

    const currentTex =
      activeBrush?.engineParameters.engineId === "pixelbrush"
        ? activeBrush.engineParameters.grainTexture
        : null;
    if (currentTex) {
      const updatedTex: BrushTextureConfig = {
        ...currentTex,
        scale,
        mode: mode as TextureBlendMode,
        strength,
        byPressure,
      };
      globalDrawingEngine.updateActivePreset?.({ grainTexture: updatedTex });
      useDocumentStore.getState().bumpBrushSettingsRevision();
    }
  };

  const handleSave = () => {
    // Explicitly commit all current settings to the active preset in the engine
    globalDrawingEngine.updateActivePreset?.(
      {
        softness,
        spacingFraction: spacing / 100,
        baseFlow: flow / 100,
        baseSizePx: brushSize,
        baseOpacity: brushOpacity,
        sizeDynamics: sizeDynamics
          ? {
              sensorInput: "pressure",
              curvePoints: [
                { inputValue: 0, outputValue: 0.1 },
                { inputValue: 1, outputValue: 1 },
              ],
              isEnabled: true,
            }
          : null,
        opacityDynamics: opacityDynamics
          ? {
              sensorInput: "pressure",
              curvePoints: [
                { inputValue: 0, outputValue: 0.1 },
                { inputValue: 1, outputValue: 1 },
              ],
              isEnabled: true,
            }
          : null,
      },
      {
        pullString: pullStringConfig,
        mode: pullStringConfig.enabled
          ? "streamline"
          : movingAverageConfig.enabled
          ? "movingAverage"
          : "none",
      }
    );

    // Save smoothing configurations to local storage & engine
    globalDrawingEngine.setMovingAverageConfig?.(movingAverageConfig);
    globalDrawingEngine.setPullStringConfig?.(pullStringConfig);

    // Refresh active preset reference to re-render preview thumbnail
    const updated = globalDrawingEngine.getActiveBrush?.();
    if (updated) {
      setActiveBrushState({ ...updated });
    }

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  const syncFromActiveBrush = useCallback(() => {
    const brush = globalDrawingEngine.getActiveBrush?.();
    setActiveBrushState(brush);
    if (!brush) return;

    if (brush.engineParameters && brush.engineParameters.engineId === "pixelbrush") {
      const p = brush.engineParameters;
      if (typeof p.softness === "number") setSoftness(p.softness);
      if (typeof p.spacingFraction === "number") setSpacing(Math.round(p.spacingFraction * 100));
      if (typeof p.baseFlow === "number") setFlow(Math.round(p.baseFlow * 100));
      if (typeof p.baseSizePx === "number") setBrushSize(p.baseSizePx);
      if (typeof p.baseOpacity === "number") setBrushOpacity(p.baseOpacity);
      if (p.sizeDynamics) setSizeDynamics(p.sizeDynamics.isEnabled);
      if (p.opacityDynamics) setOpacityDynamics(p.opacityDynamics.isEnabled);
      if (p.grainTexture) {
        setTextureEnabled(true);
        setSelectedPatternId(p.grainTexture.patternId);
        if (typeof p.grainTexture.scale === "number") setTextureScale(p.grainTexture.scale);
        if (p.grainTexture.mode) setTextureMode(p.grainTexture.mode);
        if (typeof p.grainTexture.strength === "number") setTextureStrength(p.grainTexture.strength);
        if (typeof p.grainTexture.byPressure === "boolean") setTextureByPressure(p.grainTexture.byPressure);
      } else {
        setTextureEnabled(false);
      }
      if (p.brushTip && p.brushTip.tipType === "predefined") {
        setSelectedTipId(`tip-${brush.presetId}`);
      } else {
        setSelectedTipId(null);
      }
    }

    const mv = globalDrawingEngine.getMovingAverageConfig?.();
    if (mv) setMovingAverageConfig(mv);
    const ps = globalDrawingEngine.getPullStringConfig?.();
    if (ps) setPullStringConfig(ps);
    const currentMode = globalDrawingEngine.getBlendMode?.();
    if (currentMode) setBrushBlendMode(currentMode);
  }, [setBrushSize, setBrushOpacity, setBrushBlendMode, setMovingAverageConfig, setPullStringConfig]);

  // Only re-sync parameters when activePresetId actually changes (preventing slider overwrites on color change or re-renders)
  useEffect(() => {
    if (activePresetId !== lastPresetIdRef.current) {
      lastPresetIdRef.current = activePresetId;
      syncFromActiveBrush();
    }
  }, [activePresetId, syncFromActiveBrush]);

  const handleSoftnessChange = (val: number) => {
    setSoftness(val);
    globalDrawingEngine.setBrushSoftness?.(val);
    globalDrawingEngine.updateActivePreset?.({ softness: val });
    markPresetDirty(activePresetId, { softness: val });
  };

  const handleSpacingChange = (valPercent: number) => {
    setSpacing(valPercent);
    const frac = valPercent / 100;
    globalDrawingEngine.setBrushSpacing?.(frac);
    globalDrawingEngine.updateActivePreset?.({ spacingFraction: frac });
    markPresetDirty(activePresetId, { spacingFraction: frac });
  };

  const handleFlowChange = (valPercent: number) => {
    setFlow(valPercent);
    const fl = valPercent / 100;
    globalDrawingEngine.setBrushFlow?.(fl);
    globalDrawingEngine.updateActivePreset?.({ baseFlow: fl });
    markPresetDirty(activePresetId, { baseFlow: fl });
  };

  const handleAntialiasToggle = (enabled: boolean) => {
    setAntialias(enabled);
    globalDrawingEngine.setAntialias?.(enabled);
  };

  const handleBlendModeChange = (mode: string) => {
    setBrushBlendMode(mode);
    globalDrawingEngine.setBlendMode?.(mode as any);
    void globalRustBrushBridge.setBrushBlendMode(mode);
    globalWasmBrushBridge.setBrushBlendMode(mode);
  };

  const handleClear = () => {
    globalDrawingEngine.clearCanvas();
  };

  const handleRevert = () => {
    revertActivePreset();
    syncFromActiveBrush();
  };

  const handleOverwrite = () => {
    overwriteActivePreset();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSaveAsNew = () => {
    const defaultName = `${activeBrush?.displayName ?? "Brush"} Copy`;
    const name = typeof window !== "undefined" ? window.prompt("Save new brush preset as:", defaultName) : defaultName;
    if (name && name.trim()) {
      saveActivePresetAsNew(name.trim());
    }
  };

  return (
    <div className="flex h-135 w-full max-w-full overflow-hidden select-none">
      {/* Left Column: Scrollable Settings Inspector */}
      <div className="flex-1 p-4 flex flex-col gap-4 text-xs text-zinc-700 dark:text-zinc-200 overflow-y-auto overflow-x-hidden min-w-0 border-r border-zinc-200 dark:border-white/5">
        {/* Active Brush Header Card with Display Name, Procreate-Style Stroke Thumbnail & Krita-style Preset Actions */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 shadow-xs">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                  {activeBrush?.displayName ?? "Studio Pen"}
                </span>
                {isCurrentBrushDirty && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                    * Modified
                  </span>
                )}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                  Active
                </span>
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {activeBrush?.tags?.join(" • ") ?? "Preset Parameters"}
              </span>
            </div>
          </div>

          {/* Stroke Preview Thumbnail & Actions */}
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            {activeBrush && (
              <BrushStrokePreview
                preset={activeBrush}
                width={110}
                height={32}
              />
            )}
            <button
              type="button"
              onClick={handleRevert}
              disabled={!isCurrentBrushDirty}
              title="Revert tweaks to baseline preset"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shadow-xs transition-all"
            >
              <Undo2 className="w-3 h-3" />
              <span>Revert</span>
            </button>
            <button
              type="button"
              onClick={handleOverwrite}
              disabled={!isCurrentBrushDirty}
              title="Overwrite baseline preset with current tweaks"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-xs ${
                isSaved
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-600 hover:bg-amber-500 active:scale-95 text-white disabled:opacity-35 disabled:cursor-not-allowed"
              }`}
            >
              {isSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              <span>{isSaved ? "Saved!" : "Overwrite"}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAsNew}
              title="Save tweaks as a new custom brush preset"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white cursor-pointer shadow-xs transition-all"
            >
              <CopyPlus className="w-3 h-3" />
              <span>Save New...</span>
            </button>
          </div>
        </div>
        {/* Brush Size */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Brush Size</span>
            <span className="font-mono text-zinc-500">{Math.round(brushSize)}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={300}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Master Opacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Opacity</span>
            <span className="font-mono text-zinc-500">{Math.round(brushOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={1.0}
            step={0.01}
            value={brushOpacity}
            onChange={(e) => setBrushOpacity(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Brush Color Blending Mode */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Blending Mode</span>
            <span className="font-mono text-zinc-500 capitalize">{brushBlendMode}</span>
          </div>
          <select
            value={brushBlendMode}
            onChange={(e) => handleBlendModeChange(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="normal">Normal (Standard Over)</option>
            <option value="parallel">Krita Parallel (Harmonic Mean)</option>
            <option value="multiply">Multiply (Darken / Glaze)</option>
            <option value="screen">Screen (Lighten / Glow)</option>
            <option value="overlay">Overlay (Contrast)</option>
            <option value="colordodge">Color Dodge (Vibrant Glow)</option>
            <option value="colorburn">Color Burn (Deep Shadow)</option>
            <option value="darken">Darken</option>
            <option value="lighten">Lighten</option>
            <option value="hardlight">Hard Light</option>
            <option value="softlight">Soft Light</option>
            <option value="difference">Difference</option>
            <option value="exclusion">Exclusion</option>
            <option value="add">Add (Linear Dodge)</option>
            <option value="subtract">Subtract</option>
            <option value="divide">Divide</option>
            <option value="behind">Behind (Paint Underneath)</option>
            <option value="erase">Erase (Clear Mask)</option>
          </select>
        </div>

        {/* Tip Softness */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Softness / Radial Fade</span>
            <span className="font-mono text-zinc-500">{Math.round(softness * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.02}
            value={softness}
            onChange={(e) => handleSoftnessChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Dab Spacing */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Dab Spacing</span>
            <span className="font-mono text-zinc-500">{Math.round(spacing)}%</span>
          </div>
          <input
            type="range"
            min={2}
            max={100}
            value={spacing}
            onChange={(e) => handleSpacingChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Flow */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Flow Accumulation</span>
            <span className="font-mono text-zinc-500">{Math.round(flow)}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            value={flow}
            onChange={(e) => handleFlowChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Anti-Aliasing (Subpixel Smoothing) */}
        <label className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Anti-Aliasing</span>
            <span className="text-[10px] text-zinc-500">Smooth subpixel edges (disable for pixel art)</span>
          </div>
          <input
            type="checkbox"
            checked={antialias}
            onChange={(e) => handleAntialiasToggle(e.target.checked)}
            className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
          />
        </label>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Brush Tip Stamp (Auto vs Raster .gbr/.png) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              Brush Tip Stamp (Dab Mask)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={refreshResources}
                title="Refresh resource files from disk"
                className="p-1 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => globalRustBrushBridge.openResourceFolder("brushes")}
                title="Open Brushes directory in Finder / Explorer"
                className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Open Folder</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => handleSelectTip(null)}
              className={`p-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                selectedTipId === null
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200"
                  : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                <div className="w-4 h-4 rounded-full bg-zinc-900 dark:bg-zinc-100 shadow-xs" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">Auto Circle</div>
                <div className="text-[10px] text-zinc-500">Analytical tip</div>
              </div>
            </button>

            {brushResources.map((res) => (
              <button
                key={res.id}
                type="button"
                onClick={() => handleSelectTip(res)}
                className={`p-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                  selectedTipId === res.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                  {tipThumbnails[res.id] ? (
                    <img src={tipThumbnails[res.id]} alt={res.name} className="w-7 h-7 object-contain" />
                  ) : (
                    <Paintbrush className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{res.name}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{res.file_name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Seamless Paper Pattern Textures (Krita KisTexture) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-blue-500" />
              Paper Texture Grain (KisTexture)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => globalRustBrushBridge.openResourceFolder("patterns")}
                title="Open Patterns directory in Finder / Explorer"
                className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline px-1 py-0.5 cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Open Folder</span>
              </button>
              <input
                type="checkbox"
                checked={textureEnabled}
                onChange={(e) => handleTextureToggle(e.target.checked)}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                title="Toggle paper grain texture modulation"
              />
            </div>
          </div>

          {textureEnabled && (
            <div className="flex flex-col gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              {/* Pattern selection buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                {patternResources.map((pat) => (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => handleSelectPattern(pat)}
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                      selectedPatternId === pat.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                      {patternThumbnails[pat.id] ? (
                        <img src={patternThumbnails[pat.id]} alt={pat.name} className="w-full h-full object-cover" />
                      ) : (
                        <Waves className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{pat.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{pat.file_name}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Texture Blend Mode */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Texture Blend Mode</span>
                <select
                  value={textureMode}
                  onChange={(e) => {
                    const m = e.target.value;
                    setTextureMode(m);
                    handleTextureParamChange(textureScale, m, textureStrength, textureByPressure);
                  }}
                  className="px-2 py-1 text-xs rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  <option value="multiply">Multiply (Darken Tooth)</option>
                  <option value="subtract">Subtract (Carve Tooth)</option>
                  <option value="parallel">Krita Parallel (Harmonic Tooth)</option>
                  <option value="screen">Screen (Lighten Tooth)</option>
                  <option value="add">Add (Brighten Tooth)</option>
                  <option value="overlay">Overlay</option>
                  <option value="divide">Divide</option>
                </select>
              </div>

              {/* Texture Scale */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Pattern Scale</span>
                  <span className="font-mono text-zinc-500">{textureScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={4.0}
                  step={0.1}
                  value={textureScale}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setTextureScale(s);
                    handleTextureParamChange(s, textureMode, textureStrength, textureByPressure);
                  }}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>

              {/* Texture Strength */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Modulation Strength</span>
                  <span className="font-mono text-zinc-500">{Math.round(textureStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.0}
                  max={1.0}
                  step={0.02}
                  value={textureStrength}
                  onChange={(e) => {
                    const st = Number(e.target.value);
                    setTextureStrength(st);
                    handleTextureParamChange(textureScale, textureMode, st, textureByPressure);
                  }}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>

              {/* Pressure sensitivity toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">Modulate tooth depth by stylus pressure</span>
                <input
                  type="checkbox"
                  checked={textureByPressure}
                  onChange={(e) => {
                    const p = e.target.checked;
                    setTextureByPressure(p);
                    handleTextureParamChange(textureScale, textureMode, textureStrength, p);
                  }}
                  className="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Hardware & Stylus Sensor Dynamics */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Sensor Dynamics & Transfer Curves
            </span>
            <button
              type="button"
              onClick={() => setIsCurveOpen(!isCurveOpen)}
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <span>{isCurveOpen ? "Collapse" : "Open Dynamics Studio"}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isCurveOpen ? "rotate-90" : ""
                }`}
              />
            </button>
          </div>

          {/* Pressure Smoothing (Independent of spatial leash) */}
          <div className="flex flex-col gap-1 p-2 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Pressure Smoothing</span>
              <span className="font-mono text-zinc-500">{Math.round((pullStringConfig.pressureSmoothing ?? 0.35) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.90}
              step={0.02}
              value={pullStringConfig.pressureSmoothing ?? 0.35}
              onChange={(e) => setPullStringConfig({ pressureSmoothing: Number(e.target.value) })}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              title="Smooths pressure transitions and filters out stylus pressure step jitter"
            />
            <div className="flex justify-between text-[9px] text-zinc-400">
              <span>0% (Raw 1:1)</span>
              <span>Hardware jitter filter</span>
              <span>90% (Silky)</span>
            </div>
          </div>

          {/* Reusable Krita-Style Brush Dynamics Studio Panel */}
          {isCurveOpen && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              <BrushDynamicsPanel key={activePresetId} />
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Dynamic Moving Average (Line Art Smoothing) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <PenLine className="w-3.5 h-3.5 text-blue-500" />
              Moving Average (Line Art)
            </span>
            <input
              type="checkbox"
              checked={movingAverageConfig.enabled}
              onChange={(e) => setMovingAverageConfig({ enabled: e.target.checked })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              title="Toggle dynamic moving average line art smoothing"
            />
          </div>

          {movingAverageConfig.enabled && (
            <div className="flex flex-col gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              {/* Window Size */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Smoothing Window</span>
                  <span className="font-mono text-zinc-500">{movingAverageConfig.windowSize} samples</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={movingAverageConfig.windowSize}
                  onChange={(e) => setMovingAverageConfig({ windowSize: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Number of trajectory samples in the smoothing window"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>2 (Sharp)</span>
                  <span>Anti-jitter window</span>
                  <span>24 (Maximum)</span>
                </div>
              </div>

              {/* Dynamic Velocity Scaling */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Velocity Scaling</span>
                  <span className="font-mono text-zinc-500">{movingAverageConfig.velocityMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.0}
                  max={4.0}
                  step={0.1}
                  value={movingAverageConfig.velocityMultiplier}
                  onChange={(e) => setMovingAverageConfig({ velocityMultiplier: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Expands smoothing window on fast sweeps, contracts down for tight corners"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>0.0x (Fixed)</span>
                  <span>Contracts in corners</span>
                  <span>4.0x (Heavy)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Stroke Stabilization (Pull String) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-blue-500" />
              Pull String (Calligraphy)
            </span>
            <input
              type="checkbox"
              checked={pullStringConfig.enabled}
              onChange={(e) => setPullStringConfig({ enabled: e.target.checked })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              title="Toggle pull string stroke smoothing"
            />
          </div>

          {pullStringConfig.enabled && (
            <div className="flex flex-col gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              {/* Max String Length */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Max String Length</span>
                  <span className="font-mono text-zinc-500">{pullStringConfig.maxStringLength}px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={2}
                  value={pullStringConfig.maxStringLength}
                  onChange={(e) => setPullStringConfig({ maxStringLength: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Maximum leash length in pixels at high velocity"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>10px (Agile)</span>
                  <span>Elastic leash</span>
                  <span>120px (Maximum)</span>
                </div>
              </div>

              {/* Velocity Multiplier */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Velocity Scaling</span>
                  <span className="font-mono text-zinc-500">{pullStringConfig.velocityMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6.0}
                  step={0.1}
                  value={pullStringConfig.velocityMultiplier}
                  onChange={(e) => setPullStringConfig({ velocityMultiplier: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Expands leash length dynamically based on stroke speed"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>0.5x (Subtle)</span>
                  <span>Speed sensitivity</span>
                  <span>6.0x (Heavy)</span>
                </div>
              </div>

              {/* Catch-Up Speed */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Catch-Up Responsiveness</span>
                  <span className="font-mono text-zinc-500">{Math.round(pullStringConfig.catchUpSpeed * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.50}
                  step={0.01}
                  value={pullStringConfig.catchUpSpeed}
                  onChange={(e) => setPullStringConfig({ catchUpSpeed: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="How fast the leash contracts to zero when slowing down into corners"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>5% (Flowy)</span>
                  <span>Contracts in corners</span>
                  <span>50% (Instant)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Krita-style Tweaks Memory Management Toggle */}
        <div className="flex items-center justify-between py-1 px-1">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={temporarilySaveTweaks}
              onChange={(e) => setTemporarilySaveTweaks(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Temporarily Save Tweaks To Presets</span>
          </label>
        </div>

        {/* Action Buttons: Save Settings & Clear Canvas Paper */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold shadow-md transition-all cursor-pointer ${
              isSaved
                ? "bg-emerald-600 text-white shadow-emerald-500/25"
                : "bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-blue-500/25"
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>
              {isSaved
                ? "Settings Saved to Preset!"
                : `Save Settings for ${activeBrush?.displayName ?? "Preset"}`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-98 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Canvas Paper
          </button>
        </div>
      </div>

      {/* Right Column: Embedded Live Scratchpad (white in dark mode, black in light mode) */}
      <div className="w-68 p-3 flex flex-col items-center justify-center bg-zinc-50/60 dark:bg-zinc-900/40 shrink-0">
        <BrushScratchpad
          activeBrush={activeBrush}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          softness={softness}
          spacing={spacing}
          sizeDynamics={sizeDynamics}
          opacityDynamics={opacityDynamics}
          width={248}
          height={460}
        />
      </div>
    </div>
  );
};

interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
  onDetach?: () => void;
}

export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  const activeBrush = globalDrawingEngine.getActiveBrush?.();
  const windowTitle = activeBrush ? `Brush Studio: ${activeBrush.displayName}` : "Brush Studio";

  return (
    <FloatingWindowPanel
      title={windowTitle}
      icon={<SlidersHorizontal className="w-4 h-4 text-blue-500" />}
      isOpen={isOpen}
      onClose={onClose}
      width={820}
      height={560}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-132 top-16"
      initialOffset={{ x: 0, y: 0 }}
    >
      <BrushStudioContent />
    </FloatingWindowPanel>
  );
};
