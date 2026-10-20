/**
 * Rust Brush Bridge
 * Communicates with the native Rust Krita pixel brush engine running in Tauri.
 * Enables zero-overhead batch processing of coalesced 120Hz-240Hz stylus events
 * with Porter-Duff Over alpha compositing and analytical radial softness masks.
 */

import type { StrokePoint } from "@/types/stroke";

export interface DirtyUpdate {
  x: number;
  y: number;
  width: number;
  height: number;
  rgba_bytes: number[];
}

export interface BrushConfigDto {
  diameter: number;
  spacing: number;
  softness: number;
  color: [number, number, number, number];
  opacity: number;
  flow: number;
  size_by_pressure: boolean;
  opacity_by_pressure: boolean;
  is_erase: boolean;
}

export class RustBrushBridge {
  private isTauriCached: boolean | null = null;
  private isAvailable = false;
  private invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

  public async checkAvailability(): Promise<boolean> {
    if (this.isTauriCached !== null) return this.isAvailable;
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        this.invokeFn = invoke;
        this.isAvailable = true;
      }
    } catch {
      this.isAvailable = false;
    }
    this.isTauriCached = true;
    return this.isAvailable;
  }

  public get isEnabled(): boolean {
    return this.isAvailable;
  }

  public async init(width: number, height: number): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_init", { width, height });
    } catch (err) {
      console.warn("Rust brush init failed:", err);
    }
  }

  public async beginStroke(
    point: StrokePoint,
    config: BrushConfigDto
  ): Promise<DirtyUpdate | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    try {
      const eventDto = {
        x: point.canvasX,
        y: point.canvasY,
        pressure: typeof point.pressure === "number" ? Math.max(0.01, point.pressure) : 1.0,
        time: point.timeMs / 1000.0,
      };
      return (await this.invokeFn("rust_brush_begin_stroke", {
        event: eventDto,
        config,
      })) as DirtyUpdate | null;
    } catch (err) {
      console.warn("Rust begin stroke failed:", err);
      return null;
    }
  }

  public async paintCoalesced(points: StrokePoint[]): Promise<DirtyUpdate | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    if (points.length === 0) return null;
    try {
      const eventsDto = points.map((p) => ({
        x: p.canvasX,
        y: p.canvasY,
        pressure: typeof p.pressure === "number" ? Math.max(0.01, p.pressure) : 1.0,
        time: p.timeMs / 1000.0,
      }));
      return (await this.invokeFn("rust_brush_paint_coalesced", {
        events: eventsDto,
      })) as DirtyUpdate | null;
    } catch (err) {
      console.warn("Rust paint coalesced failed:", err);
      return null;
    }
  }

  public async endStroke(): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_end_stroke");
    } catch (err) {
      console.warn("Rust end stroke failed:", err);
    }
  }

  public blitDirtyUpdate(ctx: CanvasRenderingContext2D, update: DirtyUpdate): void {
    if (update.width <= 0 || update.height <= 0 || !update.rgba_bytes || update.rgba_bytes.length === 0) {
      return;
    }
    const clamped = new Uint8ClampedArray(update.rgba_bytes);
    const imgData = new ImageData(clamped, update.width, update.height);
    ctx.putImageData(imgData, update.x, update.y);
  }
}

export const globalRustBrushBridge = new RustBrushBridge();
