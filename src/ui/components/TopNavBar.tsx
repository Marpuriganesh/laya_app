import type { FC } from "react";
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
} from "lucide-react";
import type { ActiveTool, PopoverType } from "@/types/ui";
import type { DocumentConfiguration } from "@/types/document";

interface TopNavBarProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  zoomScale: number;
  activePopover: PopoverType;
  onSelectTool: (tool: ActiveTool) => void;
  onTogglePopover: (popover: PopoverType) => void;
  onResetZoom: () => void;
}

export const TopNavBar: FC<TopNavBarProps> = ({
  document,
  activeTool,
  activeColor,
  zoomScale,
  activePopover,
  onSelectTool,
  onTogglePopover,
  onResetZoom,
}) => {
  const zoomPercent = Math.round(zoomScale * 100);

  const handleBrushClick = () => {
    if (activeTool === "brush") {
      onTogglePopover("brushLibrary");
    } else {
      onSelectTool("brush");
    }
  };

  return (
    <header className="h-14 px-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between select-none z-30 shrink-0">
      {/* Left Control Cluster */}
      <div className="flex items-center gap-1 sm:gap-2">
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
          aria-label="Adjustments"
          title="Adjustments"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
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

      {/* Center Document Title & Zoom */}
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
          aria-label="Layers Panel"
          title="Layers"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
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
          <span
            className="block w-6 h-6 rounded-full border-2 border-zinc-700 shadow-inner"
            style={{ backgroundColor: activeColor }}
          />
        </button>
      </div>
    </header>
  );
};
