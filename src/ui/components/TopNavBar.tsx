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
  Eye,
  Check,
  ChevronRight,
  X,
  Minus,
  Square,
  Sun,
  Moon,
  Keyboard,
} from "lucide-react";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import type { ActiveTool, PopoverType, SoftProofMode } from "@/types/ui";
import type { DocumentConfiguration } from "@/types/document";
import type { DetachablePanelId } from "@/types/window";

interface TopNavBarProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  zoomScale?: number;
  activePopover: PopoverType;
  softProofMode: SoftProofMode;
  detachedPanels?: Record<DetachablePanelId, boolean>;
  onFocusDetached?: (panelId: DetachablePanelId) => void;
  onSelectTool: (tool: ActiveTool) => void;
  onTogglePopover: (popover: PopoverType) => void;
  onResetZoom?: () => void;
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
  activePopover,
  softProofMode,
  detachedPanels,
  onFocusDetached,
  onSelectTool,
  onTogglePopover,
  onSelectSoftProofMode,
}) => {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isProofSubmenuOpen, setIsProofSubmenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, toggleTheme } = useTheme();
  const { palmRejection, togglePalmRejection, holdThresholdMs, setHoldThresholdMs } = useDocumentStore();
  const navSwatchCanvasRef = useRef<HTMLCanvasElement>(null);

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
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    if (isActionsMenuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
      return () => window.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isActionsMenuOpen]);

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
      if (detachedPanels?.brushLibrary) {
        onFocusDetached?.("brushLibrary");
      } else {
        onTogglePopover("brushLibrary");
      }
    } else {
      onSelectTool("brush");
    }
  };

  const handleLayersClick = () => {
    if (detachedPanels?.layers) {
      onFocusDetached?.("layers");
    } else {
      onTogglePopover("layers");
    }
  };

  const handleColorClick = () => {
    if (detachedPanels?.color) {
      onFocusDetached?.("color");
    } else {
      onTogglePopover("color");
    }
  };

  const handleHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    // Only toggle maximize when double clicking blank titlebar space,
    // not when double clicking buttons, inputs, canvas, or dropdown menus
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, canvas, [role='menu']")) {
      return;
    }
    handleToggleMaximize();
  };

  return (
    <header
      data-tauri-drag-region
      data-native-ui="top-bar"
      onDoubleClick={handleHeaderDoubleClick}
      className="h-14 px-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 flex items-center justify-between select-none z-30 shrink-0 cursor-default"
      title="Double-click to toggle maximize • Drag to reposition"
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
        >
          <FilePlus2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          {/* <span className="hidden md:inline">New Canvas</span> */}
        </button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

        {/* Actions & App Settings Menu */}
        <div className="relative" ref={actionsMenuRef}>
          <button
            type="button"
            onClick={() => setIsActionsMenuOpen((prev) => !prev)}
            aria-label="Actions and Canvas settings"
            title="Actions / Settings"
            className={`p-2 rounded-lg transition-colors ${
              isActionsMenuOpen
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            <Wrench className="w-4 h-4" />
          </button>

          {isActionsMenuOpen && (
            <div className="absolute top-full mt-2 left-0 w-64 p-1.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-white/5 shadow-2xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Document Summary */}
              <div className="px-2.5 py-1.5 border-b border-zinc-100 dark:border-white/5 mb-0.5">
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {document.title}
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                  {document.width} × {document.height} px • {document.dpi} DPI
                </div>
              </div>

              {/* Action items */}
              <button
                type="button"
                onClick={() => {
                  setIsActionsMenuOpen(false);
                  onTogglePopover("newCanvas");
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>New Canvas...</span>
              </button>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800/80 my-0.5" />

              {/* Soft Proofing Submenu */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setIsProofSubmenuOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Soft Proofing</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono font-medium">
                      {softProofMode === "none"
                        ? "Off"
                        : softProofMode === "grayscale-values"
                        ? "B&W"
                        : softProofMode === "cmyk-print"
                        ? "CMYK"
                        : "Gamut"}
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                        isProofSubmenuOpen ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </button>

                {isProofSubmenuOpen && (
                  <div className="pl-3 pr-1 py-1 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-1 duration-100 bg-zinc-50/80 dark:bg-zinc-800/60 rounded-lg mt-0.5 border border-zinc-100 dark:border-white/5">
                    {SOFT_PROOF_OPTIONS.map((opt) => {
                      const isSelected = softProofMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onSelectSoftProofMode(opt.id);
                          }}
                          className={`w-full flex items-start justify-between p-1.5 rounded-md text-left transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 hover:text-zinc-900 dark:hover:text-zinc-200"
                          }`}
                        >
                          <div>
                            <div className="text-[11px] font-medium leading-tight">{opt.label}</div>
                            <div className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
                              {opt.description}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5 ml-1.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800/80 my-0.5" />

              {/* Palm Rejection Setting */}
              <button
                type="button"
                onClick={togglePalmRejection}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                title={`Palm Rejection (Stylus Only): currently ${palmRejection ? "ON" : "OFF"}`}
              >
                <div className="flex items-center gap-2">
                  <Hand className="w-3.5 h-3.5 text-zinc-400" />
                  <div className="flex flex-col text-left">
                    <span>Palm Rejection</span>
                    <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-normal leading-tight">
                      Pencil draws • Touch pans
                    </span>
                  </div>
                </div>
                <div
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                    palmRejection
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-transparent"
                  }`}
                >
                  {palmRejection ? "ON" : "OFF"}
                </div>
              </button>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800/80 my-0.5" />

              {/* Spring-Loaded Shortcut Hold Threshold */}
              <div className="px-2.5 py-1.5 flex flex-col gap-1.5 select-none">
                <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Hold Threshold</span>
                  </div>
                  <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                    {holdThresholdMs}ms
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min="100"
                    max="600"
                    step="25"
                    value={holdThresholdMs}
                    onChange={(e) => setHoldThresholdMs(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 accent-blue-600 rounded-lg cursor-pointer border-0 outline-none"
                    title={`Spring-loaded shortcut hold threshold: ${holdThresholdMs}ms`}
                  />
                  <div className="flex justify-between text-[9px] text-zinc-400 dark:text-zinc-500 font-normal">
                    <span>100ms (Fast)</span>
                    <span>Hold to zoom / pan</span>
                    <span>600ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onTogglePopover("brushSettings")}
          aria-label="Brush Settings & Studio"
          title="Brush Settings & Studio"
          className={`p-2 rounded-lg transition-colors ${
            activePopover === "brushSettings"
              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Selection Tool"
          title="Selection"
          className="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
        >
          <Lasso className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Transform Tool"
          title="Transform"
          className="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
        >
          <Move className="w-4 h-4" />
        </button>
      </div>

      {/* Center Document Title & Theme Switcher */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-40 sm:max-w-xs truncate hidden sm:inline">
          {document.title}
        </span>

        {/* Subtle Divider */}
        <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 hidden sm:block" />

        {/* Theme Toggle (Light / Dark Mode) with Filled Monochrome Icon */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          title={resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Moon className="w-3.5 h-3.5 fill-current" />
          )}
        </button>
      </div>

      {/* Right Tool Cluster */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Paint Brush (B) */}
        <button
          type="button"
          onClick={handleBrushClick}
          aria-label="Paint Tool (B)"
          title="Paint Brush (B) • Tap to switch, hold for quick switch"
          className={`p-2 rounded-lg transition-colors relative ${
            activeTool === "brush"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <Paintbrush className="w-4 h-4" />
        </button>

        {/* Smudge (S) */}
        <button
          type="button"
          onClick={() => onSelectTool("smudge")}
          aria-label="Smudge Tool (S)"
          title="Smudge Tool (S) • Tap to switch, hold for quick switch"
          className={`p-2 rounded-lg transition-colors ${
            activeTool === "smudge"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Eraser (E) */}
        <button
          type="button"
          onClick={() => onSelectTool("eraser")}
          aria-label="Eraser Tool (E)"
          title="Eraser Tool (E) • Tap to switch, hold for quick switch"
          className={`p-2 rounded-lg transition-colors ${
            activeTool === "eraser"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* Layers */}
        <button
          type="button"
          onClick={handleLayersClick}
          aria-label={detachedPanels?.layers ? "Bring detached Layers to front" : "Layers Panel"}
          title={detachedPanels?.layers ? "Layers (Detached - click to focus)" : "Layers"}
          className={`p-2 rounded-lg transition-colors relative ${
            activePopover === "layers"
              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          <Layers className="w-4 h-4" />
          {detachedPanels?.layers && (
            <span
              title="Detached in standalone window"
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-sm"
            />
          )}
        </button>

        {/* Active Color Swatch */}
        <button
          type="button"
          onClick={handleColorClick}
          aria-label={detachedPanels?.color ? "Bring detached Color Studio to front" : "Color Palette Picker"}
          title={detachedPanels?.color ? "Color Studio (Detached - click to focus)" : "Color Picker"}
          className="p-1 rounded-full hover:scale-105 transition-transform relative"
        >
          <span
            className={`w-6 h-6 rounded-full overflow-hidden shadow-inner bg-zinc-950 flex items-center justify-center transition-all ${
              activePopover === "color" || detachedPanels?.color
                ? "border-2 border-blue-500 ring-2 ring-blue-500/30"
                : "border-2 border-zinc-700"
            }`}
          >
            <canvas
              ref={navSwatchCanvasRef}
              width={24}
              height={24}
              className="w-full h-full block"
            />
          </span>
          {detachedPanels?.color && (
            <span
              title="Detached in standalone window"
              className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-400 border border-zinc-950"
            />
          )}
        </button>
      </div>
    </header>
  );
};
