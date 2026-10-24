/**
 * Wasm Brush Bridge
 * Loads and orchestrates the compiled Rust `sketch_core` brush engine and multi-layer compositor in WebAssembly.
 * Powers the web browser canvas with identical midpoint quadratic Bézier splines,
 * multi-layer compositing, real brush tip raster masks, and seamless paper textures.
 */

import initWasm, { WasmBrushEngine } from "./pkg/sketch_core.js";
import wasmUrl from "./pkg/sketch_core_bg.wasm?url";
import type { StrokePoint } from "@/types/stroke";
import type { PullStringConfig, MovingAverageConfig } from "@/types/brush";

export interface WasmBrushConfig {
  diameter: number;
  spacing: number;
  softness: number;
  color: [number, number, number, number];
  opacity: number;
  flow: number;
  sizeByPressure: boolean;
  opacityByPressure: boolean;
  isErase: boolean;
  antialias: boolean;
}

export class WasmBrushBridge {
  private engine: WasmBrushEngine | null = null;
  private initPromise: Promise<boolean> | null = null;
  private isReady = false;
  private scratchBuffer: Uint8ClampedArray | null = null;
  private scratchBufferSize = 0;
  private flatEventsScratch: Float32Array = new Float32Array(96);

  private currentConfig: WasmBrushConfig = {
    diameter: 24,
    spacing: 0.12,
    softness: 0.45,
    color: [30, 30, 30, 255],
    opacity: 1.0,
    flow: 1.0,
    sizeByPressure: true,
    opacityByPressure: false,
    isErase: false,
    antialias: true,
  };

  /**
   * Initializes the WebAssembly module and allocates the initial canvas.
   */
  public async initialize(width = 2048, height = 2048): Promise<boolean> {
    if (this.isReady && this.engine) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await initWasm(wasmUrl);
        this.engine = new WasmBrushEngine(width, height);
        this.applyConfig();
        this.isReady = true;
        return true;
      } catch (err) {
        console.warn("WasmBrushBridge initialization fallback:", err);
        this.isReady = false;
        return false;
      }
    })();

    return this.initPromise;
  }

  public get ready(): boolean {
    return this.isReady && this.engine !== null;
  }

  /**
   * Resizes or re-initializes the internal Wasm canvas buffer.
   */
  public resizeCanvas(width: number, height: number, r = 255, g = 255, b = 255, a = 255): void {
    if (!this.engine) return;
    this.engine.init_canvas(width, height, r, g, b, a);
  }

  /**
   * Clears the internal active layer with an RGBA color.
   */
  public clear(r = 0, g = 0, b = 0, a = 0): void {
    if (!this.engine) return;
    this.engine.clear(r, g, b, a);
  }

  /**
   * Updates brush geometry and blending parameters.
   */
  public setBrushConfig(config: Partial<WasmBrushConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
    this.applyConfig();
  }

  /**
   * Sets the color blend mode (e.g. "normal", "multiply", "screen", "parallel", etc.).
   */
  public setBrushBlendMode(modeName: string): void {
    if (!this.engine) return;
    this.engine.set_brush_blend_mode(modeName);
  }

  /**
   * Sets a 256-sample lookup table for pressure response curve dynamics.
   */
  public setPressureLut(lut: Float32Array | number[]): void {
    if (!this.engine) return;
    const slice = lut instanceof Float32Array ? lut : new Float32Array(lut);
    this.engine.set_pressure_lut(slice);
  }

  /**
   * Configures the dynamic moving average stroke stabilizer.
   */
  public setMovingAverageConfig(config: MovingAverageConfig): void {
    if (!this.engine) return;
    this.engine.set_moving_average_config(
      config.enabled,
      config.windowSize,
      config.velocityMultiplier
    );
  }

  /**
   * Configures the dynamic pulled string (leash) stroke stabilizer.
   */
  public setPullStringConfig(config: PullStringConfig): void {
    if (!this.engine) return;
    this.engine.set_pull_string_config(
      config.enabled,
      config.maxStringLength,
      config.velocityMultiplier,
      config.catchUpSpeed,
      config.baseDeadzone,
      config.connectToTipOnRelease,
      config.pressureSmoothing ?? 0.35
    );
  }

  private applyConfig(): void {
    if (!this.engine) return;
    const c = this.currentConfig;
    this.engine.set_brush_config(
      c.diameter,
      c.spacing,
      c.softness,
      c.color[0],
      c.color[1],
      c.color[2],
      c.color[3],
      c.opacity,
      c.flow,
      c.sizeByPressure,
      c.opacityByPressure,
      c.isErase,
      c.antialias ?? true
    );
  }

  // ========================================================================
  // Multi-Layer Compositor Bridge
  // ========================================================================

  public addLayer(id: string, name: string): void {
    if (!this.engine) return;
    this.engine.add_layer(id, name);
  }

  public removeLayer(id: string): void {
    if (!this.engine) return;
    this.engine.remove_layer(id);
  }

  public duplicateLayer(sourceId: string, newId: string, newName: string): void {
    if (!this.engine) return;
    this.engine.duplicate_layer(sourceId, newId, newName);
  }

  public setActiveLayer(id: string): boolean {
    if (!this.engine) return false;
    return this.engine.set_active_layer(id);
  }

  public setLayerOpacity(id: string, opacity: number): boolean {
    if (!this.engine) return false;
    return this.engine.set_layer_opacity(id, opacity);
  }

  public setLayerBlendMode(id: string, modeName: string): boolean {
    if (!this.engine) return false;
    return this.engine.set_layer_blend_mode(id, modeName);
  }

  public setLayerVisibility(id: string, visible: boolean): boolean {
    if (!this.engine) return false;
    return this.engine.set_layer_visibility(id, visible);
  }

  public setBackgroundColor(r: number, g: number, b: number, a: number): void {
    if (!this.engine) return;
    this.engine.set_background_color(r, g, b, a);
  }

  public setBackgroundVisible(visible: boolean): void {
    if (!this.engine) return;
    this.engine.set_background_visible(visible);
  }

  // ========================================================================
  // Resource Management (Brush Tips & Patterns)
  // ========================================================================

  public registerTipGbr(id: string, bytes: Uint8Array): string {
    if (!this.engine) return "";
    try {
      return this.engine.register_tip_gbr(id, bytes);
    } catch {
      return "";
    }
  }

  public registerTipMask(
    id: string,
    name: string,
    width: number,
    height: number,
    mask: Uint8Array,
    invert = false
  ): void {
    if (!this.engine) return;
    this.engine.register_tip_mask(id, name, width, height, mask, invert);
  }

  public setBrushPredefinedTip(tipId: string | null, scale = 1.0, angleRadians = 0.0): boolean {
    if (!this.engine) return false;
    if (tipId) {
      return this.engine.set_brush_predefined_tip(tipId, scale, angleRadians);
    } else {
      this.engine.clear_brush_predefined_tip();
      return true;
    }
  }

  public registerPatternPat(id: string, bytes: Uint8Array): string {
    if (!this.engine) return "";
    try {
      return this.engine.register_pattern_pat(id, bytes);
    } catch {
      return "";
    }
  }

  public registerPatternGrayscale(
    id: string,
    name: string,
    width: number,
    height: number,
    bytes: Uint8Array
  ): void {
    if (!this.engine) return;
    this.engine.register_pattern_grayscale(id, name, width, height, bytes);
  }

  public registerPatternRgba(
    id: string,
    name: string,
    width: number,
    height: number,
    rgbaBytes: Uint8Array
  ): void {
    if (!this.engine) return;
    this.engine.register_pattern_rgba(id, name, width, height, rgbaBytes);
  }

  public setBrushTextureResource(
    patternId: string | null,
    scale = 1.0,
    modeStr = "multiply",
    strength = 1.0,
    invert = false,
    brightness = 0.0,
    contrast = 1.0,
    byPressure = false
  ): boolean {
    if (!this.engine) return false;
    if (patternId) {
      return this.engine.set_brush_texture_resource(
        patternId,
        scale,
        modeStr,
        strength,
        invert,
        brightness,
        contrast,
        byPressure
      );
    } else {
      this.engine.clear_brush_texture();
      return true;
    }
  }

  // ========================================================================
  // Stroke Execution
  // ========================================================================

  /**
   * Begins a new stroke at the given starting point.
   */
  public beginStroke(point: StrokePoint, ctx: CanvasRenderingContext2D): void {
    if (!this.engine) return;
    const pressure = typeof point.pressure === "number" ? Math.max(0.05, Math.min(1.0, point.pressure)) : 1.0;
    const timeSec = point.timeMs ? point.timeMs * 0.001 : 0.0;
    const dirty = this.engine.begin_stroke(point.canvasX, point.canvasY, pressure, timeSec);
    if (dirty) {
      this.blitDirtyRect(dirty, ctx);
    }
  }

  /**
   * Extends the stroke to the next point using continuous midpoint quadratic Bézier splines.
   */
  public extendStroke(point: StrokePoint, ctx: CanvasRenderingContext2D): void {
    if (!this.engine) return;
    const pressure = typeof point.pressure === "number" ? Math.max(0.05, Math.min(1.0, point.pressure)) : 1.0;
    const timeSec = point.timeMs ? point.timeMs * 0.001 : 0.0;
    const dirty = this.engine.paint_to(point.canvasX, point.canvasY, pressure, timeSec);
    if (dirty) {
      this.blitDirtyRect(dirty, ctx);
    }
  }

  /**
   * Paints a batch of coalesced pointer events in a single Wasm crossing for optimal frame throughput.
   */
  public extendStrokeBatch(points: readonly StrokePoint[], ctx: CanvasRenderingContext2D): void {
    if (!this.engine || points.length === 0) return;

    const requiredLen = points.length * 4;
    if (this.flatEventsScratch.length < requiredLen) {
      this.flatEventsScratch = new Float32Array(Math.max(requiredLen, this.flatEventsScratch.length * 2));
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const offset = i * 4;
      this.flatEventsScratch[offset] = p.canvasX;
      this.flatEventsScratch[offset + 1] = p.canvasY;
      this.flatEventsScratch[offset + 2] =
        typeof p.pressure === "number" ? Math.max(0.05, Math.min(1.0, p.pressure)) : 1.0;
      this.flatEventsScratch[offset + 3] = p.timeMs ? p.timeMs * 0.001 : 0.0;
    }

    const slice = this.flatEventsScratch.subarray(0, requiredLen);
    const dirty = this.engine.paint_batch(slice);
    if (dirty) {
      this.blitDirtyRect(dirty, ctx);
    }
  }

  /**
   * Finishes the stroke trajectory to the final event and clears trajectory state.
   */
  public finishStroke(ctx: CanvasRenderingContext2D): void {
    if (!this.engine) return;
    const dirty = this.engine.finish_stroke();
    if (dirty) {
      this.blitDirtyRect(dirty, ctx);
    }
  }

  /**
   * Completes the stroke and resets trajectory without stamping trailing dab.
   */
  public endStroke(): void {
    if (!this.engine) return;
    this.engine.end_stroke();
  }

  /**
   * Returns the current leading tip of the painted stroke [x, y] in canvas coordinates,
   * or null if no stroke is currently active.
   */
  public getSmoothedTip(): [number, number] | null {
    if (!this.engine) return null;
    const tip = this.engine.get_smoothed_tip();
    if (!tip || tip.length < 2) return null;
    return [tip[0], tip[1]];
  }

  /**
   * Blits only the modified sub-rectangle from Wasm memory into the Canvas2D context.
   */
  public blitDirtyRect(rect: Int32Array, ctx: CanvasRenderingContext2D): void {
    if (!this.engine) return;
    const [x, y, w, h] = rect;
    if (w <= 0 || h <= 0) return;

    const requiredBytes = w * h * 4;
    if (!this.scratchBuffer || this.scratchBufferSize < requiredBytes) {
      this.scratchBuffer = new Uint8ClampedArray(Math.max(requiredBytes, 128 * 128 * 4));
      this.scratchBufferSize = this.scratchBuffer.byteLength;
    }

    const subView = new Uint8ClampedArray(this.scratchBuffer.buffer as ArrayBuffer, 0, requiredBytes);
    const uint8View = new Uint8Array(this.scratchBuffer.buffer as ArrayBuffer, 0, requiredBytes);

    if (this.engine.copy_sub_rect(x, y, w, h, uint8View)) {
      const imgData = new ImageData(subView, w, h);
      ctx.putImageData(imgData, x, y);
    }
  }

  /**
   * Blits the entire composited canvas from Wasm into the 2D context.
   */
  public blitFullCanvas(ctx: CanvasRenderingContext2D): void {
    if (!this.engine) return;
    const w = this.engine.width();
    const h = this.engine.height();
    this.blitDirtyRect(new Int32Array([0, 0, w, h]), ctx);
  }
}

export const globalWasmBrushBridge = new WasmBrushBridge();
