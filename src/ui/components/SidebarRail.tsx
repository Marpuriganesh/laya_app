import { useState, type FC } from "react";
import { Undo2, Redo2 } from "lucide-react";

interface SidebarRailProps {
  brushSize: number;
  brushOpacity: number;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const SidebarRail: FC<SidebarRailProps> = ({
  brushSize,
  brushOpacity,
  onBrushSizeChange,
  onBrushOpacityChange,
  onUndo,
  onRedo,
}) => {
  const [showSizeTooltip, setShowSizeTooltip] = useState(false);
  const [showOpacityTooltip, setShowOpacityTooltip] = useState(false);

  const opacityPercentage = Math.round(brushOpacity * 100);

  return (
    <aside
      aria-label="Brush dynamics and history rail"
      className="fixed left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-6 p-2 rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 shadow-2xl select-none"
    >
      {/* Brush Size Vertical Slider */}
      <div className="relative flex flex-col items-center group">
        {showSizeTooltip && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-semibold text-zinc-100 shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in duration-100">
            {brushSize} px
          </div>
        )}
        <span className="text-[10px] font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
          Size
        </span>
        <div className="h-36 w-6 flex items-center justify-center relative">
          <input
            type="range"
            min="1"
            max="300"
            value={brushSize}
            aria-label="Brush Size Slider"
            onMouseEnter={() => setShowSizeTooltip(true)}
            onMouseLeave={() => setShowSizeTooltip(false)}
            onTouchStart={() => setShowSizeTooltip(true)}
            onTouchEnd={() => setShowSizeTooltip(false)}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            className="w-36 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer -rotate-90 origin-center accent-zinc-100"
          />
        </div>
      </div>

      {/* Separator */}
      <div className="w-4 h-px bg-zinc-800" />

      {/* Brush Opacity Vertical Slider */}
      <div className="relative flex flex-col items-center group">
        {showOpacityTooltip && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-semibold text-zinc-100 shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in duration-100">
            {opacityPercentage}%
          </div>
        )}
        <span className="text-[10px] font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
          Opac
        </span>
        <div className="h-36 w-6 flex items-center justify-center relative">
          <input
            type="range"
            min="1"
            max="100"
            value={opacityPercentage}
            aria-label="Brush Opacity Slider"
            onMouseEnter={() => setShowOpacityTooltip(true)}
            onMouseLeave={() => setShowOpacityTooltip(false)}
            onTouchStart={() => setShowOpacityTooltip(true)}
            onTouchEnd={() => setShowOpacityTooltip(false)}
            onChange={(e) => onBrushOpacityChange(Number(e.target.value) / 100)}
            className="w-36 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer -rotate-90 origin-center accent-zinc-100"
          />
        </div>
      </div>

      {/* Separator */}
      <div className="w-4 h-px bg-zinc-800" />

      {/* Undo & Redo Quick Buttons */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
