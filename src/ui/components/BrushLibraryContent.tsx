/**
 * Brush Library Content
 * Displays categorized brush presets with real-time selection,
 * Procreate-style smooth S-curve stroke preview thumbnails,
 * gear icons to open and customize brush settings in the Brush Studio,
 * and support for importing Krita bundles and presets.
 */

import { useState, useRef, useEffect, type FC, type ChangeEvent } from "react";
import {
  Brush,
  PenLine,
  Pencil,
  Sparkles,
  Feather,
  Paintbrush,
  Settings2,
  Upload,
  Check,
} from "lucide-react";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { BrushStrokePreview } from "@/ui/components/BrushStrokePreview";
import type { BrushPreset } from "@/types/brush";

export interface BrushLibraryContentProps {
  onOpenSettings?: (preset: BrushPreset) => void;
  activeColor?: string;
}

const CATEGORIES = ["All", "Inking", "Pencils", "Painting", "Airbrush", "Imported"] as const;

export const BrushLibraryContent: FC<BrushLibraryContentProps> = ({
  onOpenSettings,
  activeColor,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read loaded presets from drawing engine
  const [presets, setPresets] = useState<readonly BrushPreset[]>(() =>
    globalDrawingEngine.getLoadedPresets?.() ?? []
  );
  const [activePresetId, setActivePresetId] = useState<string>(() =>
    globalDrawingEngine.getActiveBrush?.()?.presetId ?? "default-studio-pen"
  );

  const refreshPresets = () => {
    const loaded = globalDrawingEngine.getLoadedPresets?.() ?? [];
    setPresets([...loaded]);
    const active = globalDrawingEngine.getActiveBrush?.();
    if (active) {
      setActivePresetId(active.presetId);
    }
  };

  useEffect(() => {
    refreshPresets();
  }, []);

  const handleSelectBrush = (preset: BrushPreset) => {
    globalDrawingEngine.setActiveBrush(preset);
    setActivePresetId(preset.presetId);
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

  const getPresetIcon = (preset: BrushPreset) => {
    const lowerTags = preset.tags.map((t) => t.toLowerCase());
    if (lowerTags.includes("inking")) return <PenLine className="w-4 h-4 text-blue-500" />;
    if (lowerTags.includes("pencils")) return <Pencil className="w-4 h-4 text-amber-500" />;
    if (lowerTags.includes("airbrush")) return <Feather className="w-4 h-4 text-purple-500" />;
    if (lowerTags.includes("painting")) return <Paintbrush className="w-4 h-4 text-emerald-500" />;
    return <Sparkles className="w-4 h-4 text-zinc-400" />;
  };

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

      {/* Preset Cards List with Procreate-Style Stroke Thumbnails */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5">
        {filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-400 text-xs">
            <Brush className="w-8 h-8 mb-2 text-zinc-300 dark:text-zinc-600" />
            <span>No brushes found in {activeCategory}</span>
          </div>
        ) : (
          filteredPresets.map((preset) => {
            const isActive = preset.presetId === activePresetId;
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
                {/* Left: Icon & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 shrink-0">
                    {getPresetIcon(preset)}
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

                {/* Center / Procreate-Style Stroke Preview */}
                <div className="hidden sm:flex items-center justify-center px-2 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  <BrushStrokePreview
                    preset={preset}
                    width={160}
                    height={34}
                    activeColor={activeColor}
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
