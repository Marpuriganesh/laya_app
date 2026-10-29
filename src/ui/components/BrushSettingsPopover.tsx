import { useState, useCallback, type FC } from "react";
import {
  SlidersHorizontal,
  Check,
  ExternalLink,
  RotateCcw,
  CopyPlus,
} from "lucide-react";
import type { BrushPreset } from "@/types/brush";
import { useBrushStudioDraft } from "@/ui/hooks/useBrushStudioDraft";
import { BrushStudioCategories } from "@/ui/components/brush_studio/BrushStudioCategories";
import { BrushStudioInspector } from "@/ui/components/brush_studio/BrushStudioInspector";
import { BrushStudioDrawingPad } from "@/ui/components/brush_studio/BrushStudioDrawingPad";
import { useWindowKeyShortcuts } from "@/ui/hooks/useWindowKeyShortcuts";

export interface BrushStudioContentProps {
  sourcePreset?: BrushPreset | null;
  onClose?: () => void;
  onDetach?: () => void;
  isDetached?: boolean;
}

/**
 * 3-Column Procreate-style Brush Studio content.
 * Can be rendered inside a full-window modal or a standalone detached window.
 */
export const BrushStudioContent: FC<BrushStudioContentProps> = ({
  sourcePreset,
  onClose,
  onDetach,
  isDetached = false,
}) => {
  const {
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
  } = useBrushStudioDraft(sourcePreset);

  const [isSaved, setIsSaved] = useState(false);

  const handleDone = useCallback(() => {
    commitToEngine();
    setIsSaved(true);
    setTimeout(() => {
      onClose?.();
    }, 150);
  }, [commitToEngine, onClose]);

  const handleSaveAsNew = useCallback(() => {
    const defaultName = `${draftPreset.displayName} Copy`;
    const name =
      typeof window !== "undefined"
        ? window.prompt("Save new brush preset as:", defaultName)
        : defaultName;
    if (name && name.trim()) {
      saveAsNewPreset(name.trim());
      onClose?.();
    }
  }, [draftPreset.displayName, saveAsNewPreset, onClose]);

  return (
    <div className="flex flex-col h-full w-full select-none overflow-hidden bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      {/* Action Toolbar (when detached or header actions) */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-white/5 bg-zinc-50/80 dark:bg-zinc-800/50 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {draftPreset.displayName}
            </span>
            {isDirty && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                * Modified
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-2">
          {onDetach && !isDetached && (
            <button
              type="button"
              onClick={onDetach}
              title="Detach into standalone window"
              aria-label="Detach Brush Studio into standalone window"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={revertToInitial}
            disabled={!isDirty}
            title="Reset tweaks to baseline"
            aria-label="Reset tweaks to baseline"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAsNew}
            title="Save as a new preset copy"
            aria-label="Save as a new preset copy"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer transition-all"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save New...</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Discard tweaks and close"
              aria-label="Cancel and close Brush Studio"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleDone}
            title="Save changes to active preset"
            aria-label="Save changes to active preset"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer ${
              isSaved
                ? "bg-emerald-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-blue-500/25"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaved ? "Saved!" : "Done"}</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Rail (Categories) */}
        <BrushStudioCategories
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          isDirty={isDirty}
        />

        {/* Middle Settings Inspector */}
        <div className="w-96 shrink-0 border-r border-zinc-200 dark:border-white/5 overflow-y-auto overflow-x-hidden bg-white dark:bg-zinc-900/90 flex flex-col">
          <BrushStudioInspector
            category={selectedCategory}
            draftPreset={draftPreset}
            draftSmoothing={draftSmoothing}
            draftPressureCurve={draftPressureCurve}
            onUpdateEngineParams={updateDraftEngineParams}
            onUpdateSmoothing={updateDraftSmoothing}
            onUpdatePressureCurve={updateDraftPressureCurve}
            onUpdateMetadata={updateDraftMetadata}
            onRevertToInitial={revertToInitial}
          />
        </div>

        {/* Right Interactive Drawing Pad */}
        <div className="flex-1 h-full min-w-0 flex overflow-hidden">
          <BrushStudioDrawingPad
            draftPreset={draftPreset}
            draftSmoothing={draftSmoothing}
            draftPressureCurve={draftPressureCurve}
          />
        </div>
      </div>
    </div>
  );
};

export interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
  onDetach?: () => void;
}

/**
 * Full-window Brush Studio modal dialog.
 * Opens with window frame and backdrop blur, with option to detach into standalone window.
 */
export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  // Support Escape key to cancel / close
  useWindowKeyShortcuts({
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Brush Studio"
      data-native-ui="brush-studio"
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-150 select-none"
    >
      <div className="w-full max-w-7xl h-full max-h-[92vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        <BrushStudioContent
          onClose={onClose}
          onDetach={onDetach}
          isDetached={false}
        />
      </div>
    </div>
  );
};
