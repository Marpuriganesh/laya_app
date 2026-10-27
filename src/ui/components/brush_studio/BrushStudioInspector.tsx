import { useState, useEffect, useCallback, type FC } from "react";
import {
  Waves,
  FolderOpen,
  RefreshCw,
  Paintbrush,
  RotateCcw,
} from "lucide-react";
import type {
  BrushPreset,
  StrokeSmoothingConfig,
  PixelBrushParameters,
  BrushTextureConfig,
  TextureBlendMode,
  PullStringConfig,
  MovingAverageConfig,
} from "@/types/brush";
import {
  DEFAULT_PULL_STRING_CONFIG,
  DEFAULT_MOVING_AVERAGE_CONFIG,
} from "@/types/brush";
import type { CurvePoint } from "@/engine/math/dynamics_curve";
import { createLinearCurve } from "@/engine/math/dynamics_curve";
import { globalRustBrushBridge, type ResourceItemDto } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import {
  createDefaultCanvasTextureConfig,
  createDefaultCharcoalTextureConfig,
  createDefaultColdPressTextureConfig,
} from "@/engine/brush/procedural_textures";
import { BrushDynamicsPanel } from "@/ui/components/BrushDynamicsPanel";
import { CurveEditor } from "@/ui/components/CurveEditor";
import { BrushStrokePreview } from "@/ui/components/BrushStrokePreview";
import { parseGbr } from "@/engine/brush/gbr_parser";
import { ShapeRotationDial } from "./ShapeRotationDial";
import { StylusTiltArcWidget } from "./StylusTiltArcWidget";
import type { BrushStudioCategoryId } from "./BrushStudioTypes";

const BUILTIN_PROCEDURAL_TEXTURES: readonly BrushTextureConfig[] = [
  createDefaultCanvasTextureConfig(),
  createDefaultCharcoalTextureConfig(),
  createDefaultColdPressTextureConfig(),
];

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
  } catch {
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
  } catch {
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

export interface BrushStudioInspectorProps {
  category: BrushStudioCategoryId;
  draftPreset: BrushPreset;
  draftSmoothing: StrokeSmoothingConfig;
  draftPressureCurve: CurvePoint[];
  onUpdateEngineParams: (params: Partial<PixelBrushParameters>) => void;
  onUpdateSmoothing: (smoothing: Partial<StrokeSmoothingConfig>) => void;
  onUpdatePressureCurve: (curve: CurvePoint[]) => void;
  onUpdateMetadata: (meta: { displayName?: string; tags?: string[] }) => void;
  onRevertToInitial: () => void;
}

export const BrushStudioInspector: FC<BrushStudioInspectorProps> = ({
  category,
  draftPreset,
  draftSmoothing,
  draftPressureCurve,
  onUpdateEngineParams,
  onUpdateSmoothing,
  onUpdatePressureCurve,
  onUpdateMetadata,
  onRevertToInitial,
}) => {
  const params = draftPreset.engineParameters.engineId === "pixelbrush"
    ? draftPreset.engineParameters
    : null;

  // Disk resources state
  const [brushResources, setBrushResources] = useState<ResourceItemDto[]>([]);
  const [patternResources, setPatternResources] = useState<ResourceItemDto[]>([]);
  const [tipThumbnails, setTipThumbnails] = useState<Record<string, string>>({});
  const [patternThumbnails, setPatternThumbnails] = useState<Record<string, string>>({});
  const [tiltThresholdDeg, setTiltThresholdDeg] = useState(15);

  const refreshResources = useCallback(async () => {
    const tips = await globalRustBrushBridge.listResources("brushes");
    const pats = await globalRustBrushBridge.listResources("patterns");

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
      if (active) setTipThumbnails(thumbs);
    }
    if (brushResources.length > 0) loadTipThumbnails();
    return () => {
      active = false;
    };
  }, [brushResources]);

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
      if (active) setPatternThumbnails(thumbs);
    }
    if (patternResources.length > 0) loadPatternThumbnails();
    return () => {
      active = false;
    };
  }, [patternResources]);

  const handleSelectTip = async (item: ResourceItemDto | null) => {
    if (!item) {
      const curAngle = params?.brushTip?.tipType === "generated" ? (params.brushTip.angleRadians ?? 0) : 0;
      const curAr = params?.brushTip?.tipType === "generated" ? (params.brushTip.aspectRatio ?? 1.0) : 1.0;
      onUpdateEngineParams({
        brushTip: {
          tipType: "generated",
          diameter: params?.baseSizePx ?? 32,
          hardness: Math.max(0, 1 - (params?.softness ?? 0.45)),
          aspectRatio: curAr,
          angleRadians: curAngle,
        },
      });
      await globalRustBrushBridge.setActiveTip(null);
      globalWasmBrushBridge.clearBrushPredefinedTip();
      globalWasmBrushBridge.setBrushAutoTip(curAr, curAngle);
      return;
    }
    const bytes = await globalRustBrushBridge.readResourceFile(item.path);
    if (!bytes) return;

    const curAngle = params?.brushTip ? ((params.brushTip as any).angleRadians ?? 0) : 0;

    if (item.file_name.endsWith(".gbr")) {
      const parsed = parseGbr(bytes);
      if (parsed) {
        onUpdateEngineParams({
          brushTip: {
            tipType: "predefined",
            imageData: parsed.mask,
            width: parsed.width,
            height: parsed.height,
          },
        });
        const maskBytes = new Uint8Array(parsed.mask.buffer, parsed.mask.byteOffset, parsed.mask.byteLength);
        await globalRustBrushBridge.registerTipMask(item.id, parsed.name, parsed.width, parsed.height, maskBytes, true);
        globalWasmBrushBridge.registerTipMask(item.id, parsed.name, parsed.width, parsed.height, maskBytes, true);
        await globalRustBrushBridge.setActiveTip(item.id, 1.0, curAngle);
        globalWasmBrushBridge.setBrushPredefinedTip(item.id, 1.0, curAngle);
      }
    } else {
      const decoded = await decodeImageToRgba(bytes);
      if (decoded) {
        const alphaMask = new Uint8ClampedArray(decoded.width * decoded.height);
        for (let i = 0; i < decoded.width * decoded.height; i++) {
          alphaMask[i] = decoded.rgba[i * 4 + 3];
        }
        onUpdateEngineParams({
          brushTip: {
            tipType: "predefined",
            imageData: alphaMask,
            width: decoded.width,
            height: decoded.height,
          },
        });
        const alphaBytes = new Uint8Array(alphaMask.buffer, alphaMask.byteOffset, alphaMask.byteLength);
        await globalRustBrushBridge.registerTipMask(item.id, item.name, decoded.width, decoded.height, alphaBytes, true);
        globalWasmBrushBridge.registerTipMask(item.id, item.name, decoded.width, decoded.height, alphaBytes, true);
        await globalRustBrushBridge.setActiveTip(item.id, 1.0, curAngle);
        globalWasmBrushBridge.setBrushPredefinedTip(item.id, 1.0, curAngle);
      }
    }
  };

  const handleSelectPattern = async (item: ResourceItemDto | null) => {
    if (!item) {
      onUpdateEngineParams({ grainTexture: null });
      return;
    }

    let texConfig: BrushTextureConfig | null = null;
    const currentScale = params?.grainTexture?.scale ?? 1.0;
    const currentMode = params?.grainTexture?.mode ?? "multiply";
    const currentStrength = params?.grainTexture?.strength ?? 1.0;
    const currentByPressure = params?.grainTexture?.byPressure ?? false;

    if (item.path.startsWith("__builtin__:")) {
      const bp = BUILTIN_PROCEDURAL_TEXTURES.find((b) => b.patternId === item.id);
      if (bp) {
        const bBytes = bp.bytes instanceof Uint8Array ? bp.bytes : new Uint8Array(bp.bytes);
        texConfig = {
          patternId: bp.patternId,
          name: bp.name,
          width: bp.width,
          height: bp.height,
          bytes: bBytes,
          scale: currentScale,
          mode: (currentMode as TextureBlendMode) || bp.mode,
          strength: currentStrength,
          byPressure: currentByPressure,
        };
      }
    } else {
      const bytes = await globalRustBrushBridge.readResourceFile(item.path);
      if (bytes) {
        const decoded = await decodeImageToRgba(bytes);
        if (decoded) {
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
            scale: currentScale,
            mode: (currentMode as TextureBlendMode) || "multiply",
            strength: currentStrength,
            byPressure: currentByPressure,
          };
        }
      }
    }

    if (texConfig) {
      onUpdateEngineParams({ grainTexture: texConfig });
    }
  };

  // 1. Stroke Path Inspector
  if (category === "stroke_path") {
    const spacingPercent = Math.round((params?.spacingFraction ?? 0.08) * 100);
    const scatterAmp = params?.scatterAmplitude ?? 0;

    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Stroke properties</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Control dab stamp pacing and stroke jitter</p>
        </div>

        {/* Spacing */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Spacing</span>
            <span className="font-mono text-zinc-500">{spacingPercent}%</span>
          </div>
          <input
            type="range"
            min={2}
            max={100}
            value={spacingPercent}
            onChange={(e) => onUpdateEngineParams({ spacingFraction: Number(e.target.value) / 100 })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Spacing Jitter */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Spacing Jitter</span>
            <span className="font-mono text-zinc-500">{scatterAmp > 0 ? `${Math.round(scatterAmp * 100)}%` : "None"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.02}
            value={scatterAmp}
            onChange={(e) => onUpdateEngineParams({ scatterAmplitude: Number(e.target.value) })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Jitter Lateral (Scatter) */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Jitter Lateral</span>
            <span className="font-mono text-zinc-500">{scatterAmp > 0 ? `${Math.round(scatterAmp * 50)}px` : "None"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.02}
            value={scatterAmp}
            onChange={(e) => onUpdateEngineParams({ scatterAmplitude: Number(e.target.value) })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 2. Stabilization Inspector
  if (category === "stabilization") {
    const pullString: PullStringConfig =
      draftSmoothing.pullString ?? DEFAULT_PULL_STRING_CONFIG;
    const movingAverage: MovingAverageConfig =
      draftSmoothing.movingAverage ?? DEFAULT_MOVING_AVERAGE_CONFIG;

    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Stabilization</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Smooth handwriting and eliminate hand tremors</p>
        </div>

        {/* Pull String (Streamline Leash) */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Streamline (Pull String Leash)</span>
            <input
              type="checkbox"
              checked={pullString.enabled}
              onChange={(e) => onUpdateSmoothing({ pullString: { ...pullString, enabled: e.target.checked } })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          {pullString.enabled && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Leash Length</span>
                  <span className="font-mono text-zinc-500">{pullString.maxStringLength}px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={pullString.maxStringLength}
                  onChange={(e) => onUpdateSmoothing({ pullString: { ...pullString, maxStringLength: Number(e.target.value) } })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Catch-Up Responsiveness</span>
                  <span className="font-mono text-zinc-500">{Math.round(pullString.catchUpSpeed * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={pullString.catchUpSpeed}
                  onChange={(e) => onUpdateSmoothing({ pullString: { ...pullString, catchUpSpeed: Number(e.target.value) } })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Moving Average */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Moving Average (Line Art Smoothing)</span>
            <input
              type="checkbox"
              checked={movingAverage.enabled}
              onChange={(e) => onUpdateSmoothing({ movingAverage: { ...movingAverage, enabled: e.target.checked } })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          {movingAverage.enabled && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">Smoothing Window</span>
                  <span className="font-mono text-zinc-500">{movingAverage.windowSize} samples</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  value={movingAverage.windowSize}
                  onChange={(e) => onUpdateSmoothing({ movingAverage: { ...movingAverage, windowSize: Number(e.target.value) } })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Pressure Smoothing */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pressure Smoothing</span>
            <span className="font-mono text-zinc-500">{Math.round((pullString.pressureSmoothing ?? 0.35) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.02}
            value={pullString.pressureSmoothing ?? 0.35}
            onChange={(e) => onUpdateSmoothing({ pullString: { ...pullString, pressureSmoothing: Number(e.target.value) } })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 3. Taper Inspector
  if (category === "taper") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Taper</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Naturally taper stroke start and end tails</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pressure Taper</span>
            <span className="font-mono text-zinc-500">{params?.sizeDynamics?.isEnabled ? "Active" : "None"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Touch Taper</span>
            <span className="font-mono text-zinc-500">25%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={25}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 4. Shape Inspector
  if (category === "shape") {
    const softness = params?.softness ?? 0.45;
    const isPredefined = params?.brushTip?.tipType === "predefined";
    const currentAngle = params?.brushTip ? ((params.brushTip as any).angleRadians ?? 0) : 0;
    const currentAspectRatio = params?.brushTip?.tipType === "generated" ? (params.brushTip.aspectRatio ?? 1.0) : 1.0;
    const scatterAmp = params?.scatterAmplitude ?? 0;

    const handleAngleChange = (newAngleRad: number) => {
      if (params?.brushTip?.tipType === "generated") {
        onUpdateEngineParams({
          brushTip: {
            ...params.brushTip,
            angleRadians: newAngleRad,
          },
        });
        globalWasmBrushBridge.setBrushAutoTip(params.brushTip.aspectRatio ?? 1.0, newAngleRad);
      } else if (params?.brushTip?.tipType === "predefined") {
        onUpdateEngineParams({
          brushTip: {
            ...params.brushTip,
            angleRadians: newAngleRad,
          } as any,
        });
      }
    };

    const handleAspectRatioChange = (newRatio: number) => {
      if (params?.brushTip?.tipType === "generated") {
        onUpdateEngineParams({
          brushTip: {
            ...params.brushTip,
            aspectRatio: newRatio,
          },
        });
        globalWasmBrushBridge.setBrushAutoTip(newRatio, currentAngle);
      }
    };

    return (
      <div className="flex flex-col gap-6 p-6">
        {/* Shape Source Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Shape Source</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Select procedural tip or raster mask stamp</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refreshResources}
              title="Refresh resources"
              className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => globalRustBrushBridge.openResourceFolder("brushes")}
              title="Open brushes directory"
              className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline px-1 py-0.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open Folder</span>
            </button>
          </div>
        </div>

        {/* Tip selection gallery */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSelectTip(null)}
            className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-3 ${
              !isPredefined
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-1 ring-blue-500"
                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
              <div
                className="bg-zinc-900 dark:bg-zinc-100 rounded-full"
                style={{
                  width: "18px",
                  height: `${Math.round(18 * currentAspectRatio)}px`,
                  transform: `rotate(${Math.round((currentAngle * 180) / Math.PI)}deg)`,
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">Auto Shape</div>
              <div className="text-[10px] text-zinc-500">Continuous analytical tip</div>
            </div>
          </button>

          {brushResources.map((res) => (
            <button
              key={res.id}
              type="button"
              onClick={() => handleSelectTip(res)}
              className="p-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
            >
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                {tipThumbnails[res.id] ? (
                  <img src={tipThumbnails[res.id]} alt={res.name} className="w-8 h-8 object-contain" />
                ) : (
                  <Paintbrush className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">{res.name}</div>
                <div className="text-[10px] text-zinc-500 truncate">{res.file_name}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Touch & Rotation Properties */}
        <div className="flex flex-col gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            Touch properties
          </h4>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Rotation</span>
              <span className="font-mono text-zinc-500">{Math.round((currentAngle * 180) / Math.PI)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round((currentAngle * 180) / Math.PI)}
              onChange={(e) => handleAngleChange((Number(e.target.value) * Math.PI) / 180)}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Shape Properties (Matching Procreate Image 3) */}
        <div className="flex flex-col gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            Shape properties
          </h4>

          {/* Scatter */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Scatter</span>
              <span className="font-mono text-zinc-500">{scatterAmp > 0 ? `${Math.round(scatterAmp * 100)}%` : "None"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.0}
              step={0.02}
              value={scatterAmp}
              onChange={(e) => onUpdateEngineParams({ scatterAmplitude: Number(e.target.value) })}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Count */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Count</span>
              <span className="font-mono text-zinc-500">1</span>
            </div>
            <input
              type="range"
              min={1}
              max={16}
              defaultValue={1}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Count Jitter */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Count jitter</span>
              <span className="font-mono text-zinc-500">None</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.0}
              step={0.02}
              defaultValue={0}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Roundness / Aspect Ratio (Analytical tips) */}
          {!isPredefined && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Roundness / Aspect Ratio</span>
                <span className="font-mono text-zinc-500">{Math.round(currentAspectRatio * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1.0}
                step={0.01}
                value={currentAspectRatio}
                onChange={(e) => handleAspectRatioChange(Number(e.target.value))}
                className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>
          )}

          {/* Softness / Radial Fade */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Softness / Radial Fade</span>
              <span className="font-mono text-zinc-500">{Math.round(softness * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.0}
              step={0.02}
              value={softness}
              onChange={(e) => onUpdateEngineParams({ softness: Number(e.target.value) })}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Toggles: Randomized, Flip X, Flip Y */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Randomized</span>
              <input
                type="checkbox"
                defaultChecked={false}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Flip X</span>
              <input
                type="checkbox"
                defaultChecked={false}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Flip Y</span>
              <input
                type="checkbox"
                defaultChecked={false}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Circular Rotation Dial (Matching Image 3 Bottom Dial) */}
        <div className="flex flex-col items-center gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tip Angle Dial</span>
          <ShapeRotationDial
            valueRadians={currentAngle}
            onChange={handleAngleChange}
            size={120}
          />
        </div>
      </div>
    );
  }

  // 5. Grain Inspector
  if (category === "grain") {
    const tex = params?.grainTexture;
    const hasTexture = Boolean(tex);

    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Grain Source</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Modulate stroke tooth with seamless paper textures</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => globalRustBrushBridge.openResourceFolder("patterns")}
              title="Open patterns directory"
              className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline px-1 py-0.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Open Folder</span>
            </button>
            <input
              type="checkbox"
              checked={hasTexture}
              onChange={(e) => {
                if (!e.target.checked) {
                  onUpdateEngineParams({ grainTexture: null });
                } else if (patternResources.length > 0) {
                  handleSelectPattern(patternResources[0]);
                }
              }}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </div>
        </div>

        {hasTexture && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {patternResources.map((pat) => {
                const isSelected = tex?.patternId === pat.id;
                return (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => handleSelectPattern(pat)}
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-1 ring-blue-500"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0">
                      {patternThumbnails[pat.id] ? (
                        <img src={patternThumbnails[pat.id]} alt={pat.name} className="w-full h-full object-cover" />
                      ) : (
                        <Waves className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{pat.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{pat.file_name}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pattern Scale */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Pattern Scale</span>
                <span className="font-mono text-zinc-500">{(tex?.scale ?? 1.0).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={4.0}
                step={0.1}
                value={tex?.scale ?? 1.0}
                onChange={(e) => {
                  if (tex) onUpdateEngineParams({ grainTexture: { ...tex, scale: Number(e.target.value) } });
                }}
                className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* Modulation Strength */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Modulation Strength</span>
                <span className="font-mono text-zinc-500">{Math.round((tex?.strength ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.0}
                step={0.02}
                value={tex?.strength ?? 1.0}
                onChange={(e) => {
                  if (tex) onUpdateEngineParams({ grainTexture: { ...tex, strength: Number(e.target.value) } });
                }}
                className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 6. Rendering Inspector
  if (category === "rendering") {
    const flowPercent = Math.round((params?.baseFlow ?? 1.0) * 100);
    const opacityPercent = Math.round((params?.baseOpacity ?? 1.0) * 100);

    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Rendering & Blending</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Control paint glaze, flow accumulation, and blend mode</p>
        </div>

        {/* Base Flow */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Flow Accumulation</span>
            <span className="font-mono text-zinc-500">{flowPercent}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            value={flowPercent}
            onChange={(e) => onUpdateEngineParams({ baseFlow: Number(e.target.value) / 100 })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Master Opacity */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Master Opacity</span>
            <span className="font-mono text-zinc-500">{opacityPercent}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={opacityPercent}
            onChange={(e) => onUpdateEngineParams({ baseOpacity: Number(e.target.value) / 100 })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 7. Wet Mix Inspector
  if (category === "wet_mix") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Wet Mix</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Natural media color dilution and blending</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Dilution</span>
            <span className="font-mono text-zinc-500">None</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Charge</span>
            <span className="font-mono text-zinc-500">100%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={100}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pull</span>
            <span className="font-mono text-zinc-500">50%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 8. Color Dynamics Inspector
  if (category === "color_dynamics") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Color dynamics</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Per-dab hue, saturation, and luminance variation</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Hue Jitter</span>
            <span className="font-mono text-zinc-500">None</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Saturation Jitter</span>
            <span className="font-mono text-zinc-500">None</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // 9. Dynamics Inspector (Embedding BrushDynamicsPanel with CurveEditor)
  if (category === "dynamics") {
    const multi = params?.multiDynamics;
    const initialDynState: any = {};
    if (multi) {
      for (const [pKey, pVal] of Object.entries(multi)) {
        if (!pVal) continue;
        const sensorsMap: any = {};
        if (pVal.sensors) {
          for (const [sKey, sVal] of Object.entries(pVal.sensors)) {
            if (sVal) {
              sensorsMap[sKey] = {
                enabled: sVal.isEnabled,
                minOutput: sVal.minOutput ?? 0.0,
                maxOutput: sVal.maxOutput ?? 1.0,
                curvePoints:
                  sVal.curvePoints && sVal.curvePoints.length >= 2
                    ? sVal.curvePoints.map((pt) => ({ x: pt.inputValue, y: pt.outputValue }))
                    : createLinearCurve(),
              };
            }
          }
        }
        initialDynState[pKey] = {
          enabled: true,
          strength: 1.0,
          selectedSensor: Object.keys(sensorsMap)[0] ?? "pressure",
          calculationMode: pVal.calculationMode ?? "multiply",
          sensors: sensorsMap,
        };
      }
    }

    return (
      <div className="flex flex-col gap-4 p-6 w-full max-w-full overflow-hidden">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Brush Dynamics Studio</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Sensor transfer curves and speed dynamics</p>
        </div>

        <div className="w-full max-w-full overflow-hidden">
          <BrushDynamicsPanel
            initialState={Object.keys(initialDynState).length > 0 ? initialDynState : undefined}
            onChange={(state) => {
              // Convert multiDynamics state into engine config
              const multiMap: Record<string, any> = {};
              for (const [pId, pVal] of Object.entries(state)) {
                const sensorsMap: Record<string, any> = {};
                for (const [sId, sVal] of Object.entries(pVal.sensors)) {
                  sensorsMap[sId] = {
                    isEnabled: sVal.enabled,
                    minOutput: sVal.minOutput,
                    maxOutput: sVal.maxOutput,
                    curvePoints: sVal.curvePoints.map((p) => ({ inputValue: p.x, outputValue: p.y })),
                  };
                }
                multiMap[pId] = {
                  calculationMode: pVal.calculationMode,
                  sensors: sensorsMap,
                };
              }
              onUpdateEngineParams({ multiDynamics: multiMap });
            }}
          />
        </div>
      </div>
    );
  }

  // 10. Stylus Settings (Tilt Dynamics & Pressure Sensitivity)
  if (category === "apple_pencil") {
    const baseFlow = Math.round((params?.baseFlow ?? 1.0) * 100);
    const multi = params?.multiDynamics ?? {};
    const tiltSizeSensor = multi.size?.sensors?.tilt_elevation;
    const tiltOpacitySensor = multi.opacity?.sensors?.tilt_elevation;
    const tiltSoftnessSensor = multi.softness?.sensors?.tilt_elevation;

    const tiltSizeVal = tiltSizeSensor?.isEnabled
      ? Math.round(((tiltSizeSensor.maxOutput ?? 2.0) - 1.0) * 50)
      : 0;
    const tiltOpacityVal = tiltOpacitySensor?.isEnabled
      ? Math.round((tiltOpacitySensor.maxOutput ?? 1.0) * 100)
      : 0;
    const tiltBleedVal = tiltSoftnessSensor?.isEnabled
      ? Math.round((tiltSoftnessSensor.maxOutput ?? 1.0) * 100)
      : 0;

    const updateTiltMapping = (paramTarget: "size" | "opacity" | "softness", valueNormalized: number, thresholdDegrees = tiltThresholdDeg) => {
      const updatedMulti: Record<string, any> = { ...multi };
      const currentParamConfig = updatedMulti[paramTarget] ?? {
        calculationMode: "multiply",
        sensors: {},
      };

      const thresholdNorm = thresholdDegrees / 90.0;
      const tiltCurve = [
        { inputValue: 0.0, outputValue: 1.0 },
        { inputValue: thresholdNorm, outputValue: 0.0 },
        { inputValue: 1.0, outputValue: 0.0 },
      ];

      if (valueNormalized > 0.01) {
        currentParamConfig.sensors = {
          ...currentParamConfig.sensors,
          tilt_elevation: {
            isEnabled: true,
            minOutput: paramTarget === "size" ? 1.0 : 0.05,
            maxOutput: paramTarget === "size" ? 1.0 + valueNormalized * 2.0 : valueNormalized,
            curvePoints: tiltCurve,
          },
        };
      } else if (currentParamConfig.sensors) {
        const { tilt_elevation, ...restSensors } = currentParamConfig.sensors;
        currentParamConfig.sensors = restSensors;
      }

      updatedMulti[paramTarget] = currentParamConfig;
      onUpdateEngineParams({ multiDynamics: updatedMulti });
    };

    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Stylus Settings</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Stylus tilt dynamics, hardware sensitivity, and pressure response curve</p>
        </div>

        {/* Flow & Bleed (Matching Image 1 top) */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Flow</span>
              <span className="font-mono text-zinc-500">{baseFlow}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={baseFlow}
              onChange={(e) => onUpdateEngineParams({ baseFlow: Number(e.target.value) / 100 })}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Bleed</span>
              <span className="font-mono text-zinc-500">None</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={0}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Tilt Arc & Properties (Matching Image 1) */}
        <div className="flex flex-col gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            Tilt
          </h4>

          {/* Interactive Quarter-Circle Arc Widget */}
          <div className="w-full flex justify-center py-2">
            <StylusTiltArcWidget
              valueDegrees={tiltThresholdDeg}
              onChange={(deg) => {
                setTiltThresholdDeg(deg);
                if (tiltSizeVal > 0) updateTiltMapping("size", tiltSizeVal / 100, deg);
                if (tiltOpacityVal > 0) updateTiltMapping("opacity", tiltOpacityVal / 100, deg);
              }}
              size={180}
            />
          </div>

          {/* Tilt Opacity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Opacity</span>
              <span className="font-mono text-zinc-500">{tiltOpacityVal > 0 ? `${tiltOpacityVal}%` : "None"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={tiltOpacityVal}
              onChange={(e) => updateTiltMapping("opacity", Number(e.target.value) / 100)}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tilt Gradation */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Gradation</span>
              <span className="font-mono text-zinc-500">None</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={0}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tilt Bleed */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Bleed</span>
              <span className="font-mono text-zinc-500">{tiltBleedVal > 0 ? `${tiltBleedVal}%` : "None"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={tiltBleedVal}
              onChange={(e) => updateTiltMapping("softness", Number(e.target.value) / 100)}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tilt Size */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Size</span>
              <span className="font-mono text-zinc-500">{tiltSizeVal > 0 ? `${tiltSizeVal}%` : "None"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={tiltSizeVal}
              onChange={(e) => updateTiltMapping("size", Number(e.target.value) / 100)}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Size Compression Toggle */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-zinc-700 dark:text-zinc-300 font-medium">Size compression</span>
            <input
              type="checkbox"
              defaultChecked={true}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Global Pressure Transfer Curve */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Global Pressure Transfer Curve</span>
            <button
              type="button"
              onClick={() => onUpdatePressureCurve(createLinearCurve())}
              title="Reset curve to linear 1:1"
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="w-full max-w-md pt-1">
            <CurveEditor
              value={draftPressureCurve}
              onChange={onUpdatePressureCurve}
              inputLabel="Stylus Pressure"
              outputLabel="Engine Response"
              showPresets={true}
            />
          </div>
        </div>
      </div>
    );
  }

  // 11. Properties Inspector
  if (category === "properties") {
    const size = Math.round(params?.baseSizePx ?? 32);

    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Brush Properties</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Sizing limits and preview presentation</p>
        </div>

        {/* Brush Size */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Base Brush Size</span>
            <span className="font-mono text-zinc-500">{size}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={300}
            value={size}
            onChange={(e) => onUpdateEngineParams({ baseSizePx: Number(e.target.value) })}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Preview Thumbnail */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-white/5 flex flex-col gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Brush Stroke Preview</span>
          <div className="h-10 flex items-center">
            <BrushStrokePreview preset={draftPreset} width={240} height={36} />
          </div>
        </div>
      </div>
    );
  }

  // 12. About this brush
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">About this brush</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Metadata, preset naming, and reset controls</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Brush Name</label>
        <input
          type="text"
          value={draftPreset.displayName}
          onChange={(e) => onUpdateMetadata({ displayName: e.target.value })}
          className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Brush preset name"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Tags</label>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {draftPreset.tags.join(" • ")}
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={onRevertToInitial}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Brush to Baseline</span>
        </button>
      </div>
    </div>
  );
};
