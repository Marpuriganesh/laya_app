import { type FC, type ChangeEvent } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Copy,
  Trash2,
  Layers as LayersIcon,
} from "lucide-react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import type { LayerBlendMode } from "@/types/layer";

const BLEND_MODES: { value: LayerBlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
];

export const LayersPanelContent: FC = () => {
  const {
    layerStack,
    addLayer,
    deleteLayer,
    duplicateLayer,
    setActiveLayerId,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
    setLayerBlendMode,
  } = useDocumentStore();

  const activeLayer = layerStack.layers.find((l) => l.id === layerStack.activeLayerId) ?? layerStack.layers[0];

  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!activeLayer || activeLayer.isBackground) return;
    const opacityValue = parseFloat(e.target.value);
    setLayerOpacity(activeLayer.id, opacityValue);
  };

  const handleBlendModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!activeLayer || activeLayer.isBackground) return;
    setLayerBlendMode(activeLayer.id, e.target.value as LayerBlendMode);
  };

  const nonBackgroundCount = layerStack.layers.filter((l) => !l.isBackground).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none">
      {/* Top Controls Bar: Add Layer & Quick Action */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
        <span className="text-xs font-medium text-zinc-400">
          {layerStack.layers.length} Layers
        </span>

        <button
          type="button"
          onClick={addLayer}
          title="Add new layer"
          aria-label="Add new layer"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-300" />
          <span>New Layer</span>
        </button>
      </div>

      {/* Selected Layer Properties: Opacity & Blend Mode */}
      {activeLayer && !activeLayer.isBackground && (
        <div className="px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/30 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Opacity</span>
            <span className="font-mono text-zinc-200">
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={activeLayer.opacity}
            onChange={handleOpacityChange}
            aria-label="Layer opacity"
            className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-xs text-zinc-400">Blend Mode</span>
            <select
              value={activeLayer.blendMode}
              onChange={handleBlendModeChange}
              aria-label="Layer blend mode"
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 cursor-pointer focus:outline-none focus:border-zinc-500"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Layer Stack Item List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5">
        {layerStack.layers.map((layer) => {
          const isActive = layer.id === layerStack.activeLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayerId(layer.id)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? "bg-zinc-800/90 border border-zinc-700 shadow-sm"
                  : "bg-zinc-900/40 hover:bg-zinc-900/80 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    layer.isBackground ? "bg-zinc-800" : "bg-zinc-800/80 border border-zinc-700/60"
                  }`}
                >
                  <LayersIcon className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {layer.name}
                  </span>
                  {!layer.isBackground && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {layer.blendMode} • {Math.round(layer.opacity * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Action Controls for this layer */}
              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Visibility Toggle */}
                <button
                  type="button"
                  onClick={() => toggleLayerVisibility(layer.id)}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                  aria-label={layer.visible ? "Hide layer" : "Show layer"}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5 text-zinc-300" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                </button>

                {/* Lock Toggle (non-background only) */}
                {!layer.isBackground && (
                  <button
                    type="button"
                    onClick={() => toggleLayerLock(layer.id)}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                  >
                    {layer.locked ? (
                      <Lock className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-zinc-500 opacity-60 hover:opacity-100" />
                    )}
                  </button>
                )}

                {/* Duplicate Layer (non-background only) */}
                {!layer.isBackground && (
                  <button
                    type="button"
                    onClick={() => duplicateLayer(layer.id)}
                    title="Duplicate layer"
                    aria-label="Duplicate layer"
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                )}

                {/* Delete Layer (non-background only and when > 1 non-background layer) */}
                {!layer.isBackground && nonBackgroundCount > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteLayer(layer.id)}
                    title="Delete layer"
                    aria-label="Delete layer"
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
