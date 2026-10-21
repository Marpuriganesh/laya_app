/**
 * UI State and Tool Type Definitions
 */

export type ActiveTool = "brush" | "smudge" | "eraser" | "zoom" | "hand";

export interface ShortcutConfig {
  readonly holdThresholdMs: number;
}

export type PopoverType = "none" | "color" | "brushLibrary" | "newCanvas" | "actions" | "layers" | "brushSettings";

export type SoftProofMode = "none" | "grayscale-values" | "cmyk-print" | "gamut-warning";

export interface CanvasTransform {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
  readonly rotation?: number; // Canvas rotation in degrees (-180 to 180), default 0
}
