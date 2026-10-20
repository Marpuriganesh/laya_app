import { useState, useRef, useEffect, type FC } from "react";
import {
  FilePlus2,
  Wrench,
  SlidersHorizontal,
  Lasso,
  Move,
  Paintbrush,
  Hand,
  Eraser,
  Layers,
  ZoomIn,
  Eye,
  Check,
  ChevronDown,
  X,
  Minus,
  Square,
} from "lucide-react";
import type { ActiveTool, PopoverType, SoftProofMode } from "@/types/ui";
import type { DocumentConfiguration } from "@/types/document";

interface TopNavBarProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  zoomScale: number;
  activePopover: PopoverType;
  softProofMode: SoftProofMode;
  onSelectTool: (tool: ActiveTool) => void;
  onTogglePopover: (popover: PopoverType) => void;
  onResetZoom: () => void;
  onSelectSoftProofMode: (mode: SoftProofMode) => void;
}

const SOFT_PROOF_OPTIONS: { id: SoftProofMode; label: string; description: string }[] = [
  { id: "none", label: "Off (Standard View)", description: "Normal RGB display output" },
  { id: "grayscale-values", label: "Value Check (B&W)", description: "Perceptual luma check (Rec. 709)" },
  { id: "cmyk-print", label: "CMYK Print Simulation", description: "Pigment ink gamut & dynamic range" },
  { id: "gamut-warning", label: "Contrast Gamut Warning", description: "Highlights extreme saturation boundaries" },
];

export const TopNavBar: FC<TopNavBarProps> = ({
  document,
  activeTool,
  activeColor,
  zoomScale,
  activePopover,
  softProofMode,
  onSelectTool,
  onTogglePopover,
  onResetZoom,
  onSelectSoftProofMode,
}) => {
  const [isProofMenuOpen, setIsProofMenuOpen] = useState(false);
  const proofMenuRef = useRef<HTMLDivElement>(null);
  const navSwatchCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomPercent = Math.round(zoomScale * 100);

  useEffect(() => {
    const canvas = navSwatchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const safeColor = activeColor ? (activeColor.startsWith("#") ? activeColor : `#${activeColor}`) : "#ffffff";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = safeColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [activeColor]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (proofMenuRef.current && !proofMenuRef.current.contains(e.target as Node)) {
        setIsProofMenuOpen(false);
      }
    };
    if (isProofMenuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
      return () => window.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isProofMenuOpen]);

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const handleClose = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch (err) {
        console.error("Failed to close Tauri window:", err);
      }
    }
  };

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().minimize();
      } catch (err) {
        console.error("Failed to minimize Tauri window:", err);
      }
    }
  };

  const handleToggleMaximize = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.error("Failed to toggle maximize Tauri window:", err);
      }
    }
  };

  const handleBrushClick = () => {
    if (activeTool === "brush") {
      onTogglePopover("brushLibrary");
    } else {
      onSelectTool("brush");
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-14 px-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between select-none z-30 shrink-0"
    >
      {/* Left Control Cluster */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Custom Window Controls (Close, Minimize, Maximize) */}
        <div className="flex items-center gap-1.5 mr-2">
          <button
            type="button"
            onClick={handleClose}
            title="Close Window"
            aria-label="Close Window"
            className="w-3.5 h-3.5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-zinc-950 opacity-80 hover:opacity-100 transition-all group"
          >
            <X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimize Window"
            aria-label="Minimize Window"
            className="w-3.5 h-3.5 rounded-full bg-amber-500/80 hover:bg-amber-500 flex items-center justify-center text-zinc-950 opacity-80 hover:opacity-100 transition-all group"
          >
            <Minus className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            title="Maximize Window"
            aria-label="Maximize Window"
            className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 hover:bg-emerald-500 flex items-center justify-center text-zinc-950 opacity-80 hover:opacity-100 transition-all group"
          >
            <Square className="w-2 h-2 opacity-0 group-hover:opacity-100 stroke-[2.5]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onTogglePopover("newCanvas")}
          aria-label="New Canvas Document"
          title="New Canvas"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <FilePlus2 className="w-4 h-4 text-zinc-400" />
          <span className="hidden md:inline">New Canvas</span>
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

        <button
          type="button"
          onClick={() => onTogglePopover("actions")}
          aria-label="Actions and Canvas settings"
          title="Actions"
          className={`p-2 rounded-lg transition-colors ${
            activePopover === "actions"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <Wrench className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onTogglePopover("brushSettings")}
          aria-label="Brush Settings & Studio"
          title="Brush Settings & Studio"
          className={`p-2 rounded-lg transition-colors ${
            activePopover === "brushSettings"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Selection Tool"
          title="Selection"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
        >
          <Lasso className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Transform Tool"
          title="Transform"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
        >
          <Move className="w-4 h-4" />
        </button>
      </div>

      {/* Center Document Title, Zoom, & Soft Proofing */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-300 max-w-[140px] sm:max-w-xs truncate hidden sm:inline">
          {document.title}
        </span>
        <button
          type="button"
          onClick={onResetZoom}
          aria-label="Reset zoom to 100%"
          title="Click to reset zoom"
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ZoomIn className="w-3 h-3" />
          <span>{zoomPercent}%</span>
        </button>

        {/* Soft Proofing View Mode Selector */}
        <div className="relative" ref={proofMenuRef}>
          <button
            type="button"
            onClick={() => setIsProofMenuOpen((prev) => !prev)}
            aria-label="Soft proofing view mode"
            title="Soft Proofing / Tonal Value Check"
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              softProofMode !== "none"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">
              {softProofMode === "none"
                ? "Proof"
                : softProofMode === "grayscale-values"
                ? "Values (B&W)"
                : softProofMode === "cmyk-print"
                ? "CMYK Print"
                : "Gamut"}
            </span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {isProofMenuOpen && (
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-64 p-1.5 rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 shadow-2xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-300">
                Non-Destructive Soft Proofing
              </div>
              {SOFT_PROOF_OPTIONS.map((opt) => {
                const isSelected = softProofMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSelectSoftProofMode(opt.id);
                      setIsProofMenuOpen(false);
                    }}
                    className={`flex items-start justify-between p-2 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-zinc-800/90 text-white"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium text-zinc-200">{opt.label}</div>
                      <div className="text-[10px] text-zinc-300">{opt.description}</div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Tool Cluster */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Paint Brush */}
        <button
          type="button"
          onClick={handleBrushClick}
          aria-label="Paint Tool (Click again for Brush Library)"
          title="Brush (Paint)"
          className={`p-2 rounded-lg transition-colors relative ${
            activeTool === "brush"
              ? "bg-zinc-100 text-zinc-950 shadow-md"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <Paintbrush className="w-4 h-4" />
        </button>

        {/* Smudge */}
        <button
          type="button"
          onClick={() => onSelectTool("smudge")}
          aria-label="Smudge Tool"
          title="Smudge"
          className={`p-2 rounded-lg transition-colors ${
            activeTool === "smudge"
              ? "bg-zinc-100 text-zinc-950 shadow-md"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Eraser */}
        <button
          type="button"
          onClick={() => onSelectTool("eraser")}
          aria-label="Eraser Tool"
          title="Eraser"
          className={`p-2 rounded-lg transition-colors ${
            activeTool === "eraser"
              ? "bg-zinc-100 text-zinc-950 shadow-md"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        {/* Layers */}
        <button
          type="button"
          onClick={() => onTogglePopover("layers")}
          aria-label="Layers Panel"
          title="Layers"
          className={`p-2 rounded-lg transition-colors ${
            activePopover === "layers"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Active Color Swatch */}
        <button
          type="button"
          onClick={() => onTogglePopover("color")}
          aria-label="Color Palette Picker"
          title="Color Picker"
          className="p-1 rounded-full hover:scale-105 transition-transform"
        >
          <span className="block w-6 h-6 rounded-full overflow-hidden border-2 border-zinc-700 shadow-inner bg-zinc-950 flex items-center justify-center">
            <canvas
              ref={navSwatchCanvasRef}
              width={24}
              height={24}
              className="w-full h-full block"
            />
          </span>
        </button>
      </div>
    </header>
  );
};
