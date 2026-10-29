import type { FC } from "react";
import {
  Activity,
  Compass,
  PenLine,
  Sparkles,
  Waves,
  Layers,
  Droplet,
  Palette,
  Gauge,
  Pencil,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import type {
  BrushStudioCategoryId,
  BrushStudioCategoryMeta,
} from "./BrushStudioTypes";

export const BRUSH_STUDIO_CATEGORIES: readonly BrushStudioCategoryMeta[] = [
  {
    id: "stroke_path",
    label: "Stroke path",
    description: "Spacing, jitter, and falloff",
    icon: Activity,
  },
  {
    id: "stabilization",
    label: "Stabilization",
    description: "Streamline, moving average, and pull-string leash",
    icon: Compass,
  },
  {
    id: "taper",
    label: "Taper",
    description: "Start, end, and pressure stroke tapering",
    icon: PenLine,
  },
  {
    id: "shape",
    label: "Shape",
    description: "Brush dab stamp source, hardness, and aspect ratio",
    icon: Sparkles,
  },
  {
    id: "grain",
    label: "Grain",
    description: "Paper texture modulation and tooth depth",
    icon: Waves,
  },
  {
    id: "rendering",
    label: "Rendering",
    description: "Color blending mode, flow, and edge behavior",
    icon: Layers,
  },
  {
    id: "wet_mix",
    label: "Wet Mix",
    description: "Paint dilution, charge, and color pulling",
    icon: Droplet,
  },
  {
    id: "color_dynamics",
    label: "Color dynamics",
    description: "Hue, saturation, and lightness jitter per dab",
    icon: Palette,
  },
  {
    id: "dynamics",
    label: "Dynamics",
    description: "Sensor transfer curves and speed dynamics",
    icon: Gauge,
  },
  {
    id: "apple_pencil",
    label: "Stylus settings",
    description: "Stylus tilt arc dynamics, pressure curve, and hardware sensitivity",
    icon: Pencil,
  },
  {
    id: "properties",
    label: "Properties",
    description: "Brush sizing bounds, opacity limits, and stamp scale",
    icon: SlidersHorizontal,
  },
  {
    id: "about",
    label: "About this brush",
    description: "Name, category tags, author, and reset options",
    icon: Info,
  },
];

export interface BrushStudioCategoriesProps {
  selectedCategory: BrushStudioCategoryId;
  onSelectCategory: (id: BrushStudioCategoryId) => void;
  isDirty?: boolean;
}

export const BrushStudioCategories: FC<BrushStudioCategoriesProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <nav
      aria-label="Brush Studio Categories"
      className="w-56 shrink-0 bg-zinc-100/70 dark:bg-zinc-950/50 border-r border-zinc-200 dark:border-white/5 flex flex-col overflow-y-auto overflow-x-hidden p-2.5 gap-1 select-none"
    >
      <div className="px-2.5 py-1.5 mb-1">
        <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Brush Studio
        </h2>
      </div>

      <div className="flex flex-col gap-0.5">
        {BRUSH_STUDIO_CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.id;
          const Icon = category.icon;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              aria-current={isSelected ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer group ${
                isSelected
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isSelected
                    ? "text-white"
                    : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                }`}
              />
              <span className="truncate flex-1">{category.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
