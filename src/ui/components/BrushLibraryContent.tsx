/**
 * Brush Library Content
 * Displays categorized brush presets with real-time selection,
 * authentic brush tip mask/silhouette icons,
 * Procreate-style smooth S-curve stroke preview thumbnails that update with live dynamics,
 * gear icons to open and customize brush settings in the Brush Studio,
 * and support for importing Krita bundles and presets.
 */

import { useState, useRef, useEffect, type FC, type ChangeEvent } from "react";
import {
  Brush,
  Settings2,
  Upload,
  Check,
} from "lucide-react";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { BrushStrokePreview } from "@/ui/components/BrushStrokePreview";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { useTheme } from "@/ui/theme/ThemeProvider";
import type { BrushPreset, PredefinedBrushTip } from "@/types/brush";

export interface BrushLibraryContentProps {
  onOpenSettings?: (preset: BrushPreset) => void;
}

const CATEGORIES = ["All", "Inking", "Pencils", "Painting", "Airbrush", "Imported"] as const;

/**
 * Predefined Raster Brush Tip Silhouette Renderer.
 * Draws the true 8-bit alpha mask of the brush tip in an authentic thumbnail canvas.
 */
const PredefinedTipSilhouette: FC<{ tip: PredefinedBrushTip }> = ({ tip }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 22;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const isDark = resolvedTheme === "dark";
    const rgb = isDark ? 240 : 30;

    const tipW = tip.width;
    const tipH = tip.height;
    if (tipW <= 0 || tipH <= 0 || !tip.imageData) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = tipW;
    offscreen.height = tipH;
    const octx = offscreen.getContext("2d");
    if (!octx) return;

    const imgData = octx.createImageData(tipW, tipH);
    const len = tipW * tipH;
    const isRgba = tip.imageData.length === len * 4;

    for (let i = 0; i < len; i++) {
      const alpha = isRgba ? tip.imageData[i * 4 + 3] : tip.imageData[i];
      imgData.data[i * 4 + 0] = rgb;
      imgData.data[i * 4 + 1] = rgb;
      imgData.data[i * 4 + 2] = rgb;
      imgData.data[i * 4 + 3] = alpha;
    }
    octx.putImageData(imgData, 0, 0);

    const scale = Math.min((size - 2) / tipW, (size - 2) / tipH);
    const drawW = tipW * scale;
    const drawH = tipH * scale;
    const offsetX = (size - drawW) * 0.5;
    const offsetY = (size - drawH) * 0.5;

    ctx.drawImage(offscreen, offsetX, offsetY, drawW, drawH);
  }, [tip, resolvedTheme]);

  return <canvas ref={canvasRef} className="w-[22px] h-[22px] block shrink-0" />;
};

/**
 * Authentic Brush Tip Silhouette Icon component.
 * Displays the brush preset's actual tip mask, nib geometry, and grain structure.
 */
const BrushTipIcon: FC<{ preset: BrushPreset; thumbUrl: string | null }> = ({
  preset,
  thumbUrl,
}) => {
  const params = preset.engineParameters;

  // 1. If preset has a predefined raster tip mask, display authentic tip silhouette
  if (params && params.engineId === "pixelbrush" && params.brushTip && params.brushTip.tipType === "predefined") {
    return <PredefinedTipSilhouette tip={params.brushTip} />;
  }

  // 2. If imported preset has a custom thumbnail
  if (thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={preset.displayName}
        className="w-5 h-5 object-contain rounded shrink-0"
      />
    );
  }

  if (params && params.engineId === "pixelbrush") {
    const tip = params.brushTip;
    const softness = params.softness ?? 0.45;

    // Generated (analytical) brush tip: render exact silhouette geometry
    if (tip && tip.tipType === "generated") {
      const aspectRatio = tip.aspectRatio ?? 1.0;
      const angleDeg = ((tip.angleRadians ?? 0) * 180) / Math.PI;

      // Chisel / Calligraphy Elliptical Tip
      if (aspectRatio < 0.85) {
        return (
          <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
            <ellipse
              cx="11"
              cy="11"
              rx="8.5"
              ry={Math.max(2.5, 8.5 * aspectRatio)}
              transform={`rotate(${angleDeg} 11 11)`}
              className="fill-zinc-900 dark:fill-zinc-100"
            />
          </svg>
        );
      }

      // Soft Airbrush Radial Glow Tip
      if (softness >= 0.55) {
        return (
          <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
            <defs>
              <radialGradient id={`glow-${preset.presetId}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.45" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
              </radialGradient>
            </defs>
            <circle
              cx="11"
              cy="11"
              r="10"
              fill={`url(#glow-${preset.presetId})`}
              className="text-zinc-900 dark:text-zinc-100"
            />
          </svg>
        );
      }

      // Technical Pencil: Fine tip with subtle texture tooth ring
      if (preset.tags.some((t) => t.toLowerCase().includes("pencil"))) {
        return (
          <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
            <circle
              cx="11"
              cy="11"
              r="4.5"
              className="fill-zinc-900 dark:fill-zinc-100"
            />
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 2"
              className="text-zinc-400 dark:text-zinc-500"
            />
          </svg>
        );
      }

      // Painting / Oil / Watercolor: Textured flat bristle brush tip
      if (preset.tags.some((t) => t.toLowerCase().includes("paint") || t.toLowerCase().includes("bristle"))) {
        return (
          <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
            <path
              d="M4 14C4 9 7 5 11 5C15 5 18 9 18 14C18 16 16.5 17 11 17C5.5 17 4 16 4 14Z"
              className="fill-zinc-900 dark:fill-zinc-100"
            />
            <line x1="8" y1="9" x2="8" y2="15" stroke="currentColor" strokeWidth="1" className="text-zinc-400 dark:text-zinc-500" />
            <line x1="11" y1="8" x2="11" y2="15" stroke="currentColor" strokeWidth="1" className="text-zinc-400 dark:text-zinc-500" />
            <line x1="14" y1="9" x2="14" y2="15" stroke="currentColor" strokeWidth="1" className="text-zinc-400 dark:text-zinc-500" />
          </svg>
        );
      }

      // Studio Pen: Crisp solid inking nib
      return (
        <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
          <circle
            cx="11"
            cy="11"
            r="7.5"
            className="fill-zinc-900 dark:fill-zinc-100"
          />
        </svg>
      );
    }
  }

  // Fallback: standard tip dab
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" className="block shrink-0">
      <circle cx="11" cy="11" r="6.5" className="fill-zinc-800 dark:fill-zinc-200" />
    </svg>
  );
};

export const BrushLibraryContent: FC<BrushLibraryContentProps> = ({
  onOpenSettings,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const {
    activePresetId,
    setActivePresetId,
    setBrushSize,
    setBrushOpacity,
    brushSettingsRevision,
  } = useDocumentStore();

  useEffect(() => {
    return () => {
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current.clear();
    };
  }, []);

  const getPresetThumbnailUrl = (preset: BrushPreset): string | null => {
    if (!preset.thumbnailPngData || preset.thumbnailPngData.length === 0) return null;
    const existing = thumbnailUrlsRef.current.get(preset.presetId);
    if (existing) return existing;
    try {
      const blob = new Blob([preset.thumbnailPngData.buffer as ArrayBuffer], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      thumbnailUrlsRef.current.set(preset.presetId, url);
      return url;
    } catch {
      return null;
    }
  };

  // Read loaded presets from drawing engine
  const [presets, setPresets] = useState<readonly BrushPreset[]>(() =>
    globalDrawingEngine.getLoadedPresets?.() ?? []
  );

  const refreshPresets = () => {
    const loaded = globalDrawingEngine.getLoadedPresets?.() ?? [];
    setPresets([...loaded]);
    const active = globalDrawingEngine.getActiveBrush?.();
    if (active) {
      setActivePresetId(active.presetId);
    }
  };

  // Refresh whenever presets or brushSettingsRevision updates
  useEffect(() => {
    refreshPresets();
  }, [brushSettingsRevision]);

  const handleSelectBrush = (preset: BrushPreset) => {
    globalDrawingEngine.setActiveBrush(preset);
    setActivePresetId(preset.presetId);
    if (preset.engineParameters && preset.engineParameters.engineId === "pixelbrush") {
      const p = preset.engineParameters;
      if (typeof p.baseSizePx === "number") setBrushSize(p.baseSizePx);
      if (typeof p.baseOpacity === "number") setBrushOpacity(p.baseOpacity);
    }
  };

  const handleOpenStudioForBrush = (preset: BrushPreset) => {
    handleSelectBrush(preset);
    onOpenSettings?.(preset);
  };

  const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = await file.arrayBuffer();

      if (file.name.endsWith(".bundle")) {
        await globalDrawingEngine.loadKritaBundle(buffer, file.name);
      } else if (file.name.endsWith(".kpp")) {
        await globalDrawingEngine.loadKritaPreset(buffer);
      }
    }

    refreshPresets();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const filteredPresets = presets.filter((p) => {
    if (activeCategory === "All") return true;
    return p.tags.some((tag) => tag.toLowerCase() === activeCategory.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full w-full select-none overflow-hidden">
      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 p-2.5 border-b border-zinc-200 dark:border-white/5 overflow-x-auto no-scrollbar shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeCategory === cat
                ? "bg-blue-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Preset Cards List with Real Brush Tip Icons & Live S-Curve Stroke Thumbnails */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5">
        {filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-400 text-xs">
            <Brush className="w-8 h-8 mb-2 text-zinc-300 dark:text-zinc-600" />
            <span>No brushes found in {activeCategory}</span>
          </div>
        ) : (
          filteredPresets.map((preset) => {
            const isActive = preset.presetId === activePresetId;
            const thumbUrl = getPresetThumbnailUrl(preset);

            return (
              <div
                key={preset.presetId}
                onClick={() => handleSelectBrush(preset)}
                className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? "bg-blue-50/90 dark:bg-blue-950/40 border-blue-500/50 text-blue-950 dark:text-blue-100 shadow-sm"
                    : "bg-white/60 dark:bg-zinc-800/25 border-zinc-200/60 dark:border-white/5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {/* Left: Authentic Brush Tip Mask & Name */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 flex items-center justify-center shrink-0 border border-zinc-200/60 dark:border-white/5 overflow-hidden shadow-xs">
                    <BrushTipIcon preset={preset} thumbUrl={thumbUrl} />
                  </div>
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-xs font-semibold truncate leading-tight">
                      {preset.displayName}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                      {preset.tags.join(" • ")}
                    </span>
                  </div>
                </div>

                {/* Center / Procreate-Style Stroke Preview (Reflects live scattering & size dynamics) */}
                <div className="hidden sm:flex items-center justify-center px-2 shrink-0 opacity-85 group-hover:opacity-100 transition-opacity">
                  <BrushStrokePreview
                    preset={preset}
                    width={160}
                    height={34}
                  />
                </div>

                {/* Right: Active Checkmark & Gear Icon Button */}
                <div className="flex items-center gap-1.5 shrink-0 pl-1">
                  {isActive && (
                    <span
                      title="Active Brush"
                      className="p-1 rounded-md text-blue-600 dark:text-blue-400"
                    >
                      <Check className="w-4 h-4" />
                    </span>
                  )}

                  {/* Gear Icon: Opens Brush Studio for this specific brush */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenStudioForBrush(preset);
                    }}
                    title={`Configure ${preset.displayName} in Brush Studio`}
                    aria-label={`Configure ${preset.displayName}`}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-200/60 dark:hover:text-blue-400 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Bar: Import Action */}
      <div className="p-2.5 border-t border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".kpp,.bundle,.abr"
          multiple
          onChange={handleFileImport}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-98 transition-all cursor-pointer shadow-xs"
        >
          <Upload className="w-3.5 h-3.5 text-blue-500" />
          <span>Import Brushes (.kpp, .bundle, .abr)</span>
        </button>
      </div>
    </div>
  );
};
