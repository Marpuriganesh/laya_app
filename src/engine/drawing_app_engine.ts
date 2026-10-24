/**
 * Drawing App Engine Facade
 * Clean, lightweight orchestrator connecting the UI presentation layer
 * with the drawing canvas.
 */

import type { BrushPreset, PixelBrushParameters, StrokeSmoothingConfig, PullStringConfig, MovingAverageConfig } from "@/types/brush";
import { DEFAULT_STROKE_SMOOTHING_CONFIG, DEFAULT_PULL_STRING_CONFIG, DEFAULT_MOVING_AVERAGE_CONFIG } from "@/types/brush";
import type { IDrawingEngine } from "@/types/engine";
import type { BlendMode, IRasterTarget } from "@/types/raster";
import type { StrokePoint } from "@/types/stroke";
import { Canvas2dRasterTarget } from "./raster/canvas2d_raster_target";
import { MemoryRasterBuffer } from "./raster/memory_raster_buffer";
import { parseKritaPreset } from "./brush/kpp_parser";
import { parseKritaBundle } from "./brush/bundle_parser";
import { globalRustBrushBridge } from "./brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "./wasm/wasm_brush_bridge";
import { generateCurveLookupTable256, type CurvePoint } from "./math/dynamics_curve";

/**
 * Creates default brush preset configuration.
 */
export function createDefaultStudioPenPreset(): BrushPreset {
  const defaultParams: PixelBrushParameters = {
    engineId: "pixelbrush",
    brushTip: {
      tipType: "generated",
      diameter: 24,
      hardness: 0.85,
      aspectRatio: 1.0,
      angleRadians: 0.0,
    },
    spacingFraction: 0.12,
    baseOpacity: 1.0,
    baseFlow: 1.0,
    baseSizePx: 24,
    softness: 0.15,
    scatterAmplitude: 0.0,
    isAirbrushMode: false,
    sizeDynamics: {
      sensorInput: "pressure",
      curvePoints: [
        { inputValue: 0.0, outputValue: 0.15 },
        { inputValue: 1.0, outputValue: 1.0 },
      ],
      isEnabled: true,
    },
    opacityDynamics: null,
    flowDynamics: null,
    angleDynamics: null,
    scatterDynamics: null,
  };

  return {
    presetId: "default-studio-pen",
    displayName: "Studio Pen",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: defaultParams,
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "movingAverage",
      movingAverage: {
        enabled: true,
        windowSize: 8,
        velocityMultiplier: 1.5,
      },
      pullString: {
        ...DEFAULT_PULL_STRING_CONFIG,
        enabled: false,
      },
    },
    tags: ["Inking", "Default"],
  };
}

export function createDefaultTechnicalPencilPreset(): BrushPreset {
  return {
    presetId: "default-technical-pencil",
    displayName: "Technical Pencil",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: {
      engineId: "pixelbrush",
      brushTip: {
        tipType: "generated",
        diameter: 8,
        hardness: 0.70,
        aspectRatio: 1.0,
        angleRadians: 0.0,
      },
      spacingFraction: 0.08,
      baseOpacity: 0.85,
      baseFlow: 0.9,
      baseSizePx: 8,
      softness: 0.30,
      scatterAmplitude: 0.0,
      isAirbrushMode: false,
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.3 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      opacityDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.2 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      flowDynamics: null,
      angleDynamics: null,
      scatterDynamics: null,
    },
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "movingAverage",
      movingAverage: {
        enabled: true,
        windowSize: 2,
        velocityMultiplier: 1.0,
      },
      pullString: {
        ...DEFAULT_PULL_STRING_CONFIG,
        enabled: false,
      },
    },
    tags: ["Pencils"],
  };
}

export function createDefaultSoftAirbrushPreset(): BrushPreset {
  return {
    presetId: "default-soft-airbrush",
    displayName: "Soft Airbrush",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: {
      engineId: "pixelbrush",
      brushTip: {
        tipType: "generated",
        diameter: 64,
        hardness: 0.10,
        aspectRatio: 1.0,
        angleRadians: 0.0,
      },
      spacingFraction: 0.08,
      baseOpacity: 0.70,
      baseFlow: 0.60,
      baseSizePx: 64,
      softness: 0.85,
      scatterAmplitude: 0.0,
      isAirbrushMode: true,
      sizeDynamics: null,
      opacityDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.1 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      flowDynamics: null,
      angleDynamics: null,
      scatterDynamics: null,
    },
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "none",
      movingAverage: {
        enabled: false,
        windowSize: 4,
        velocityMultiplier: 1.0,
      },
      pullString: {
        ...DEFAULT_PULL_STRING_CONFIG,
        enabled: false,
      },
    },
    tags: ["Airbrush"],
  };
}

export function createDefaultCalligraphyPenPreset(): BrushPreset {
  return {
    presetId: "default-calligraphy-pen",
    displayName: "Calligraphy Pen",
    engineType: "pixelbrush",
    thumbnailPngData: null,
    engineParameters: {
      engineId: "pixelbrush",
      brushTip: {
        tipType: "generated",
        diameter: 28,
        hardness: 0.90,
        aspectRatio: 0.60,
        angleRadians: 0.785, // 45 degrees
      },
      spacingFraction: 0.08,
      baseOpacity: 1.0,
      baseFlow: 1.0,
      baseSizePx: 28,
      softness: 0.10,
      scatterAmplitude: 0.0,
      isAirbrushMode: false,
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0.0, outputValue: 0.1 },
          { inputValue: 1.0, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      opacityDynamics: null,
      flowDynamics: null,
      angleDynamics: null,
      scatterDynamics: null,
    },
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "streamline",
      movingAverage: {
        enabled: false,
        windowSize: 4,
        velocityMultiplier: 1.0,
      },
      pullString: {
        ...DEFAULT_PULL_STRING_CONFIG,
        enabled: true,
        maxStringLength: 36,
        velocityMultiplier: 1.5,
        catchUpSpeed: 0.35,
      },
    },
    tags: ["Inking"],
  };
}

export function createDefaultPresets(): BrushPreset[] {
  return [
    createDefaultStudioPenPreset(),
  ];
}

export class DrawingAppEngine implements IDrawingEngine {
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rasterTarget: IRasterTarget;

  private loadedPresets: BrushPreset[] = [];
  private activeBrush: BrushPreset | null = null;

  private brushSize = 24;
  private brushOpacity = 1.0;
  private brushColor = { r: 30, g: 30, b: 30, a: 1.0 };
  private blendMode: BlendMode = "normal";

  private brushSoftness = 0.45;
  private brushSpacing = 0.08;
  private brushFlow = 1.0;
  private sizeByPressure = true;
  private opacityByPressure = false;
  private brushAntialias = true;

  private lastPoint: StrokePoint | null = null;
  private smoothingConfig: StrokeSmoothingConfig = { ...DEFAULT_STROKE_SMOOTHING_CONFIG };
  private movingAverageConfig: MovingAverageConfig = { ...DEFAULT_MOVING_AVERAGE_CONFIG };
  private pullStringConfig: PullStringConfig = { ...DEFAULT_PULL_STRING_CONFIG };

  constructor(widthPx = 2048, heightPx = 2048) {
    this.rasterTarget = new MemoryRasterBuffer(widthPx, heightPx);
    const defaults = createDefaultPresets();
    this.loadedPresets = [...defaults];
    this.activeBrush = defaults[0];
  }

  // --- Canvas Lifecycle ---

  public mountToCanvas(canvasElement: HTMLCanvasElement): void {
    this.canvasElement = canvasElement;
    this.ctx = canvasElement.getContext("2d", { willReadFrequently: true });
    this.rasterTarget = new Canvas2dRasterTarget(canvasElement);
    this.syncBrushConfigToRust();
    void globalWasmBrushBridge.initialize(canvasElement.width, canvasElement.height).then((success) => {
      if (success) {
        globalWasmBrushBridge.resizeCanvas(canvasElement.width, canvasElement.height, 0, 0, 0, 0);
        this.syncBrushConfigToRust();
      }
    });
  }

  public unmount(): void {
    this.canvasElement = null;
    this.ctx = null;
    this.rasterTarget = new MemoryRasterBuffer(2048, 2048);
  }

  // --- Brush Preset Management ---

  public async loadKritaPreset(kppFileBuffer: ArrayBuffer): Promise<BrushPreset> {
    const rawPreset = await parseKritaPreset(kppFileBuffer);
    const preset: BrushPreset = {
      ...rawPreset,
      tags: rawPreset.tags.includes("Imported") ? rawPreset.tags : [...rawPreset.tags, "Imported", "Krita"],
    };
    this.loadedPresets.push(preset);
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
      this.loadedPresets.push(preset);
    }
    if (result.presets.length > 0) {
      this.setActiveBrush(result.presets[0]);
    }
    return result.presets;
  }

  public async loadAbrFile(_abrFileBuffer: ArrayBuffer): Promise<readonly BrushPreset[]> {
    return [];
  }

  private onPresetChangedListener: ((preset: BrushPreset) => void) | null = null;

  public setOnPresetChangedListener(listener: ((preset: BrushPreset) => void) | null): void {
    this.onPresetChangedListener = listener;
  }

  public setActiveBrush(preset: BrushPreset): void {
    // If this preset exists in loadedPresets, use the persisted modified instance
    let existing = this.loadedPresets.find((p) => p.presetId === preset.presetId);
    if (!existing) {
      existing = preset;
      this.loadedPresets.push(preset);
    }
    const targetPreset = existing;

    this.activeBrush = targetPreset;
    this.smoothingConfig = targetPreset.smoothingConfig;

    if (targetPreset.engineParameters && targetPreset.engineParameters.engineId === "pixelbrush") {
      const p = targetPreset.engineParameters;
      if (typeof p.softness === "number") this.brushSoftness = p.softness;
      if (typeof p.spacingFraction === "number") this.brushSpacing = p.spacingFraction;
      if (typeof p.baseFlow === "number") this.brushFlow = p.baseFlow;
      if (typeof p.baseSizePx === "number") this.brushSize = p.baseSizePx;
      if (typeof p.baseOpacity === "number") this.brushOpacity = p.baseOpacity;
      if (p.sizeDynamics) this.sizeByPressure = p.sizeDynamics.isEnabled;
      if (p.opacityDynamics) this.opacityByPressure = p.opacityDynamics.isEnabled;
    }

    // Per-brush smoothing configuration
    if (targetPreset.smoothingConfig) {
      if (targetPreset.smoothingConfig.movingAverage) {
        this.movingAverageConfig = { ...targetPreset.smoothingConfig.movingAverage };
      } else {
        this.movingAverageConfig = {
          enabled: targetPreset.smoothingConfig.mode === "movingAverage",
          windowSize: targetPreset.smoothingConfig.movingAverageWindowSize ?? 8,
          velocityMultiplier: 1.5,
        };
      }

      if (targetPreset.smoothingConfig.pullString) {
        this.pullStringConfig = { ...targetPreset.smoothingConfig.pullString };
      } else {
        this.pullStringConfig = {
          ...DEFAULT_PULL_STRING_CONFIG,
          enabled: targetPreset.smoothingConfig.mode === "streamline",
        };
      }
    } else {
      this.movingAverageConfig = { ...DEFAULT_MOVING_AVERAGE_CONFIG };
      this.pullStringConfig = { ...DEFAULT_PULL_STRING_CONFIG };
    }

    this.syncBrushConfigToRust();

    if (this.onPresetChangedListener) {
      this.onPresetChangedListener(targetPreset);
    }
  }

  public updateActivePreset(
    updates: Partial<PixelBrushParameters>,
    smoothing?: Partial<StrokeSmoothingConfig>
  ): void {
    if (!this.activeBrush) return;

    if (this.activeBrush.engineParameters.engineId === "pixelbrush") {
      const currentParams = this.activeBrush.engineParameters;
      const updatedParams: PixelBrushParameters = {
        ...currentParams,
        ...updates,
      };

      if (typeof updates.softness === "number") this.brushSoftness = updates.softness;
      if (typeof updates.spacingFraction === "number") this.brushSpacing = updates.spacingFraction;
      if (typeof updates.baseFlow === "number") this.brushFlow = updates.baseFlow;
      if (typeof updates.baseSizePx === "number") this.brushSize = updates.baseSizePx;
      if (typeof updates.baseOpacity === "number") this.brushOpacity = updates.baseOpacity;
      if (updates.sizeDynamics !== undefined) {
        this.sizeByPressure = updates.sizeDynamics ? updates.sizeDynamics.isEnabled : false;
      }
      if (updates.opacityDynamics !== undefined) {
        this.opacityByPressure = updates.opacityDynamics ? updates.opacityDynamics.isEnabled : false;
      }

      if (smoothing?.movingAverage) {
        this.movingAverageConfig = { ...smoothing.movingAverage };
      }
      if (smoothing?.pullString) {
        this.pullStringConfig = { ...smoothing.pullString };
      }

      const updatedSmoothing: StrokeSmoothingConfig = {
        ...this.activeBrush.smoothingConfig,
        ...(smoothing ?? {}),
        movingAverage: this.movingAverageConfig,
        pullString: this.pullStringConfig,
        mode: this.pullStringConfig.enabled
          ? "streamline"
          : this.movingAverageConfig.enabled
          ? "movingAverage"
          : (smoothing?.mode ?? this.activeBrush.smoothingConfig?.mode ?? "none"),
      };

      const updatedPreset: BrushPreset = {
        ...this.activeBrush,
        engineParameters: updatedParams,
        smoothingConfig: updatedSmoothing,
      };

      this.activeBrush = updatedPreset;

      const idx = this.loadedPresets.findIndex((p) => p.presetId === updatedPreset.presetId);
      if (idx !== -1) {
        this.loadedPresets[idx] = updatedPreset;
      }

      this.syncBrushConfigToRust();
    }
  }

  public getActiveBrush(): BrushPreset | null {
    return this.activeBrush;
  }

  public getLoadedPresets(): readonly BrushPreset[] {
    return this.loadedPresets;
  }

  // --- Active Stroke Drawing ---

  public beginStroke(point: StrokePoint): void {
    this.lastPoint = point;
    if (!this.ctx) return;

    if (globalWasmBrushBridge.ready) {
      globalWasmBrushBridge.beginStroke(point, this.ctx);
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = this.blendMode === "erase" ? "destination-out" : "source-over";

    const rawP = typeof point.pressure === "number" ? point.pressure : 1.0;
    const pressure = Math.max(0.05, Math.min(1.0, rawP));
    const effectiveRadius = Math.max(1, (this.brushSize * pressure) / 2);

    ctx.fillStyle = `rgba(${this.brushColor.r}, ${this.brushColor.g}, ${this.brushColor.b}, ${this.brushOpacity * this.brushColor.a})`;
    ctx.beginPath();
    ctx.arc(point.canvasX, point.canvasY, effectiveRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  public extendStroke(point: StrokePoint): void {
    if (!this.lastPoint || !this.ctx) {
      this.beginStroke(point);
      return;
    }

    if (globalWasmBrushBridge.ready) {
      globalWasmBrushBridge.extendStroke(point, this.ctx);
      this.lastPoint = point;
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = this.blendMode === "erase" ? "destination-out" : "source-over";

    const p1P = typeof this.lastPoint.pressure === "number" ? Math.max(0.05, this.lastPoint.pressure) : 1.0;
    const p2P = typeof point.pressure === "number" ? Math.max(0.05, point.pressure) : 1.0;
    const avgPressure = (p1P + p2P) / 2;
    const effectiveWidth = Math.max(1, this.brushSize * avgPressure);

    ctx.strokeStyle = `rgba(${this.brushColor.r}, ${this.brushColor.g}, ${this.brushColor.b}, ${this.brushOpacity * this.brushColor.a})`;
    ctx.lineWidth = effectiveWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(this.lastPoint.canvasX, this.lastPoint.canvasY);
    ctx.lineTo(point.canvasX, point.canvasY);
    ctx.stroke();
    ctx.restore();

    this.lastPoint = point;
  }

  public extendStrokeBatch(points: readonly StrokePoint[]): void {
    if (!this.ctx || points.length === 0) return;

    if (globalWasmBrushBridge.ready) {
      globalWasmBrushBridge.extendStrokeBatch(points, this.ctx);
      this.lastPoint = points[points.length - 1];
      return;
    }

    for (const point of points) {
      this.extendStroke(point);
    }
  }

  public endStroke(): void {
    if (globalWasmBrushBridge.ready && this.ctx) {
      globalWasmBrushBridge.finishStroke(this.ctx);
    }
    this.lastPoint = null;
  }

  private syncBrushConfigToRust(): void {
    const rgb = [
      this.brushColor.r,
      this.brushColor.g,
      this.brushColor.b,
      Math.round(this.brushColor.a * 255),
    ] as [number, number, number, number];
    const isErase = this.blendMode === "erase";

    globalRustBrushBridge.setBrushConfig({
      diameter: this.brushSize,
      spacing: this.brushSpacing,
      softness: this.brushSoftness,
      color: rgb,
      opacity: this.brushOpacity,
      flow: this.brushFlow,
      size_by_pressure: this.sizeByPressure,
      opacity_by_pressure: this.opacityByPressure,
      is_erase: isErase,
      antialias: this.brushAntialias,
    });

    globalWasmBrushBridge.setBrushConfig({
      diameter: this.brushSize,
      spacing: this.brushSpacing,
      softness: this.brushSoftness,
      color: rgb,
      opacity: this.brushOpacity,
      flow: this.brushFlow,
      sizeByPressure: this.sizeByPressure,
      opacityByPressure: this.opacityByPressure,
      isErase,
      antialias: this.brushAntialias,
    });

    globalWasmBrushBridge.setMovingAverageConfig(this.movingAverageConfig);
    void globalRustBrushBridge.setMovingAverageConfig(this.movingAverageConfig);
    globalWasmBrushBridge.setPullStringConfig(this.pullStringConfig);
    void globalRustBrushBridge.setPullStringConfig(this.pullStringConfig);
  }

  private syncActivePresetEngineParams(updates: Partial<PixelBrushParameters>): void {
    if (!this.activeBrush || this.activeBrush.engineParameters.engineId !== "pixelbrush") return;
    const currentParams = this.activeBrush.engineParameters;
    const updatedParams: PixelBrushParameters = {
      ...currentParams,
      ...updates,
    };
    const updatedPreset: BrushPreset = {
      ...this.activeBrush,
      engineParameters: updatedParams,
    };
    this.activeBrush = updatedPreset;
    const idx = this.loadedPresets.findIndex((p) => p.presetId === updatedPreset.presetId);
    if (idx !== -1) {
      this.loadedPresets[idx] = updatedPreset;
    }
  }

  // --- Real-time Adjustments ---

  public setForegroundColor(r: number, g: number, b: number, a = 1.0): void {
    this.brushColor = { r, g, b, a };
    this.syncBrushConfigToRust();
  }

  public setBrushSize(sizePx: number): void {
    this.brushSize = Math.max(1, sizePx);
    this.syncActivePresetEngineParams({ baseSizePx: this.brushSize });
    this.syncBrushConfigToRust();
  }

  public getBrushSize(): number {
    return this.brushSize;
  }

  public getSmoothedTip(): [number, number] | null {
    return globalWasmBrushBridge.getSmoothedTip();
  }

  public setBrushOpacity(opacityNormalized: number): void {
    this.brushOpacity = Math.max(0, Math.min(1, opacityNormalized));
    this.syncActivePresetEngineParams({ baseOpacity: this.brushOpacity });
    this.syncBrushConfigToRust();
  }

  public setBlendMode(mode: BlendMode): void {
    this.blendMode = mode;
    this.syncBrushConfigToRust();
  }

  public setSmoothingConfig(config: StrokeSmoothingConfig): void {
    this.smoothingConfig = config;
    if (config.pullString) {
      this.setPullStringConfig(config.pullString);
    }
  }

  public getSmoothingConfig(): StrokeSmoothingConfig {
    return {
      ...this.smoothingConfig,
      pullString: this.pullStringConfig,
    };
  }

  private syncActivePresetSmoothing(updates: Partial<StrokeSmoothingConfig>): void {
    if (!this.activeBrush) return;
    const current = this.activeBrush.smoothingConfig ?? { ...DEFAULT_STROKE_SMOOTHING_CONFIG };
    const updatedSmoothing: StrokeSmoothingConfig = {
      ...current,
      ...updates,
      movingAverage: updates.movingAverage ?? this.movingAverageConfig,
      pullString: updates.pullString ?? this.pullStringConfig,
      mode: (updates.pullString?.enabled ?? this.pullStringConfig.enabled)
        ? "streamline"
        : (updates.movingAverage?.enabled ?? this.movingAverageConfig.enabled)
        ? "movingAverage"
        : (updates.mode ?? current.mode),
    };
    const updatedPreset: BrushPreset = {
      ...this.activeBrush,
      smoothingConfig: updatedSmoothing,
    };
    this.activeBrush = updatedPreset;
    const idx = this.loadedPresets.findIndex((p) => p.presetId === updatedPreset.presetId);
    if (idx !== -1) {
      this.loadedPresets[idx] = updatedPreset;
    }
  }

  public setMovingAverageConfig(config: MovingAverageConfig): void {
    this.movingAverageConfig = config;
    this.syncActivePresetSmoothing({ movingAverage: config });
    globalWasmBrushBridge.setMovingAverageConfig(config);
    void globalRustBrushBridge.setMovingAverageConfig(config);
  }

  public getMovingAverageConfig(): MovingAverageConfig {
    return this.movingAverageConfig;
  }

  public setPullStringConfig(config: PullStringConfig): void {
    this.pullStringConfig = config;
    this.syncActivePresetSmoothing({ pullString: config });
    globalWasmBrushBridge.setPullStringConfig(config);
    void globalRustBrushBridge.setPullStringConfig(config);
  }

  public getPullStringConfig(): PullStringConfig {
    return this.pullStringConfig;
  }

  public setSplineInterpolationMode(_mode: "catmullRom" | "midpoint"): void {}
  public getSplineInterpolationMode(): "catmullRom" | "midpoint" {
    return "midpoint";
  }

  public setBrushHardness(hardness: number): void {
    this.brushSoftness = Math.max(0, Math.min(1, 1.0 - hardness));
    this.syncActivePresetEngineParams({ softness: this.brushSoftness });
    this.syncBrushConfigToRust();
  }
  public getBrushHardness(): number {
    return 1.0 - this.brushSoftness;
  }
  public setBrushSoftness(softness: number): void {
    this.brushSoftness = Math.max(0, Math.min(1, softness));
    this.syncActivePresetEngineParams({ softness: this.brushSoftness });
    this.syncBrushConfigToRust();
  }
  public getBrushSoftness(): number {
    return this.brushSoftness;
  }
  public setBrushSpacing(spacingFraction: number): void {
    this.brushSpacing = Math.max(0.01, Math.min(2.0, spacingFraction));
    this.syncActivePresetEngineParams({ spacingFraction: this.brushSpacing });
    this.syncBrushConfigToRust();
  }
  public getBrushSpacing(): number {
    return this.brushSpacing;
  }
  public setBrushFlow(flow: number): void {
    this.brushFlow = Math.max(0.0, Math.min(1.0, flow));
    this.syncActivePresetEngineParams({ baseFlow: this.brushFlow });
    this.syncBrushConfigToRust();
  }
  public getBrushFlow(): number {
    return this.brushFlow;
  }
  public setBrushAspectRatio(_aspectRatio: number): void {}
  public getBrushAspectRatio(): number {
    return 1.0;
  }
  public setBrushAngle(_angleRadians: number): void {}
  public getBrushAngle(): number {
    return 0;
  }
  public setSizeDynamicsEnabled(enabled: boolean): void {
    this.sizeByPressure = enabled;
    if (this.activeBrush && this.activeBrush.engineParameters.engineId === "pixelbrush") {
      const current = this.activeBrush.engineParameters.sizeDynamics;
      this.syncActivePresetEngineParams({
        sizeDynamics: current
          ? { ...current, isEnabled: enabled }
          : { sensorInput: "pressure", curvePoints: [{ inputValue: 0, outputValue: 0.1 }, { inputValue: 1, outputValue: 1 }], isEnabled: enabled },
      });
    }
    this.syncBrushConfigToRust();
  }
  public getSizeDynamicsEnabled(): boolean {
    return this.sizeByPressure;
  }
  public setOpacityDynamicsEnabled(enabled: boolean): void {
    this.opacityByPressure = enabled;
    if (this.activeBrush && this.activeBrush.engineParameters.engineId === "pixelbrush") {
      const current = this.activeBrush.engineParameters.opacityDynamics;
      this.syncActivePresetEngineParams({
        opacityDynamics: current
          ? { ...current, isEnabled: enabled }
          : { sensorInput: "pressure", curvePoints: [{ inputValue: 0, outputValue: 0.1 }, { inputValue: 1, outputValue: 1 }], isEnabled: enabled },
      });
    }
    this.syncBrushConfigToRust();
  }
  public getOpacityDynamicsEnabled(): boolean {
    return this.opacityByPressure;
  }

  public setAntialias(enabled: boolean): void {
    this.brushAntialias = enabled;
    this.syncBrushConfigToRust();
  }
  public getAntialias(): boolean {
    return this.brushAntialias;
  }

  private pressureLut: Float32Array | null = null;

  public setPressureCurve(points: readonly CurvePoint[]): void {
    this.pressureLut = generateCurveLookupTable256(points);
    globalRustBrushBridge.setPressureLut(this.pressureLut);
    globalWasmBrushBridge.setPressureLut(this.pressureLut);
  }

  public getPressureLut(): Float32Array | null {
    return this.pressureLut;
  }

  public setCanvasSize(widthPx: number, heightPx: number): void {
    if (this.canvasElement) {
      this.canvasElement.width = widthPx;
      this.canvasElement.height = heightPx;
    }
    globalWasmBrushBridge.resizeCanvas(widthPx, heightPx, 0, 0, 0, 0);
  }

  public clearCanvas(): void {
    if (this.ctx && this.canvasElement) {
      this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }
    globalWasmBrushBridge.clear(0, 0, 0, 0);
    globalRustBrushBridge.clearCanvas();
  }

  public getRasterTarget(): IRasterTarget {
    return this.rasterTarget;
  }
}
