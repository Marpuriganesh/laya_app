import type { FC } from "react";
import { X, Palette } from "lucide-react";

interface ColorPickerPopoverProps {
  isOpen: boolean;
  activeColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

const ARTISTIC_PALETTE = [
  "#000000",
  "#1e293b",
  "#475569",
  "#94a3b8",
  "#ffffff",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#16a34a",
  "#0284c7",
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#831843",
  "#78350f",
];

export const ColorPickerPopover: FC<ColorPickerPopoverProps> = ({
  isOpen,
  activeColor,
  onClose,
  onSelectColor,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-16 z-40 w-72 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl select-none animate-in fade-in zoom-in-95 duration-100">
      {/* Popover Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200">Color Palette</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close color picker"
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Active Color Preview & Direct Native Input */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative group">
          <input
            type="color"
            value={activeColor.startsWith("#") ? activeColor : "#000000"}
            onChange={(e) => onSelectColor(e.target.value)}
            aria-label="Color input selector"
            className="w-12 h-12 rounded-xl border border-zinc-700 bg-transparent cursor-pointer p-0 appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-xl"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
            Hex Code
          </label>
          <input
            type="text"
            value={activeColor.toUpperCase()}
            onChange={(e) => onSelectColor(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      {/* Quick Swatches Grid */}
      <div>
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-2">
          Standard Swatches
        </span>
        <div className="grid grid-cols-8 gap-1.5">
          {ARTISTIC_PALETTE.map((color) => {
            const isSelected = activeColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                onClick={() => onSelectColor(color)}
                aria-label={`Select color ${color}`}
                className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                  isSelected
                    ? "border-white ring-2 ring-zinc-400 scale-105"
                    : "border-zinc-800/80 hover:border-zinc-600"
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
