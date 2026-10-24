/**
 * Rust Brush Bridge
 * Communicates with the native Rust Krita pixel brush engine running in Tauri.
 * Controls real-time brush parameters, color palettes, and modal interaction gating.
 */

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
  antialias?: boolean;
  blend_mode?: string;
  aspect_ratio?: number;
  angle_radians?: number;
  texture_by_pressure?: boolean;
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

  public async setBrushConfig(config: BrushConfigDto): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_config", { config });
    } catch (err) {
      console.warn("Failed to sync brush config to Rust:", err);
    }
  }

  public async setPressureLut(lut: Float32Array | number[]): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      const lutArray = Array.from(lut);
      await this.invokeFn("rust_brush_set_pressure_lut", { lut: lutArray });
    } catch (err) {
      console.warn("Failed to sync pressure LUT to Rust:", err);
    }
  }

  public async setMovingAverageConfig(config: {
    enabled: boolean;
    windowSize: number;
    velocityMultiplier: number;
  }): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_moving_average_config", {
        enabled: config.enabled,
        windowSize: config.windowSize,
        velocityMultiplier: config.velocityMultiplier,
      });
    } catch (err) {
      console.warn("Failed to sync moving average config to Rust:", err);
    }
  }

  public async setPullStringConfig(config: {
    enabled: boolean;
    maxStringLength: number;
    velocityMultiplier: number;
    catchUpSpeed: number;
    baseDeadzone: number;
    connectToTipOnRelease: boolean;
    pressureSmoothing?: number;
  }): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_pull_string_config", {
        enabled: config.enabled,
        maxStringLength: config.maxStringLength,
        velocityMultiplier: config.velocityMultiplier,
        catchUpSpeed: config.catchUpSpeed,
        baseDeadzone: config.baseDeadzone,
        connectToTipOnRelease: config.connectToTipOnRelease,
        pressureSmoothing: config.pressureSmoothing ?? 0.35,
      });
    } catch (err) {
      console.warn("Failed to sync pull string config to Rust:", err);
    }
  }

  public async setModalOpen(isOpen: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_modal_open", { isOpen });
    } catch (err) {
      console.warn("Failed to set modal open state:", err);
    }
  }

  public async updateArtboardRect(x: number, y: number, width: number, height: number): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_update_artboard_rect", { x, y, width, height });
    } catch (err) {
      console.warn("Failed to update artboard rect:", err);
    }
  }

  public async setPanActive(isPanning: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_pan_active", { isPanning });
    } catch (err) {
      console.warn("Failed to set pan active state:", err);
    }
  }

  public async setDocumentSize(width: number, height: number): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_set_document_size", { width, height });
    } catch (err) {
      console.warn("Failed to set document size:", err);
    }
  }

  public async setWorkspaceTheme(isDark: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_set_workspace_theme", { isDark, is_dark: isDark });
    } catch (err) {
      console.warn("Failed to set workspace theme:", err);
    }
  }

  public async setUiBlockingRects(rects: Array<[number, number, number, number]>): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_set_ui_blocking_rects", { rects });
    } catch (err) {
      console.warn("Failed to set UI blocking rects:", err);
    }
  }

  public async clearCanvas(fillColor?: [number, number, number, number]): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_clear", { fillColor });
    } catch (err) {
      console.warn("Failed to clear native canvas:", err);
    }
  }
}

export const globalRustBrushBridge = new RustBrushBridge();
