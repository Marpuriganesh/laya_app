import { useState, type FC } from "react";
import {
  Layers,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import type { LayerBlendMode } from "@/types/layer";

interface LayersPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

const BLEND_MODES: { label: string; value: LayerBlendMode }[] = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
  { label: "Color Dodge", value: "color-dodge" },
  { label: "Color Burn", value: "color-burn" },
];

export const LayersPopover: FC<LayersPopoverProps> = ({ isOpen, onClose }) => {
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
    renameLayer,
  } = useDocumentStore();

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);

  const activeLayer = layerStack.layers.find((l) => l.id === layerStack.activeLayerId);

  const handleStartRename = (id: string, currentName: string) => {
    setEditingLayerId(id);
    setEditingName(currentName);
  };

  const handleFinishRename = (id: string) => {
    renameLayer(id, editingName);
    setEditingLayerId(null);
  };

  return (
    <FloatingWindowPanel
      title="Layers"
      icon={<Layers className="w-4 h-4 text-zinc-400" />}
      isOpen={isOpen}
      onClose={onClose}
      width={320}
      height={480}
      initialOffset={{ x: 0, y: 0 }}
      anchorClassName="fixed right-4 top-16"
      zIndex={40}
      allowPopout={true}
      headerActions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={addLayer}
            title="Create new layer"
            aria-label="Create new layer"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full bg-zinc-900/60 text-zinc-200">
        {/* Active Layer Properties Bar (Opacity & Blend Mode) */}
        {activeLayer && !activeLayer.isBackground && (
          <div className="px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAdjustments(!showAdjustments)}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
                <span>Adjustments</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider font-mono">
                  {activeLayer.blendMode}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {Math.round(activeLayer.opacity * 100)}%
                </span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => duplicateLayer(activeLayer.id)}
                  title="Duplicate Layer"
                  aria-label="Duplicate Layer"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteLayer(activeLayer.id)}
                  title="Delete Layer"
                  aria-label="Delete Layer"
                  disabled={layerStack.layers.filter((l) => !l.isBackground).length <= 1}
                  className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Collapsible Adjustments Drawer */}
            {showAdjustments && (
              <div className="pt-2 flex flex-col gap-2 border-t border-zinc-800/60 animate-in fade-in duration-100">
                {/* Opacity Slider */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-400">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(activeLayer.opacity * 100)}
                    onChange={(e) => setLayerOpacity(activeLayer.id, Number(e.target.value) / 100)}
                    className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-[11px] font-mono text-zinc-300 w-8 text-right">
                    {Math.round(activeLayer.opacity * 100)}%
                  </span>
                </div>

                {/* Blend Mode Selector */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">Blend Mode</span>
                  <select
                    value={activeLayer.blendMode}
                    onChange={(e) => setLayerBlendMode(activeLayer.id, e.target.value as LayerBlendMode)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          </div>
        )}

        {/* Procreate-Style Layer Stack List */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {layerStack.layers.map((layer) => {
            const isActive = layer.id === layerStack.activeLayerId;
            const isEditing = editingLayerId === layer.id;

            return (
              <div
                key={layer.id}
                onClick={() => setActiveLayerId(layer.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all cursor-pointer select-none ${
                  isActive
                    ? "bg-zinc-800/90 border-blue-500/60 shadow-sm"
                    : "bg-zinc-900/40 border-zinc-800/60 hover:bg-zinc-800/50 hover:border-zinc-700/60"
                }`}
              >
                {/* Visibility Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerVisibility(layer.id);
                  }}
                  title={layer.visible ? "Hide Layer" : "Show Layer"}
                  aria-label={layer.visible ? "Hide Layer" : "Show Layer"}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors"
                >
                  {layer.visible ? (
                    <Eye className="w-4 h-4 text-zinc-300" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-zinc-600" />
                  )}
                </button>

                {/* Layer Thumbnail Preview */}
                <div
                  className="w-10 h-10 rounded-lg border border-zinc-700/70 overflow-hidden flex items-center justify-center shrink-0 shadow-inner"
                  style={{
                    backgroundColor: layer.isBackground ? (layer.backgroundColor ?? "#ffffff") : "transparent",
                    backgroundImage: !layer.isBackground
                      ? "linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)"
                      : undefined,
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                  }}
                >
                  {layer.isBackground ? (
                    <div className="w-full h-full" style={{ backgroundColor: layer.backgroundColor }} />
                  ) : (
                    <span className="text-[10px] font-mono text-zinc-500">px</span>
                  )}
                </div>

                {/* Layer Name & Inline Rename */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleFinishRename(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFinishRename(layer.id);
                        if (e.key === "Escape") setEditingLayerId(null);
                      }}
                      className="w-full bg-zinc-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!layer.isBackground) {
                          handleStartRename(layer.id, layer.name);
                        }
                      }}
                      title="Double-click to rename"
                      className="flex items-center gap-1.5 truncate"
                    >
                      <span className={`text-xs font-medium truncate ${layer.visible ? "text-zinc-200" : "text-zinc-500"}`}>
                        {layer.name}
                      </span>
                      {layer.blendMode !== "normal" && (
                        <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
                          {layer.blendMode.slice(0, 3)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-500">
                    {layer.isBackground ? "Locked background" : `${Math.round(layer.opacity * 100)}% opacity`}
                  </div>
                </div>

                {/* Lock Indicator / Toggle */}
                {!layer.isBackground && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerLock(layer.id);
                    }}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {layer.locked ? (
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 opacity-0 hover:opacity-100" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </FloatingWindowPanel>
  );
};
