/**
 * Drawing Engine Facade Contract
 * Single interface consumed by the UI layer to control brush engines, stroke smoothing,
 * raster targets, and preset management.
 */

import type { BrushPreset, StrokeSmoothingConfig } from "./brush";
import type { IRasterTarget } from "./raster";
import type { StrokePoint } from "./stroke";

export interface IDrawingEngine {
  // --- Canvas Lifecycle ---
  mountToCanvas(canvasElement: HTMLCanvasElement): void;
  unmount(): void;

  // --- Brush Preset Management ---
  loadKritaPreset(kppFileBuffer: ArrayBuffer): Promise<BrushPreset>;
  loadKritaBundle(bundleFileBuffer: ArrayBuffer): Promise<readonly BrushPreset[]>;
  loadAbrFile(abrFileBuffer: ArrayBuffer): Promise<readonly BrushPreset[]>;
  setActiveBrush(preset: BrushPreset): void;
  getActiveBrush(): BrushPreset | null;
  getLoadedPresets(): readonly BrushPreset[];

  // --- Active Stroke ---
  beginStroke(point: StrokePoint): void;
  extendStroke(point: StrokePoint): void;
  extendStrokeBatch?(points: readonly StrokePoint[]): void;
  endStroke(): void;

  // --- Real-time Brush Adjustments ---
  setForegroundColor(r: number, g: number, b: number, a?: number): void;
  setBrushSize(sizePx: number): void;
  setBrushOpacity(opacityNormalized: number): void;
  setBlendMode(blendMode: import("./raster").BlendMode): void;
  setSmoothingConfig(config: StrokeSmoothingConfig): void;
  getSmoothingConfig?(): StrokeSmoothingConfig;

  // --- Spline & Curve Settings ---
  setSplineInterpolationMode?(mode: "catmullRom" | "midpoint"): void;
  getSplineInterpolationMode?(): "catmullRom" | "midpoint";

  // --- Brush Tip & Dynamics Adjustments ---
  setBrushHardness?(hardness: number): void;
  getBrushHardness?(): number;
  setBrushSpacing?(spacingFraction: number): void;
  getBrushSpacing?(): number;
  setBrushFlow?(flow: number): void;
  getBrushFlow?(): number;
  setBrushAspectRatio?(aspectRatio: number): void;
  getBrushAspectRatio?(): number;
  setBrushAngle?(angleRadians: number): void;
  getBrushAngle?(): number;
  setSizeDynamicsEnabled?(enabled: boolean): void;
  setOpacityDynamicsEnabled?(enabled: boolean): void;

  // --- Canvas Configuration ---
  setCanvasSize(widthPx: number, heightPx: number): void;
  clearCanvas(): void;
  getRasterTarget(): IRasterTarget;
}
