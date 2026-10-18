/**
 * UI State and Tool Type Definitions
 */

export type ActiveTool = "brush" | "smudge" | "eraser";

export type PopoverType = "none" | "color" | "brushLibrary" | "newCanvas" | "actions" | "layers";

export type SoftProofMode = "none" | "grayscale-values" | "cmyk-print" | "gamut-warning";

export interface CanvasTransform {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
}
