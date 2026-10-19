/**
 * Drawing App Engine Facade
 * Coordinates stroke smoothing, brush engine dispatching, preset management,
 * and raster target blitting.
 * Single entry point for the UI presentation layer.
 */

import type { BrushPreset, PixelBrushParameters, StrokeSmoothingConfig } from "@/types/brush";
import type { IDrawingEngine } from "@/types/engine";
import type { IRasterTarget } from "@/types/raster";
import type { StrokePoint } from "@/types/stroke";
import { Canvas2dRasterTarget } from "./raster/canvas2d_raster_target";
import { MemoryRasterBuffer } from "./raster/memory_raster_buffer";
import { PixelBrushEngine, createDefaultPixelBrushParameters } from "./brush/pixel_brush_engine";
import { parseKritaPreset } from "./brush/kpp_parser";
import { parseKritaBundle } from "./brush/bundle_parser";
import {
  DEFAULT_STROKE_SMOOTHING_CONFIG,
  createStrokeSmoother,
  type IStrokeSmoother,
} from "./stroke/stroke_smoother";
import {
  SplineInterpolator,
  type SplineInterpolationMode,
} from "./stroke/spline_interpolator";

/**
 * Creates the default starter Studio Pen preset.
 */
export function createDefaultStudioPenPreset(): BrushPreset {
  const defaultParams = createDefaultPixelBrushParameters({
    baseSizePx: 24,
    spacingFraction: 0.12,
    baseOpacity: 1.0,
    brushTip: {
      tipType: "generated",
      diameter: 24,
      hardness: 0.85,
      aspectRatio: 1.0,
      angleRadians: 0.0,
    },
    sizeDynamics: {
      sensorInput: "pressure",
      curvePoints: [
        { inputValue: 0.0, outputValue: 0.15 },
        { inputValue: 1.0, outputValue: 1.0 },
      ],
      isEnabled: true,
    },
  });

  return {
    presetId: "default-studio-pen",
    displayName: "Studio Pen",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: defaultParams,
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "movingAverage",
      movingAverageWindowSize: 3,
    },
    tags: ["Inking", "Default"],
  };
}

/**
 * Creates the suite of built-in production presets:
 * Studio Pen, 6B Pencil, Soft Airbrush, and Hard Round.
 */
export function createDefaultPresets(): BrushPreset[] {
  const studioPen = createDefaultStudioPenPreset();

  const softAirbrush: BrushPreset = {
    presetId: "default-soft-airbrush",
    displayName: "Soft Airbrush",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: createDefaultPixelBrushParameters({
      baseSizePx: 50,
      spacingFraction: 0.08,
      baseOpacity: 0.6,
      brushTip: {
        tipType: "generated",
        diameter: 50,
        hardness: 0.0, // Gaussian falloff
        aspectRatio: 1.0,
        angleRadians: 0.0,
      },
      opacityDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.05 },
          { inputValue: 1.0, outputValue: 0.85 },
        ],
        isEnabled: true,
      },
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.4 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
    }),
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "movingAverage",
    },
    tags: ["Airbrush"],
  };

  const pencil6B: BrushPreset = {
    presetId: "default-6b-pencil",
    displayName: "6B Pencil",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: createDefaultPixelBrushParameters({
      baseSizePx: 14,
      spacingFraction: 0.15,
      baseOpacity: 0.85,
      brushTip: {
        tipType: "generated",
        diameter: 14,
        hardness: 0.45,
        aspectRatio: 1.0,
        angleRadians: 0.0,
      },
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.25 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      opacityDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.2 },
          { inputValue: 1.0, outputValue: 0.95 },
        ],
        isEnabled: true,
      },
    }),
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "none",
    },
    tags: ["Sketching"],
  };

  const hardRound: BrushPreset = {
    presetId: "default-hard-round",
    displayName: "Hard Round",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: createDefaultPixelBrushParameters({
      baseSizePx: 16,
      spacingFraction: 0.1,
      baseOpacity: 1.0,
      brushTip: {
        tipType: "generated",
        diameter: 16,
        hardness: 1.0,
        aspectRatio: 1.0,
        angleRadians: 0.0,
      },
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.2 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
    }),
    smoothingConfig: DEFAULT_STROKE_SMOOTHING_CONFIG,
    tags: ["Inking"],
  };

  return [studioPen, pencil6B, softAirbrush, hardRound];
}

export class DrawingAppEngine implements IDrawingEngine {
  private rasterTarget: IRasterTarget;
  private canvasElement: HTMLCanvasElement | null = null;
  private readonly pixelBrushEngine: PixelBrushEngine;
  private smoother: IStrokeSmoother;
  private readonly splineInterpolator: SplineInterpolator;
  private activeBrush: BrushPreset;
  private loadedPresets: BrushPreset[] = [];
  private lastPoint: StrokePoint | null = null;

  constructor(initialWidth = 2048, initialHeight = 2048) {
    this.rasterTarget = new MemoryRasterBuffer(initialWidth, initialHeight);
    const defaults = createDefaultPresets();
    this.loadedPresets = [...defaults];
    this.activeBrush = defaults[0];

    this.pixelBrushEngine = new PixelBrushEngine(
      this.rasterTarget,
      this.activeBrush.engineParameters as PixelBrushParameters
    );
    this.smoother = createStrokeSmoother(this.activeBrush.smoothingConfig);
    this.splineInterpolator = new SplineInterpolator("midpoint");
  }

  // --- Canvas Lifecycle ---

  public mountToCanvas(canvasElement: HTMLCanvasElement): void {
    this.canvasElement = canvasElement;
    this.rasterTarget = new Canvas2dRasterTarget(canvasElement);
    this.pixelBrushEngine.setRasterTarget(this.rasterTarget);
  }

  public unmount(): void {
    this.canvasElement = null;
    this.rasterTarget = new MemoryRasterBuffer(2048, 2048);
    this.pixelBrushEngine.setRasterTarget(this.rasterTarget);
  }

  // --- Brush Preset Management ---

  public async loadKritaPreset(kppFileBuffer: ArrayBuffer): Promise<BrushPreset> {
    const rawPreset = await parseKritaPreset(kppFileBuffer);
    const tagsWithImported = rawPreset.tags.includes("Imported")
      ? rawPreset.tags
      : [...rawPreset.tags, "Imported", "Krita"];

    const preset: BrushPreset = {
      ...rawPreset,
      tags: tagsWithImported,
    };

    const existingIndex = this.loadedPresets.findIndex((p) => p.presetId === preset.presetId);
    if (existingIndex >= 0) {
      this.loadedPresets[existingIndex] = preset;
    } else {
      this.loadedPresets.push(preset);
    }

    this.setActiveBrush(preset);
    return preset;
  }

  public async loadKritaBundle(
    bundleFileBuffer: ArrayBuffer,
    bundleFileName?: string
  ): Promise<readonly BrushPreset[]> {
    const fallbackName = bundleFileName ? bundleFileName.replace(/\.bundle$/i, "") : "Krita Bundle";
    const result = await parseKritaBundle(bundleFileBuffer, fallbackName);

    for (const preset of result.presets) {
      const existingIndex = this.loadedPresets.findIndex((p) => p.presetId === preset.presetId);
      if (existingIndex >= 0) {
        this.loadedPresets[existingIndex] = preset;
      } else {
        this.loadedPresets.push(preset);
      }
    }

    if (result.presets.length > 0) {
      this.setActiveBrush(result.presets[0]);
    }

    return result.presets;
  }

  public async loadAbrFile(_abrFileBuffer: ArrayBuffer): Promise<readonly BrushPreset[]> {
    // ABR parser placeholder
    return [];
  }

  public setActiveBrush(preset: BrushPreset): void {
    this.activeBrush = preset;
    if (preset.engineType === "pixelbrush") {
      this.pixelBrushEngine.setParameters(preset.engineParameters as PixelBrushParameters);
    }
    this.smoother = createStrokeSmoother(preset.smoothingConfig);
  }

  public getActiveBrush(): BrushPreset | null {
    return this.activeBrush;
  }

  public getLoadedPresets(): readonly BrushPreset[] {
    return this.loadedPresets;
  }

  // --- Active Stroke ---

  public beginStroke(point: StrokePoint): void {
    const smoothed = this.smoother.beginStroke(point);
    this.lastPoint = smoothed;
    this.splineInterpolator.beginStroke(smoothed);
    this.pixelBrushEngine.beginStroke(smoothed);
  }

  public extendStroke(point: StrokePoint): void {
    if (this.lastPoint) {
      const deltaX = point.canvasX - this.lastPoint.canvasX;
      const deltaY = point.canvasY - this.lastPoint.canvasY;
      if (deltaX * deltaX + deltaY * deltaY < 0.25) {
        return;
      }
    }

    const elapsedMs = this.lastPoint ? Math.max(1, point.timeMs - this.lastPoint.timeMs) : 16;
    const smoothed = this.smoother.smooth(point, elapsedMs);
    this.lastPoint = smoothed;

    const segments = this.splineInterpolator.pushPoint(smoothed);
    for (let index = 0; index < segments.length; index += 1) {
      this.pixelBrushEngine.paintBezierSegment(segments[index]);
    }
  }

  public endStroke(): void {
    this.smoother.endStroke();
    const finalSegments = this.splineInterpolator.endStroke();
    for (let index = 0; index < finalSegments.length; index += 1) {
      this.pixelBrushEngine.paintBezierSegment(finalSegments[index]);
    }
    this.pixelBrushEngine.endStroke();
    this.lastPoint = null;
  }

  public setSplineInterpolationMode(mode: SplineInterpolationMode): void {
    this.splineInterpolator.setMode(mode);
  }

  public getSplineInterpolationMode(): SplineInterpolationMode {
    return this.splineInterpolator.getMode();
  }

  // --- Real-time Brush Adjustments ---

  public setForegroundColor(r: number, g: number, b: number, a = 1.0): void {
    this.pixelBrushEngine.setForegroundColor(r, g, b, a);
  }

  public setBrushSize(sizePx: number): void {
    this.pixelBrushEngine.setBrushSize(sizePx);
  }

  public setBrushOpacity(opacityNormalized: number): void {
    this.pixelBrushEngine.setBrushOpacity(opacityNormalized);
  }

  public setBlendMode(blendMode: import("@/types/raster").BlendMode): void {
    this.pixelBrushEngine.setBlendMode(blendMode);
  }

  public setSmoothingConfig(config: StrokeSmoothingConfig): void {
    this.activeBrush = {
      ...this.activeBrush,
      smoothingConfig: config,
    };
    this.smoother = createStrokeSmoother(config);
  }

  public getSmoothingConfig(): StrokeSmoothingConfig {
    return this.activeBrush.smoothingConfig;
  }

  public setBrushHardness(hardness: number): void {
    this.pixelBrushEngine.setHardness(hardness);
    const params = this.activeBrush.engineParameters;
    if ("brushTip" in params && params.brushTip.tipType === "generated") {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          brushTip: {
            ...params.brushTip,
            hardness,
          },
        },
      };
    }
  }

  public getBrushHardness(): number {
    return this.pixelBrushEngine.getHardness();
  }

  public setBrushSpacing(spacingFraction: number): void {
    this.pixelBrushEngine.setSpacingFraction(spacingFraction);
    const params = this.activeBrush.engineParameters;
    if ("spacingFraction" in params) {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          spacingFraction,
        },
      };
    }
  }

  public getBrushSpacing(): number {
    return this.pixelBrushEngine.getSpacingFraction();
  }

  public setBrushFlow(flow: number): void {
    this.pixelBrushEngine.setFlow(flow);
    const params = this.activeBrush.engineParameters;
    if ("baseFlow" in params) {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          baseFlow: flow,
        },
      };
    }
  }

  public getBrushFlow(): number {
    return this.pixelBrushEngine.getFlow();
  }

  public setBrushAspectRatio(aspectRatio: number): void {
    this.pixelBrushEngine.setAspectRatio(aspectRatio);
    const params = this.activeBrush.engineParameters;
    if ("brushTip" in params && params.brushTip.tipType === "generated") {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          brushTip: {
            ...params.brushTip,
            aspectRatio,
          },
        },
      };
    }
  }

  public getBrushAspectRatio(): number {
    return this.pixelBrushEngine.getAspectRatio();
  }

  public setBrushAngle(angleRadians: number): void {
    this.pixelBrushEngine.setAngleRadians(angleRadians);
    const params = this.activeBrush.engineParameters;
    if ("brushTip" in params && params.brushTip.tipType === "generated") {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          brushTip: {
            ...params.brushTip,
            angleRadians,
          },
        },
      };
    }
  }

  public getBrushAngle(): number {
    return this.pixelBrushEngine.getAngleRadians();
  }

  public setSizeDynamicsEnabled(enabled: boolean): void {
    this.pixelBrushEngine.setSizeDynamicsEnabled(enabled);
    const params = this.activeBrush.engineParameters;
    if ("sizeDynamics" in params && params.sizeDynamics) {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          sizeDynamics: {
            ...params.sizeDynamics,
            isEnabled: enabled,
          },
        },
      };
    }
  }

  public setOpacityDynamicsEnabled(enabled: boolean): void {
    this.pixelBrushEngine.setOpacityDynamicsEnabled(enabled);
    const params = this.activeBrush.engineParameters;
    if ("opacityDynamics" in params && params.opacityDynamics) {
      this.activeBrush = {
        ...this.activeBrush,
        engineParameters: {
          ...params,
          opacityDynamics: {
            ...params.opacityDynamics,
            isEnabled: enabled,
          },
        },
      };
    }
  }

  // --- Canvas Configuration ---

  public setCanvasSize(widthPx: number, heightPx: number): void {
    if (this.canvasElement) {
      this.canvasElement.width = widthPx;
      this.canvasElement.height = heightPx;
      this.rasterTarget = new Canvas2dRasterTarget(this.canvasElement);
      this.pixelBrushEngine.setRasterTarget(this.rasterTarget);
    } else {
      this.rasterTarget = new MemoryRasterBuffer(widthPx, heightPx);
      this.pixelBrushEngine.setRasterTarget(this.rasterTarget);
    }
  }

  public clearCanvas(): void {
    this.rasterTarget.clear();
  }

  public getRasterTarget(): IRasterTarget {
    return this.rasterTarget;
  }
}
