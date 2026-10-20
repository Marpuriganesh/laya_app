import { useState, type FormEvent, type FC } from "react";
import { X, Check, FilePlus2, Monitor, Printer, Square, Film } from "lucide-react";
import {
  type DocumentConfiguration,
  type ColorSpace,
  type BitDepth,
  type CanvasUnit,
  STANDARD_DOCUMENT_PRESETS,
} from "@/types/document";

interface NewCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDocument: (config: DocumentConfiguration) => void;
}

export const NewCanvasModal: FC<NewCanvasModalProps> = ({
  isOpen,
  onClose,
  onCreateDocument,
}) => {
  const [title, setTitle] = useState("Untitled Artwork");
  const [unit, setUnit] = useState<CanvasUnit>("pixels");
  const [width, setWidth] = useState(2048);
  const [height, setHeight] = useState(2048);
  const [dpi, setDpi] = useState(144);
  const [colorSpace, setColorSpace] = useState<ColorSpace>("srgb");
  const [bitDepth, setBitDepth] = useState<BitDepth>("8-bit");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");

  if (!isOpen) return null;

  // Convert unit to pixels if user inputs physical units
  const getCalculatedPixels = (val: number, currentUnit: CanvasUnit, currentDpi: number): number => {
    switch (currentUnit) {
      case "inches":
        return Math.round(val * currentDpi);
      case "cm":
        return Math.round((val / 2.54) * currentDpi);
      case "mm":
        return Math.round((val / 25.4) * currentDpi);
      case "pixels":
      default:
        return Math.round(val);
    }
  };

  const handleApplyPreset = (presetWidth: number, presetHeight: number, presetDpi: number, presetName: string) => {
    setUnit("pixels");
    setWidth(presetWidth);
    setHeight(presetHeight);
    setDpi(presetDpi);
    setTitle(presetName);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalWidth = Math.max(64, Math.min(8192, getCalculatedPixels(width, unit, dpi)));
    const finalHeight = Math.max(64, Math.min(8192, getCalculatedPixels(height, unit, dpi)));

    const newDoc: DocumentConfiguration = {
      id: "doc-" + Date.now(),
      title: title.trim() || "Untitled Artwork",
      width: finalWidth,
      height: finalHeight,
      dpi,
      colorSpace,
      bitDepth,
      backgroundColor,
    };

    onCreateDocument(newDoc);
    onClose();
  };

  const getPresetIcon = (category: string) => {
    switch (category) {
      case "Screen":
        return <Monitor className="w-4 h-4 text-sky-400" />;
      case "Video":
        return <Film className="w-4 h-4 text-purple-400" />;
      case "Print":
        return <Printer className="w-4 h-4 text-emerald-400" />;
      default:
        return <Square className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-900 dark:text-zinc-100 transition-colors"
        role="dialog"
        aria-modal="true"
        aria-label="New Document Configuration"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">New Document</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Configure canvas dimensions, color space, and bit depth</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Presets Quick Pick */}
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider block mb-2.5">
              Canvas Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STANDARD_DOCUMENT_PRESETS.map((preset) => {
                const isSelected =
                  width === preset.width && height === preset.height && dpi === preset.dpi;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPreset(preset.width, preset.height, preset.dpi, preset.name)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 dark:bg-zinc-800 border-blue-500 dark:border-zinc-500 ring-1 ring-blue-500 dark:ring-zinc-500"
                        : "bg-zinc-50/60 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate">{preset.name}</span>
                      {getPresetIcon(preset.category)}
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {preset.width} × {preset.height} px
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Document Properties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Document Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                placeholder="Untitled Artwork"
              />
            </div>

            {/* Width */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Width</label>
              <input
                type="number"
                min="64"
                max="8192"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            {/* Height */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Height</label>
              <input
                type="number"
                min="64"
                max="8192"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            {/* Resolution (DPI) */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Resolution (DPI)</label>
              <select
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 cursor-pointer"
              >
                <option value={72} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">72 DPI (Standard Web / Screen)</option>
                <option value={144} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">144 DPI (Retina Screen)</option>
                <option value={300} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">300 DPI (Print Quality)</option>
              </select>
            </div>

            {/* Units */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Measurement Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as CanvasUnit)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 cursor-pointer"
              >
                <option value="pixels" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Pixels (px)</option>
                <option value="inches" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Inches (in)</option>
                <option value="cm" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Centimeters (cm)</option>
                <option value="mm" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Millimeters (mm)</option>
              </select>
            </div>

            {/* Color Space */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Color Space</label>
              <select
                value={colorSpace}
                onChange={(e) => setColorSpace(e.target.value as ColorSpace)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 cursor-pointer"
              >
                <option value="srgb" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">sRGB IEC61966-2.1 (Standard)</option>
                <option value="display-p3" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">Display P3 (Wide Color Gamut)</option>
              </select>
            </div>

            {/* Bit Depth */}
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Color Bit Depth</label>
              <select
                value={bitDepth}
                onChange={(e) => setBitDepth(e.target.value as BitDepth)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 cursor-pointer"
              >
                <option value="8-bit" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">8-bit / Channel (Standard RGBA)</option>
                <option value="16-bit-float" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">16-bit Float / Channel (High Dynamic Range)</option>
              </select>
            </div>

            {/* Background Color */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">Canvas Background</label>
              <div className="flex items-center gap-3">
                {[
                  { label: "White", color: "#ffffff" },
                  { label: "Black", color: "#000000" },
                  { label: "Transparent", color: "transparent" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setBackgroundColor(item.color)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      backgroundColor === item.color
                        ? "bg-blue-50 dark:bg-zinc-800 border-blue-500 dark:border-blue-400 text-blue-900 dark:text-zinc-100"
                        : "bg-zinc-50 dark:bg-zinc-800/70 border-zinc-200 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700"
                      style={{
                        backgroundColor: item.color === "transparent" ? "transparent" : item.color,
                        backgroundImage:
                          item.color === "transparent"
                            ? "linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)"
                            : "none",
                        backgroundSize: "6px 6px",
                      }}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Create Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
