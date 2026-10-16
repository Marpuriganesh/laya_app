/**
 * UI State and Tool Type Definitions
 */

export type ActiveTool = "brush" | "smudge" | "eraser";

export type PopoverType = "none" | "color" | "brushLibrary" | "newCanvas" | "actions";

export interface CanvasTransform {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
}
