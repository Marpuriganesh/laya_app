import { useState, type FC } from "react";
import { Sparkles, FolderDown, Brush, Check } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";

interface BrushLibraryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset?: (presetName: string) => void;
}

interface MockPreset {
  id: string;
  name: string;
  category: string;
  engine: "Pixel" | "Smudge" | "MyPaint";
  description: string;
}

const DEFAULT_PRESETS: MockPreset[] = [
  { id: "1", name: "Studio Pen", category: "Inking", engine: "Pixel", description: "Smooth, clean line work" },
  { id: "2", name: "Technical Pen", category: "Inking", engine: "Pixel", description: "Uniform mechanical line" },
  { id: "3", name: "Soft Airbrush", category: "Airbrush", engine: "Pixel", description: "Gentle gradient fade" },
  { id: "4", name: "Hard Airbrush", category: "Airbrush", engine: "Pixel", description: "Dense airbrush fill" },
  { id: "5", name: "6B Pencil", category: "Sketching", engine: "Pixel", description: "Grainy graphite response" },
  { id: "6", name: "Charcoal Soft", category: "Sketching", engine: "MyPaint", description: "Organic deep charcoal" },
  { id: "7", name: "Wet Acrylic", category: "Painting", engine: "Smudge", description: "Blends and smears wet paint" },
  { id: "8", name: "Oil Flat Wet", category: "Painting", engine: "Smudge", description: "Rich blending impasto" },
];

export const BrushLibraryPopover: FC<BrushLibraryPopoverProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("Inking");
  const [selectedId, setSelectedId] = useState<string>("1");

  const categories = ["Sketching", "Inking", "Painting", "Airbrush"];
  const filteredPresets = DEFAULT_PRESETS.filter((p) => p.category === activeCategory);

  return (
    <FloatingWindowPanel
      title="Brush Library"
      icon={<Brush className="w-4 h-4 text-zinc-400" />}
      isOpen={isOpen}
      onClose={onClose}
      width={360}
      height={500}
      initialOffset={{ x: 0, y: 0 }}
      anchorClassName="fixed right-20 top-16"
      zIndex={40}
      allowPopout={true}
    >
      <div className="flex flex-col h-full bg-zinc-900 select-none">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800/60 overflow-x-auto bg-zinc-950/40">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                activeCategory === category
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Presets List */}
        <div className="p-3 overflow-y-auto flex-1 space-y-1.5 max-h-[340px]">
          {filteredPresets.map((preset) => {
            const isSelected = selectedId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setSelectedId(preset.id);
                  onSelectPreset?.(preset.name);
                }}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                  isSelected
                    ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                    : "bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/40 hover:border-zinc-700 text-zinc-300"
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">{preset.name}</span>
                  <span className="text-[11px] text-zinc-400">{preset.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700/60 text-zinc-400">
                    {preset.engine}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-zinc-200" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Import Buttons */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/50 flex items-center justify-between gap-2 mt-auto">
          <button
            type="button"
            title="Import Krita .kpp presets or .bundle packs"
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300 text-xs font-medium transition-colors"
          >
            <FolderDown className="w-3.5 h-3.5 text-zinc-400" />
            <span>Import Krita</span>
          </button>
          <button
            type="button"
            title="Import Adobe Photoshop .abr brush files"
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300 text-xs font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
            <span>Import ABR</span>
          </button>
        </div>
      </div>
    </FloatingWindowPanel>
  );
};
