/**
 * Layer & Composite Stack Contracts (Single Source of Truth)
 * Plain Old Data (POD) structures for non-destructive layer hierarchies.
 */

export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn";

export interface LayerItem {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number; // 0.0 to 1.0
  readonly blendMode: LayerBlendMode;
  readonly locked: boolean;
  readonly isBackground?: boolean;
  readonly backgroundColor?: string;
  readonly thumbnailDataUrl?: string;
}

export interface LayerStack {
  readonly layers: readonly LayerItem[];
  readonly activeLayerId: string;
}

/** Creates a default layer stack (Layer 1 + Locked White Background) */
export function createDefaultLayerStack(): LayerStack {
  return {
    activeLayerId: "layer-1",
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        visible: true,
        opacity: 1.0,
        blendMode: "normal",
        locked: false,
      },
      {
        id: "background-layer",
        name: "Background color",
        visible: true,
        opacity: 1.0,
        blendMode: "normal",
        locked: true,
        isBackground: true,
        backgroundColor: "#ffffff",
      },
    ],
  };
}
