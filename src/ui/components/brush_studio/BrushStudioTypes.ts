import type { FC } from "react";
import type {
  BrushPreset,
  StrokeSmoothingConfig,
} from "@/types/brush";
import type { CurvePoint } from "@/engine/math/dynamics_curve";

export type BrushStudioCategoryId =
  | "stroke_path"
  | "stabilization"
  | "taper"
  | "shape"
  | "grain"
  | "rendering"
  | "wet_mix"
  | "color_dynamics"
  | "dynamics"
  | "apple_pencil"
  | "properties"
  | "about";

export interface BrushStudioCategoryMeta {
  readonly id: BrushStudioCategoryId;
  readonly label: string;
  readonly description: string;
  readonly icon: FC<{ className?: string }>;
}

export interface BrushStudioDraftState {
  readonly initialPreset: BrushPreset;
  readonly draftPreset: BrushPreset;
  readonly draftSmoothing: StrokeSmoothingConfig;
  readonly draftPressureCurve: CurvePoint[];
  readonly isDirty: boolean;
  readonly selectedCategory: BrushStudioCategoryId;
}
