/**
 * Standalone Brush Scratchpad & Live Studio POC
 * A completely decoupled, self-contained environment for rapid brush experimentation.
 * Features:
 * - Live updating Procreate-style canonical stroke preview on every slider/setting change
 * - Full hardware stylus pressure, tilt, and coalesced event support matching the native canvas
 * - Multi-theme support (Procreate Dark, Studio Light, 50% Neutral Gray paper)
 * - Trajectory presets (S-Curve, Flick, Ribbon Wave, Hatching)
 * - Freehand scribble mode with one-click reset to live preview
 * - Zero dependency on running the full multi-layer drawing app
 */

import { useState, useCallback, useMemo, type FC } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  Check,
  Sparkles,
  Layers,
  ChevronDown,
  Paintbrush,
  CopyPlus,
  ArrowLeft,
} from "lucide-react";
import type { BrushPreset } from "@/types/brush";
import {
  createDefaultPresets,
  createDefaultStudioPenPreset,
} from "@/engine/drawing_app_engine";
import { useBrushStudioDraft } from "@/ui/hooks/useBrushStudioDraft";
import { BrushStudioCategories } from "@/ui/components/brush_studio/BrushStudioCategories";
import { BrushStudioInspector } from "@/ui/components/brush_studio/BrushStudioInspector";
import { ProcreateLiveDrawingPad } from "./ProcreateLiveDrawingPad";

export interface StandaloneScratchpadPocProps {
  onBackToApp?: () => void;
}

export const StandaloneScratchpadPoc: FC<StandaloneScratchpadPocProps> = ({
  onBackToApp,
}) => {
  // Builtin presets library available in standalone mode
  const availablePresets = useMemo<BrushPreset[]>(() => {
    return createDefaultPresets();
  }, []);

  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const activePreset = availablePresets[selectedPresetIndex] ?? createDefaultStudioPenPreset();

  // Full draft management
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
  } = useBrushStudioDraft(activePreset);

  const [isSaved, setIsSaved] = useState(false);

  const handleSave = useCallback(() => {
    commitToEngine();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  }, [commitToEngine]);

  const handleSaveAsNew = useCallback(() => {
    const defaultName = `${draftPreset.displayName} Copy`;
    const name =
      typeof window !== "undefined"
        ? window.prompt("Save new brush preset as:", defaultName)
        : defaultName;
    if (name && name.trim()) {
      saveAsNewPreset(name.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  }, [draftPreset.displayName, saveAsNewPreset]);

  return (
    <div className="flex flex-col h-screen w-screen select-none overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Application Bar */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/10 bg-zinc-900/90 backdrop-blur-md shrink-0 z-20">
        {/* Left: Branding & Preset Switcher */}
        <div className="flex items-center gap-3">
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              title="Return to Main Drawing App"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer mr-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Canvas</span>
            </button>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold tracking-wide uppercase">Scratchpad POC</span>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Preset Selector Dropdown */}
          <div className="relative flex items-center">
            <select
              value={selectedPresetIndex}
              onChange={(e) => setSelectedPresetIndex(Number(e.target.value))}
              aria-label="Active brush preset"
              title="Select active brush preset"
              className="appearance-none flex items-center gap-2 pl-3 pr-8 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-200 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {availablePresets.map((p, idx) => (
                <option key={p.presetId} value={idx}>
                  {p.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 pointer-events-none" />
          </div>

          {isDirty && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/25">
              • Modified
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={revertToInitial}
            disabled={!isDirty}
            title="Reset tweaks to baseline"
            aria-label="Reset tweaks to baseline"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAsNew}
            title="Save as a new preset copy"
            aria-label="Save as a new preset copy"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-all"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save As New...</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            title="Commit changes to active preset"
            aria-label="Commit changes to active preset"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer ${
              isSaved
                ? "bg-emerald-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-blue-500/25"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaved ? "Saved!" : "Save Preset"}</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Studio Categories Rail */}
        <BrushStudioCategories
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          isDirty={isDirty}
        />

        {/* Center: Brush Settings Inspector (Sliders, Curves, Dials) */}
        <section
          aria-label="Brush Inspector"
          className="w-96 shrink-0 border-r border-white/10 overflow-y-auto overflow-x-hidden bg-zinc-900/90 flex flex-col"
        >
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
        </section>

        {/* Right: Live Procreate Drawing Pad (Live Preview + Freehand Scribble) */}
        <section
          aria-label="Interactive Scratchpad Canvas"
          className="flex-1 h-full min-w-0 flex overflow-hidden"
        >
          <ProcreateLiveDrawingPad
            draftPreset={draftPreset}
            draftSmoothing={draftSmoothing}
            draftPressureCurve={draftPressureCurve}
          />
        </section>
      </main>
    </div>
  );
};
