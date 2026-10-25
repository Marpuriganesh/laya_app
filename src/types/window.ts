import type { ActiveTool } from "@/types/ui";
import type { LayerStack } from "@/types/layer";
import type { GamutMaskType } from "@/engine/color/gamut_mask";
import type { DiscreteWheelConfig } from "@/engine/color/discrete_wheel";

/**
 * Identifiers of all panels that can be detached into standalone windows.
 */
export type DetachablePanelId =
  | "color"
  | "layers"
  | "brushLibrary"
  | "brushSettings"
  | "colorGamut"
  | "colorGrid";

/**
 * Configuration descriptor for a detached window.
 */
export interface DetachedWindowConfig {
  readonly panelId: DetachablePanelId;
  readonly title: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

/**
 * Gamut mask state shared across windows.
 */
export interface GamutMaskConfiguration {
  readonly enabled: boolean;
  readonly type: GamutMaskType;
  readonly rotation: number;
  readonly opacity: number;
}

/**
 * Standard configuration presets for detachable panels.
 */
export const DETACHABLE_PANEL_CONFIGS: Record<DetachablePanelId, DetachedWindowConfig> = {
  color: {
    panelId: "color",
    title: "Color Studio",
    defaultWidth: 340,
    defaultHeight: 580,
    minWidth: 300,
    minHeight: 460,
    maxWidth: 680,
    maxHeight: 960,
  },
  layers: {
    panelId: "layers",
    title: "Layers",
    defaultWidth: 320,
    defaultHeight: 480,
    minWidth: 260,
    minHeight: 320,
    maxWidth: 540,
    maxHeight: 800,
  },
  brushLibrary: {
    panelId: "brushLibrary",
    title: "Brush Library",
    defaultWidth: 480,
    defaultHeight: 620,
    minWidth: 380,
    minHeight: 460,
    maxWidth: 720,
    maxHeight: 900,
  },
  brushSettings: {
    panelId: "brushSettings",
    title: "Brush Studio",
    defaultWidth: 720,
    defaultHeight: 540,
    minWidth: 580,
    minHeight: 420,
    maxWidth: 1080,
    maxHeight: 860,
  },
  colorGamut: {
    panelId: "colorGamut",
    title: "Gamut Mask",
    defaultWidth: 280,
    defaultHeight: 380,
    minWidth: 240,
    minHeight: 300,
    maxWidth: 500,
    maxHeight: 600,
  },
  colorGrid: {
    panelId: "colorGrid",
    title: "Discrete Grid Levels",
    defaultWidth: 280,
    defaultHeight: 340,
    minWidth: 240,
    minHeight: 280,
    maxWidth: 500,
    maxHeight: 600,
  },
};

/**
 * Snapshot payload of shared state between main window and detached windows.
 */
export interface WindowSyncPayload {
  readonly activeColor: string;
  readonly activeTool: ActiveTool;
  readonly brushSize: number;
  readonly brushOpacity: number;
  readonly layerStack: LayerStack;
  readonly gamutMask?: GamutMaskConfiguration;
  readonly wheelConfig?: DiscreteWheelConfig;
  readonly activePresetId?: string;
  readonly brushSoftness?: number;
  readonly brushSpacing?: number;
  readonly brushFlow?: number;
  readonly sizeDynamics?: boolean;
  readonly opacityDynamics?: boolean;
}

/**
 * Strongly typed messages for cross-window real-time synchronization.
 */
export type WindowSyncMessage =
  | { readonly type: "STATE_SYNC"; readonly payload: WindowSyncPayload }
  | { readonly type: "REQUEST_STATE_SYNC" }
  | { readonly type: "PANEL_DETACHED"; readonly panelId: DetachablePanelId }
  | { readonly type: "PANEL_REATTACHED"; readonly panelId: DetachablePanelId }
  | { readonly type: "PANEL_CLOSED"; readonly panelId: DetachablePanelId }
  | { readonly type: "SET_ACTIVE_COLOR"; readonly color: string }
  | { readonly type: "SET_ACTIVE_TOOL"; readonly tool: ActiveTool }
  | { readonly type: "SET_BRUSH_SIZE"; readonly size: number }
  | { readonly type: "SET_BRUSH_OPACITY"; readonly opacity: number }
  | { readonly type: "SET_ACTIVE_PRESET"; readonly presetId: string }
  | { readonly type: "SET_BRUSH_SETTINGS"; readonly softness: number; readonly spacing: number; readonly flow: number; readonly sizeDynamics: boolean; readonly opacityDynamics: boolean }
  | { readonly type: "SET_LAYER_STACK"; readonly layerStack: LayerStack }
  | { readonly type: "SET_GAMUT_MASK"; readonly gamutMask: GamutMaskConfiguration }
  | { readonly type: "SET_WHEEL_CONFIG"; readonly wheelConfig: DiscreteWheelConfig };
