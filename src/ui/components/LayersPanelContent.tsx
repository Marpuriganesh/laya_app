import { type FC, type ChangeEvent } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Copy,
  Layers as LayersIcon,
  Shield,
  ShieldCheck,
  CornerDownRight,
  CircleDot,
} from "lucide-react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import type { LayerBlendMode } from "@/types/layer";

const BLEND_MODES: { label: string; value: LayerBlendMode }[] = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Krita Parallel", value: "parallel" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
  { label: "Color Dodge", value: "color-dodge" },
  { label: "Color Burn", value: "color-burn" },
  { label: "Add", value: "add" },
  { label: "Subtract", value: "subtract" },
  { label: "Divide", value: "divide" },
  { label: "Hard Light", value: "hard-light" },
  { label: "Soft Light", value: "soft-light" },
  { label: "Difference", value: "difference" },
  { label: "Exclusion", value: "exclusion" },
];

export const LayersPanelContent: FC = () => {
  const {
    layerStack,
    setActiveLayerId,
    addLayer,
    duplicateLayer,
    deleteLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
    setLayerBlendMode,
    toggleLayerAlphaLock,
    toggleLayerClipping,
    addLayerMask,
    deleteLayerMask,
    setLayerEditTarget,
  } = useDocumentStore();

  const activeLayer = layerStack.layers.find(
    (l) => l.id === layerStack.activeLayerId
  );

  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!activeLayer || activeLayer.isBackground) return;
    setLayerOpacity(activeLayer.id, parseFloat(e.target.value));
  };

  const handleBlendModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!activeLayer || activeLayer.isBackground) return;
    setLayerBlendMode(activeLayer.id, e.target.value as LayerBlendMode);
  };

  const nonBackgroundCount = layerStack.layers.filter((l) => !l.isBackground).length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 select-none transition-colors">
      {/* Top Controls Bar: Add Layer & Quick Action */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-850/60 shrink-0">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {layerStack.layers.length} Layers
        </span>

        <button
          type="button"
          onClick={addLayer}
          title="Add new layer"
          aria-label="Add new layer"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
          <span>New Layer</span>
        </button>
      </div>

      {/* Selected Layer Properties: Opacity & Blend Mode */}
      {activeLayer && !activeLayer.isBackground && (
        <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-900/30 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
            <span>Opacity</span>
            <span className="font-mono text-zinc-800 dark:text-zinc-200">
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
            className="w-full accent-blue-500 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Blend Mode</span>
            <select
              value={activeLayer.blendMode}
              onChange={handleBlendModeChange}
              aria-label="Layer blend mode"
              className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-900 dark:text-zinc-200 cursor-pointer focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode.value} value={mode.value} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Action Toggles: Alpha Lock, Clipping Mask, Layer Mask */}
          <div className="flex items-center gap-1.5 mt-1 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
            <button
              type="button"
              onClick={() => toggleLayerAlphaLock(activeLayer.id)}
              title={activeLayer.alphaLocked ? "Disable Alpha Lock" : "Enable Alpha Lock (Lock Transparency)"}
              className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                activeLayer.alphaLocked
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400"
                  : "bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {activeLayer.alphaLocked ? (
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              ) : (
                <Shield className="w-3.5 h-3.5 opacity-60" />
              )}
              <span>Alpha Lock</span>
            </button>

            <button
              type="button"
              onClick={() => toggleLayerClipping(activeLayer.id)}
              title={activeLayer.isClipped ? "Release Clipping Mask" : "Clip to Layer Below"}
              className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-medium border transition-colors ${
                activeLayer.isClipped
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400"
                  : "bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>Clipping</span>
            </button>

            {activeLayer.mask ? (
              <button
                type="button"
                onClick={() => deleteLayerMask(activeLayer.id)}
                title="Remove Layer Mask"
                className="flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] font-medium border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <CircleDot className="w-3.5 h-3.5" />
                <span>Mask</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => addLayerMask(activeLayer.id)}
                title="Add Layer Mask"
                className="flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] font-medium border bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                <CircleDot className="w-3.5 h-3.5 opacity-60" />
                <span>+ Mask</span>
              </button>
            )}
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
                layer.isClipped ? "pl-5 ml-2 border-l-2 border-blue-500/50" : ""
              } ${
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700 shadow-sm"
                  : "bg-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-900/80 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {layer.isClipped && (
                  <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    layer.isBackground
                      ? "bg-zinc-200 dark:bg-zinc-800"
                      : "bg-zinc-200/80 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700/60"
                  }`}
                >
                  <LayersIcon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate">
                      {layer.name}
                    </span>
                    {layer.alphaLocked && (
                      <span title="Alpha Locked">
                        <ShieldCheck className="w-3 h-3 text-blue-500 shrink-0" />
                      </span>
                    )}
                  </div>
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
                {/* Layer Mask Toggle (if mask exists) */}
                {layer.mask && !layer.isBackground && (
                  <button
                    type="button"
                    onClick={() =>
                      setLayerEditTarget(
                        layer.id,
                        layer.activeTarget === "mask" ? "pixels" : "mask"
                      )
                    }
                    title={
                      layer.activeTarget === "mask"
                        ? "Currently editing Mask (click to edit pixels)"
                        : "Currently editing Pixels (click to edit mask)"
                    }
                    className={`p-1 rounded transition-colors ${
                      layer.activeTarget === "mask"
                        ? "text-amber-500 bg-amber-500/15"
                        : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <CircleDot className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Alpha Lock Quick Button (non-background only) */}
                {!layer.isBackground && (
                  <button
                    type="button"
                    onClick={() => toggleLayerAlphaLock(layer.id)}
                    title={layer.alphaLocked ? "Disable Alpha Lock" : "Enable Alpha Lock"}
                    aria-label="Toggle Alpha Lock"
                    className={`p-1 rounded transition-colors ${
                      layer.alphaLocked
                        ? "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                        : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {layer.alphaLocked ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* Visibility Toggle */}
                <button
                  type="button"
                  onClick={() => toggleLayerVisibility(layer.id)}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                  aria-label={layer.visible ? "Hide layer" : "Show layer"}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>

                {/* Lock Toggle (non-background only) */}
                {!layer.isBackground && (
                  <button
                    type="button"
                    onClick={() => toggleLayerLock(layer.id)}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors"
                  >
                    {layer.locked ? (
                      <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 opacity-60 hover:opacity-100" />
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
                    className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  </button>
                )}

                {/* Delete Layer (non-background only and when > 1 non-background layer) */}
                {!layer.isBackground && nonBackgroundCount > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteLayer(layer.id)}
                    title="Delete layer"
                    aria-label="Delete layer"
                    className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
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
