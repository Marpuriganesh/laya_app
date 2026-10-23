/**
 * Wasm Brush Bridge
 * Loads and orchestrates the compiled Rust `sketch_core` brush engine in WebAssembly.
 * Powers the web browser canvas with identical midpoint quadratic Bézier splines,
 * subpixel dab stepping, and analytical softness masks.
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
  public resizeCanvas(width: number, height: number, r = 0, g = 0, b = 0, a = 0): void {
    if (!this.engine) return;
    this.engine.init_canvas(width, height, r, g, b, a);
  }

  /**
   * Clears the internal Wasm canvas buffer with an RGBA color.
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
   * Sets a 256-sample lookup table for pressure response curve dynamics.
   */
  public setPressureLut(lut: Float32Array): void {
    if (!this.engine) return;
    this.engine.set_pressure_lut(lut);
  }

  /**
   * Sets dynamic moving average line art stroke stabilization configuration.
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
   * Sets dynamic pulled string (leash) stroke stabilization configuration.
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
   * Blits only the modified sub-rectangle from Wasm memory into the Canvas2D context.
   */
  private blitDirtyRect(rect: Int32Array, ctx: CanvasRenderingContext2D): void {
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
}

export const globalWasmBrushBridge = new WasmBrushBridge();
