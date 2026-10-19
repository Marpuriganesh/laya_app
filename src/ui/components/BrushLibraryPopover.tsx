import { useState, useRef, useEffect, useMemo, type FC } from "react";
import {
  Sparkles,
  FolderDown,
  Brush,
  Check,
  PenTool,
  Feather,
  Wind,
  AlertCircle,
  CheckCircle2,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import type { BrushPreset } from "@/types/brush";

interface BrushLibraryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset?: (presetName: string) => void;
  onOpenSettings?: () => void;
}

interface BrushPresetItemProps {
  preset: BrushPreset;
  isSelected: boolean;
  onSelect: (preset: BrushPreset) => void;
  onOpenSettings?: (preset: BrushPreset) => void;
}

const BrushPresetItem: FC<BrushPresetItemProps> = ({
  preset,
  isSelected,
  onSelect,
  onOpenSettings,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!preset.thumbnailPngData) {
      setThumbUrl(null);
      return;
    }
    const blob = new Blob([preset.thumbnailPngData as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    setThumbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [preset.thumbnailPngData]);

  const renderIcon = () => {
    if (thumbUrl) {
      return (
        <img
          src={thumbUrl}
          alt={preset.displayName}
          className="w-8 h-8 rounded-md object-contain bg-zinc-950 border border-zinc-800 shrink-0"
        />
      );
    }

    if (preset.tags.includes("Sketching")) {
      return (
        <div className="w-8 h-8 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Feather className="w-4 h-4 text-amber-400" />
        </div>
      );
    }

    if (preset.tags.includes("Airbrush")) {
      return (
        <div className="w-8 h-8 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
          <Wind className="w-4 h-4 text-sky-400" />
        </div>
      );
    }

    if (preset.tags.includes("Inking")) {
      return (
        <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <PenTool className="w-4 h-4 text-emerald-400" />
        </div>
      );
    }

    return (
      <div className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0">
        <Brush className="w-4 h-4 text-zinc-400" />
      </div>
    );
  };

  const getSubtext = () => {
    const params = preset.engineParameters;
    if ("baseSizePx" in params) {
      return `${params.baseSizePx}px • ${preset.tags[0] ?? "Custom"}`;
    }
    return preset.tags[0] ?? "Preset";
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      className={`w-full p-2 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
        isSelected
          ? "bg-zinc-800 border-zinc-600 text-zinc-100 shadow-sm"
          : "bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/40 hover:border-zinc-700 text-zinc-300"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {renderIcon()}
        <div className="flex flex-col gap-0.5 truncate">
          <span className="text-xs font-medium truncate">{preset.displayName}</span>
          <span className="text-[11px] text-zinc-400 truncate">{getSubtext()}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700/60 text-zinc-400">
          {preset.engineType === "pixelbrush" ? "Pixel" : preset.engineType}
        </span>
        {isSelected && onOpenSettings && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings(preset);
            }}
            title="Edit Brush Settings"
            className="p-1 rounded hover:bg-zinc-700/80 text-zinc-300 hover:text-white transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
        {isSelected && <Check className="w-3.5 h-3.5 text-zinc-200" />}
      </div>
    </button>
  );
};

export const BrushLibraryPopover: FC<BrushLibraryPopoverProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  onOpenSettings,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [loadedPresets, setLoadedPresets] = useState<readonly BrushPreset[]>(() =>
    globalDrawingEngine.getLoadedPresets()
  );
  const [selectedId, setSelectedId] = useState<string>(() => {
    const active = globalDrawingEngine.getActiveBrush();
    return active ? active.presetId : "default-studio-pen";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when popover opens
  useEffect(() => {
    if (isOpen) {
      setLoadedPresets([...globalDrawingEngine.getLoadedPresets()]);
      const active = globalDrawingEngine.getActiveBrush();
      if (active) {
        setSelectedId(active.presetId);
      }
    }
  }, [isOpen]);

  // Auto-dismiss success notification after 5 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Dynamically collect custom bundle / pack tags
  const categories = useMemo(() => {
    const coreCategories = ["All", "Inking", "Sketching", "Airbrush"];
    const customBundleTags = new Set<string>();

    for (const preset of loadedPresets) {
      for (const tag of preset.tags) {
        const lower = tag.toLowerCase();
        if (
          !coreCategories.some((c) => c.toLowerCase() === lower) &&
          lower !== "default" &&
          lower !== "basic" &&
          lower !== "krita" &&
          lower !== "imported"
        ) {
          customBundleTags.add(tag);
        }
      }
    }

    return [...coreCategories, ...Array.from(customBundleTags), "Imported"];
  }, [loadedPresets]);

  const filteredPresets = loadedPresets.filter((preset) => {
    if (activeCategory === "All") return true;
    if (activeCategory === "Imported") {
      return (
        preset.tags.some((tag) => tag.toLowerCase() === "imported" || tag.toLowerCase() === "krita") ||
        preset.thumbnailPngData !== null
      );
    }
    return preset.tags.some((tag) => tag.toLowerCase() === activeCategory.toLowerCase());
  });

  const handleSelectPreset = (preset: BrushPreset) => {
    globalDrawingEngine.setActiveBrush(preset);
    setSelectedId(preset.presetId);
    onSelectPreset?.(preset.displayName);
  };

  const handleImportKritaClick = () => {
    fileInputRef.current?.click();
  };

  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const processImportFile = async (file: File) => {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsImporting(true);

      const arrayBuffer = await file.arrayBuffer();
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".bundle") || lowerName.endsWith(".zip")) {
        // Unpack complete Krita Resource Bundle ZIP archive
        const importedPresets = await globalDrawingEngine.loadKritaBundle(arrayBuffer, file.name);
        const updatedPresets = [...globalDrawingEngine.getLoadedPresets()];
        setLoadedPresets(updatedPresets);

        if (importedPresets.length > 0) {
          setSelectedId(importedPresets[0].presetId);
          onSelectPreset?.(importedPresets[0].displayName);

          // Find the bundle tag to automatically focus the new tab
          const bundleTag = importedPresets[0].tags.find(
            (t) => t.toLowerCase() !== "imported" && t.toLowerCase() !== "krita"
          );
          if (bundleTag) {
            setActiveCategory(bundleTag);
          } else {
            setActiveCategory("Imported");
          }

          setSuccessMessage(`Imported ${importedPresets.length} brushes from "${file.name}"!`);
        } else {
          setErrorMessage(`No .kpp brush presets found inside "${file.name}".`);
        }
      } else {
        // Deserialize single .kpp brush preset
        const importedPreset = await globalDrawingEngine.loadKritaPreset(arrayBuffer);
        const updatedPresets = [...globalDrawingEngine.getLoadedPresets()];
        setLoadedPresets(updatedPresets);
        setSelectedId(importedPreset.presetId);
        setActiveCategory("Imported");
        onSelectPreset?.(importedPreset.displayName);
        setSuccessMessage(`Imported "${importedPreset.displayName}"!`);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to load Krita file. Ensure it is a valid .bundle or .kpp file."
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImportFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await processImportFile(files[i]);
    }
  };

  return (
    <FloatingWindowPanel
      title="Brush Library"
      icon={<Brush className="w-4 h-4 text-zinc-400" />}
      isOpen={isOpen}
      onClose={onClose}
      width={370}
      height={520}
      initialOffset={{ x: 0, y: 0 }}
      anchorClassName="fixed right-20 top-16"
      zIndex={40}
      allowPopout={true}
      headerActions={
        onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Open Brush Settings Studio"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        ) : undefined
      }
    >
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col h-full bg-zinc-900 select-none relative transition-colors ${
          isDraggingOver ? "ring-2 ring-sky-500 bg-zinc-900/90" : ""
        }`}
      >
        {/* Drag Overlay Feedback */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-sky-950/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-sky-400 rounded-lg pointer-events-none">
            <FolderDown className="w-10 h-10 text-sky-400 mb-2 animate-bounce" />
            <p className="text-sm font-medium text-sky-100">Drop Krita .bundle or .kpp</p>
            <p className="text-xs text-sky-300/80 mt-1">Instant import into Brush Library</p>
          </div>
        )}

        {/* Hidden File Input for .bundle and .kpp (Universal iOS Safari accept) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".bundle,.kpp,.zip,application/zip,application/octet-stream,application/x-krita-bundle,*/*"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Upload Krita Brush Preset or Bundle"
        />

        {/* Category & Bundle Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800/60 overflow-x-auto bg-zinc-950/40 scrollbar-none">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                activeCategory === category
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Success Notification Banner */}
        {successMessage && (
          <div className="mx-3 mt-2 p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="p-0.5 rounded hover:bg-emerald-900/60 text-emerald-300"
              aria-label="Dismiss message"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="mx-3 mt-2 p-2 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-0.5 rounded hover:bg-red-900/60 text-red-300"
              aria-label="Dismiss error"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Presets List */}
        <div className="p-3 overflow-y-auto flex-1 space-y-1.5 max-h-[350px]">
          {filteredPresets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-500 text-xs space-y-2">
              <Brush className="w-8 h-8 text-zinc-600 stroke-1" />
              <p>No presets found in &ldquo;{activeCategory}&rdquo;</p>
              {activeCategory === "Imported" && (
                <button
                  type="button"
                  onClick={handleImportKritaClick}
                  className="mt-2 text-xs text-sky-400 hover:underline"
                >
                  Import a .bundle or .kpp file now
                </button>
              )}
            </div>
          ) : (
            filteredPresets.map((preset) => (
              <BrushPresetItem
                key={preset.presetId}
                preset={preset}
                isSelected={selectedId === preset.presetId}
                onSelect={handleSelectPreset}
                onOpenSettings={onOpenSettings ? () => onOpenSettings() : undefined}
              />
            ))
          )}
        </div>

        {/* Footer Import Buttons */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/50 flex items-center justify-between gap-2 mt-auto">
          <button
            type="button"
            onClick={handleImportKritaClick}
            disabled={isImporting}
            title="Import Krita .bundle packs or .kpp presets directly into engine"
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60 active:bg-zinc-800 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <FolderDown className="w-3.5 h-3.5 text-sky-400" />
            <span>{isImporting ? "Unpacking Bundle..." : "Import Krita (.bundle / .kpp)"}</span>
          </button>
          <button
            type="button"
            title="Import Adobe Photoshop .abr brush files (Coming in future update)"
            disabled={true}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800/40 text-zinc-600 text-xs font-medium cursor-not-allowed opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
            <span>Import ABR</span>
          </button>
        </div>
      </div>
    </FloatingWindowPanel>
  );
};
