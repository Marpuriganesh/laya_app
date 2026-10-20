import type { ActiveTool } from "@/types/ui";
import type { LayerStack } from "@/types/layer";

/**
 * Identifiers of all panels that can be detached into standalone windows.
 */
export type DetachablePanelId = "color" | "layers" | "brushLibrary" | "brushSettings";

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
  },
  layers: {
    panelId: "layers",
    title: "Layers",
    defaultWidth: 320,
    defaultHeight: 480,
    minWidth: 260,
    minHeight: 320,
  },
  brushLibrary: {
    panelId: "brushLibrary",
    title: "Brush Library",
    defaultWidth: 320,
    defaultHeight: 440,
    minWidth: 260,
    minHeight: 300,
  },
  brushSettings: {
    panelId: "brushSettings",
    title: "Brush Settings",
    defaultWidth: 320,
    defaultHeight: 440,
    minWidth: 260,
    minHeight: 300,
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
  | { readonly type: "SET_LAYER_STACK"; readonly layerStack: LayerStack };
