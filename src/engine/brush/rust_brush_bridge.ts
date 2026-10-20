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

  public async setModalOpen(isOpen: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_modal_open", { isOpen });
    } catch (err) {
      console.warn("Failed to set modal open state:", err);
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
