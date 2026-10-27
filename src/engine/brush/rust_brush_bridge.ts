/**
 * Rust Brush Bridge
 * Communicates with the native Rust Krita pixel brush engine and multi-layer compositor in Tauri.
 * Controls real-time brush parameters, color palettes, layers, resources, and persistent settings.
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

export interface ResourceItemDto {
  id: string;
  name: string;
  file_name: string;
  path: string;
  resource_type: string;
  file_size_bytes: number;
}

export interface AppSettingsDto {
  version: number;
  theme: string;
  last_brush_preset_id: string;
  brush_size: number;
  brush_opacity: number;
  active_color: string;
  moving_average_enabled: boolean;
  moving_average_window: number;
  moving_average_velocity_multiplier: number;
  pull_string_enabled: boolean;
  pull_string_radius: number;
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

  public async setDynamicsMapping(
    param: string,
    enabled: boolean,
    sensor: string,
    minOutput: number,
    maxOutput: number,
    lut: Float32Array | number[]
  ): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      const lutArray = Array.from(lut);
      await this.invokeFn("rust_brush_set_dynamics_mapping", {
        param,
        enabled,
        sensor,
        minOutput,
        maxOutput,
        lut: lutArray,
      });
    } catch (err) {
      console.warn("Failed to sync dynamics mapping to Rust:", err);
    }
  }

  public async setDynamicsCalculationMode(param: string, mode: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_dynamics_calculation_mode", { param, mode });
    } catch (err) {
      console.warn("Failed to set dynamics calculation mode in Rust:", err);
    }
  }

  public async clearDynamics(): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_clear_dynamics");
    } catch (err) {
      console.warn("Failed to clear dynamics in Rust:", err);
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

  public async setBrushBlendMode(mode: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_brush_set_blend_mode", { mode });
    } catch (err) {
      console.warn("Failed to set brush blend mode in Rust:", err);
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

  // ========================================================================
  // Multi-Layer Compositor Bridge
  // ========================================================================

  public async addLayer(id: string, name: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_add", { id, name });
    } catch (err) {
      console.warn("Failed to add layer in Rust:", err);
    }
  }

  public async addVectorLayer(id: string, name: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_add_vector", { id, name });
    } catch (err) {
      console.warn("Failed to add vector layer in Rust:", err);
    }
  }

  public async vectorEraseAt(
    id: string,
    x: number,
    y: number,
    radius: number,
    eraseToIntersection: boolean
  ): Promise<[number, number, number, number] | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    try {
      return (await this.invokeFn("rust_layer_vector_erase_at", {
        id,
        x,
        y,
        radius,
        eraseToIntersection,
        erase_to_intersection: eraseToIntersection,
      })) as [number, number, number, number] | null;
    } catch (err) {
      console.warn("Failed to erase vector at in Rust:", err);
      return null;
    }
  }

  public async adjustVectorLineWidth(
    id: string,
    factor: number
  ): Promise<[number, number, number, number] | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    try {
      return (await this.invokeFn("rust_layer_adjust_vector_line_width", {
        id,
        factor,
      })) as [number, number, number, number] | null;
    } catch (err) {
      console.warn("Failed to adjust vector line width in Rust:", err);
      return null;
    }
  }

  public async deleteLayer(id: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_delete", { id });
    } catch (err) {
      console.warn("Failed to delete layer in Rust:", err);
    }
  }

  public async duplicateLayer(sourceId: string, newId: string, newName: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_duplicate", {
        sourceId,
        source_id: sourceId,
        newId,
        new_id: newId,
        newName,
        new_name: newName,
      });
    } catch (err) {
      console.warn("Failed to duplicate layer in Rust:", err);
    }
  }

  public async setActiveLayer(id: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_active", { id });
    } catch (err) {
      console.warn("Failed to set active layer in Rust:", err);
    }
  }

  public async setLayerOpacity(id: string, opacity: number): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_opacity", { id, opacity });
    } catch (err) {
      console.warn("Failed to set layer opacity in Rust:", err);
    }
  }

  public async setLayerBlendMode(id: string, blendMode: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_blend_mode", {
        id,
        blendMode,
        blend_mode: blendMode,
      });
    } catch (err) {
      console.warn("Failed to set layer blend mode in Rust:", err);
    }
  }

  public async setLayerVisibility(id: string, visible: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_visibility", { id, visible });
    } catch (err) {
      console.warn("Failed to set layer visibility in Rust:", err);
    }
  }

  public async setLayerAlphaLock(id: string, locked: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_alpha_lock", { id, locked });
    } catch (err) {
      console.warn("Failed to set layer alpha lock in Rust:", err);
    }
  }

  public async setLayerClipped(id: string, clipped: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_clipped", { id, clipped });
    } catch (err) {
      console.warn("Failed to set layer clipping in Rust:", err);
    }
  }

  public async addLayerMask(id: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_add_mask", { id });
    } catch (err) {
      console.warn("Failed to add layer mask in Rust:", err);
    }
  }

  public async deleteLayerMask(id: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_delete_mask", { id });
    } catch (err) {
      console.warn("Failed to delete layer mask in Rust:", err);
    }
  }

  public async setLayerMaskEnabled(id: string, enabled: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_mask_enabled", { id, enabled });
    } catch (err) {
      console.warn("Failed to set layer mask enabled in Rust:", err);
    }
  }

  public async setLayerMaskInverted(id: string, inverted: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_mask_inverted", { id, inverted });
    } catch (err) {
      console.warn("Failed to set layer mask inverted in Rust:", err);
    }
  }

  public async setLayerEditTarget(id: string, target: string): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_set_edit_target", { id, target });
    } catch (err) {
      console.warn("Failed to set layer edit target in Rust:", err);
    }
  }

  public async reorderLayers(orderedIds: string[]): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_reorder", {
        orderedIds,
        ordered_ids: orderedIds,
      });
    } catch (err) {
      console.warn("Failed to reorder layers in Rust:", err);
    }
  }

  public async clearActiveLayer(): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_layer_clear_active", {});
    } catch (err) {
      console.warn("Failed to clear active layer in Rust:", err);
    }
  }

  public async setBackgroundColor(r: number, g: number, b: number, a: number): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_set_background_color", { r, g, b, a });
    } catch (err) {
      console.warn("Failed to set background color in Rust:", err);
    }
  }

  public async setBackgroundVisible(visible: boolean): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_set_background_visible", { visible });
    } catch (err) {
      console.warn("Failed to set background visibility in Rust:", err);
    }
  }

  // ========================================================================
  // Desktop Resource System (Disk Folder & Engine Bridge)
  // ========================================================================

  public async listResources(resourceType: "brushes" | "patterns" | "presets"): Promise<ResourceItemDto[]> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return [];
    try {
      return (await this.invokeFn("rust_resource_list", {
        resourceType,
        resource_type: resourceType,
      })) as ResourceItemDto[];
    } catch (err) {
      console.warn("Failed to list resources from Rust:", err);
      return [];
    }
  }

  public async readResourceFile(path: string): Promise<Uint8Array | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    try {
      const bytes = (await this.invokeFn("rust_resource_read_file", { path })) as number[];
      return new Uint8Array(bytes);
    } catch (err) {
      console.warn("Failed to read resource file from disk:", err);
      return null;
    }
  }

  public async openResourceFolder(resourceType: "brushes" | "patterns" | "presets"): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_resource_open_folder", {
        resourceType,
        resource_type: resourceType,
      });
    } catch (err) {
      console.warn("Failed to open resource folder:", err);
    }
  }

  public async registerTipGbr(id: string, bytes: Uint8Array | number[]): Promise<string> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return "";
    try {
      const byteArray = Array.from(bytes);
      return (await this.invokeFn("rust_resource_register_tip_gbr", { id, bytes: byteArray })) as string;
    } catch (err) {
      console.warn("Failed to register GBR tip in Rust:", err);
      return "";
    }
  }

  public async registerTipMask(
    id: string,
    name: string,
    width: number,
    height: number,
    mask: Uint8Array | number[],
    invert = false
  ): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      const maskArray = Array.from(mask);
      await this.invokeFn("rust_resource_register_tip_mask", {
        id,
        name,
        width,
        height,
        mask: maskArray,
        invert,
      });
    } catch (err) {
      console.warn("Failed to register tip mask in Rust:", err);
    }
  }

  public async setActiveTip(tipId: string | null, scale = 1.0, angleRadians = 0.0): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_resource_set_active_tip", {
        tipId,
        tip_id: tipId,
        scale,
        angleRadians,
        angle_radians: angleRadians,
      });
    } catch (err) {
      console.warn("Failed to set active tip in Rust:", err);
    }
  }

  public async registerPatternPat(id: string, bytes: Uint8Array | number[]): Promise<string> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return "";
    try {
      const byteArray = Array.from(bytes);
      return (await this.invokeFn("rust_resource_register_pattern_pat", { id, bytes: byteArray })) as string;
    } catch (err) {
      console.warn("Failed to register PAT pattern in Rust:", err);
      return "";
    }
  }

  public async registerPatternGrayscale(
    id: string,
    name: string,
    width: number,
    height: number,
    bytes: Uint8Array | number[]
  ): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      const byteArray = Array.from(bytes);
      await this.invokeFn("rust_resource_register_pattern_grayscale", {
        id,
        name,
        width,
        height,
        bytes: byteArray,
      });
    } catch (err) {
      console.warn("Failed to register pattern in Rust:", err);
    }
  }

  public async registerPatternRgba(
    id: string,
    name: string,
    width: number,
    height: number,
    rgbaBytes: Uint8Array | number[]
  ): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      const byteArray = Array.from(rgbaBytes);
      await this.invokeFn("rust_resource_register_pattern_rgba", {
        id,
        name,
        width,
        height,
        rgba_bytes: byteArray,
      });
    } catch (err) {
      console.warn("Failed to register RGBA pattern in Rust:", err);
    }
  }

  public async setActivePattern(
    patternId: string | null,
    scale = 1.0,
    mode = "multiply",
    strength = 1.0,
    invert = false,
    brightness = 0.0,
    contrast = 1.0,
    byPressure = false
  ): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_resource_set_active_pattern", {
        patternId,
        pattern_id: patternId,
        scale,
        mode,
        strength,
        invert,
        brightness,
        contrast,
        byPressure,
        by_pressure: byPressure,
      });
    } catch (err) {
      console.warn("Failed to set active pattern in Rust:", err);
    }
  }

  // ========================================================================
  // Persistent Settings Bridge (config.json)
  // ========================================================================

  public async loadSettings(): Promise<AppSettingsDto | null> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return null;
    try {
      return (await this.invokeFn("rust_settings_load", {})) as AppSettingsDto;
    } catch (err) {
      console.warn("Failed to load settings from Rust:", err);
      return null;
    }
  }

  public async saveSettings(settings: AppSettingsDto): Promise<void> {
    if (!(await this.checkAvailability()) || !this.invokeFn) return;
    try {
      await this.invokeFn("rust_settings_save", { settings });
    } catch (err) {
      console.warn("Failed to save settings to Rust:", err);
    }
  }
}

export const globalRustBrushBridge = new RustBrushBridge();
