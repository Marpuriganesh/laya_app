/**
 * Krita-Style Texture & Paper Grain Inspector
 * Replicates Krita's KisTextureOption interface across 3 dedicated tabs:
 * 1. Texture: Full pattern catalog grid, search/filter, and high-res preview panel.
 * 2. Options: Texturing Mode, Scale, Brightness, Contrast, Neutral Point, Cutoff, and Offsets.
 * 3. Strength: Sensor selection (Pressure, Tilt, Speed, Fuzzy), interactive transfer curves, and blend math.
 */

import { useState, useEffect, useCallback, useMemo, type FC } from "react";
import {
  Waves,
  Search,
  Check,
} from "lucide-react";
import type { BrushTextureConfig, TextureBlendMode } from "@/types/brush";
import {
  BUILTIN_PATTERNS_CATALOG,
  type PatternResourceMeta,
  getPatternThumbnail,
  loadPatternBytes,
} from "@/engine/brush/builtin_resources";
import { CurveEditor } from "@/ui/components/CurveEditor";
import type { CurvePoint } from "@/engine/math/dynamics_curve";

export interface KritaTextureInspectorProps {
  textureConfig: BrushTextureConfig | null;
  onChange: (config: BrushTextureConfig | null) => void;
  className?: string;
}

type TextureSubTab = "texture" | "options" | "strength";

const TEXTURING_MODES: readonly { id: string; label: string }[] = [
  { id: "linear_height", label: "Linear Height" },
  { id: "multiply", label: "Multiply" },
  { id: "subtract", label: "Subtract" },
  { id: "add", label: "Add" },
  { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" },
  { id: "divide", label: "Divide" },
  { id: "darken", label: "Darken" },
  { id: "lighten", label: "Lighten" },
  { id: "parallel", label: "Parallel" },
];

const SENSOR_OPTIONS: readonly { id: string; label: string }[] = [
  { id: "pressure", label: "Pressure" },
  { id: "pressure_in", label: "PressureIn" },
  { id: "tangential", label: "Tangential pressure" },
  { id: "drawing_angle", label: "Drawing angle" },
  { id: "tilt_x", label: "X-Tilt" },
  { id: "tilt_y", label: "Y-Tilt" },
  { id: "tilt_direction", label: "Tilt direction" },
  { id: "tilt_elevation", label: "Tilt elevation" },
  { id: "rotation", label: "Rotation" },
  { id: "fuzzy_dab", label: "Fuzzy Dab" },
  { id: "fuzzy_stroke", label: "Fuzzy Stroke" },
  { id: "speed", label: "Speed" },
  { id: "fade", label: "Fade" },
  { id: "distance", label: "Distance" },
  { id: "time", label: "Time" },
];

const CURVE_PRESETS: readonly { id: string; label: string; points: CurvePoint[] }[] = [
  {
    id: "linear",
    label: "/",
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "inverse_linear",
    label: "\\",
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  {
    id: "s_curve",
    label: "S",
    points: [
      { x: 0, y: 0 },
      { x: 0.35, y: 0.15 },
      { x: 0.65, y: 0.85 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "ease_out",
    label: "⌒",
    points: [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.7 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "u_shape",
    label: "U",
    points: [
      { x: 0, y: 1 },
      { x: 0.5, y: 0.1 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "bell",
    label: "∩",
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
  },
];

export const KritaTextureInspector: FC<KritaTextureInspectorProps> = ({
  textureConfig,
  onChange,
  className = "",
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TextureSubTab>("texture");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [largePreviewUrl, setLargePreviewUrl] = useState<string>("");

  // Tag list
  const availableTags = useMemo(() => {
    const set = new Set<string>(["All"]);
    for (const p of BUILTIN_PATTERNS_CATALOG) {
      for (const t of p.tags) set.add(t);
    }
    return Array.from(set);
  }, []);

  // Filtered patterns list
  const filteredPatterns = useMemo(() => {
    return BUILTIN_PATTERNS_CATALOG.filter((p) => {
      const matchTag = selectedTag === "All" || p.tags.includes(selectedTag);
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.fileName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchTag && matchSearch;
    });
  }, [selectedTag, searchQuery]);

  // Load thumbnails
  useEffect(() => {
    let active = true;
    async function loadAllThumbnails() {
      const thumbs: Record<string, string> = {};
      for (const p of BUILTIN_PATTERNS_CATALOG) {
        try {
          const url = await getPatternThumbnail(p, 64);
          if (url && active) thumbs[p.id] = url;
        } catch {}
      }
      if (active) setThumbnails(thumbs);
    }
    loadAllThumbnails();
    return () => {
      active = false;
    };
  }, []);

  // Current active pattern meta
  const activeMeta = useMemo(() => {
    if (!textureConfig) return BUILTIN_PATTERNS_CATALOG[0];
    return (
      BUILTIN_PATTERNS_CATALOG.find((p) => p.id === textureConfig.patternId) ??
      BUILTIN_PATTERNS_CATALOG[0]
    );
  }, [textureConfig]);

  // Update large preview whenever active pattern changes
  useEffect(() => {
    let active = true;
    async function updateLargePreview() {
      if (!activeMeta) return;
      const url = await getPatternThumbnail(activeMeta, 256);
      if (active) setLargePreviewUrl(url);
    }
    updateLargePreview();
    return () => {
      active = false;
    };
  }, [activeMeta]);

  // Select pattern
  const handleSelectPattern = useCallback(
    async (meta: PatternResourceMeta) => {
      const loaded = await loadPatternBytes(meta);
      if (!loaded) return;

      const updated: BrushTextureConfig = {
        patternId: meta.id,
        name: meta.name,
        width: loaded.width,
        height: loaded.height,
        bytes: loaded.bytes,
        scale: textureConfig?.scale ?? 1.0,
        mode: textureConfig?.mode ?? "multiply",
        strength: textureConfig?.strength ?? 0.8,
        byPressure: textureConfig?.byPressure ?? true,
        brightness: textureConfig?.brightness ?? -0.25,
        contrast: textureConfig?.contrast ?? 1.3,
        neutralPoint: textureConfig?.neutralPoint ?? 0.5,
        cutoffLeft: textureConfig?.cutoffLeft ?? 0.0,
        cutoffRight: textureConfig?.cutoffRight ?? 1.0,
        cutoffPolicy: textureConfig?.cutoffPolicy ?? "disabled",
        offsetX: textureConfig?.offsetX ?? 0,
        offsetY: textureConfig?.offsetY ?? 0,
        randomOffset: textureConfig?.randomOffset ?? false,
        invert: textureConfig?.invert ?? false,
        softTexturing: textureConfig?.softTexturing ?? false,
        autoInvertForEraser: textureConfig?.autoInvertForEraser ?? true,
        texturingMode: textureConfig?.texturingMode ?? "linear_height",
        sensorInput: textureConfig?.sensorInput ?? "pressure",
        curveCalculationMode: textureConfig?.curveCalculationMode ?? "multiply",
      };

      onChange(updated);
    },
    [textureConfig, onChange]
  );

  // Update specific options
  const updateOption = useCallback(
    (patch: Partial<BrushTextureConfig>) => {
      if (!textureConfig) {
        if (BUILTIN_PATTERNS_CATALOG[0]) {
          handleSelectPattern(BUILTIN_PATTERNS_CATALOG[0]);
        }
        return;
      }
      onChange({ ...textureConfig, ...patch });
    },
    [textureConfig, onChange, handleSelectPattern]
  );

  const hasTexture = Boolean(textureConfig);

  return (
    <div className={`flex flex-col h-full w-full select-none text-zinc-200 text-xs ${className}`}>
      {/* Krita Sub-tab Navigation */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-zinc-900/90 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-950/70 p-0.5 rounded-lg border border-white/5">
          <button
            type="button"
            onClick={() => setActiveSubTab("texture")}
            className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
              activeSubTab === "texture"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Texture
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("options")}
            className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
              activeSubTab === "options"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Options
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("strength")}
            className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
              activeSubTab === "strength"
                ? "bg-zinc-800 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Strength
          </button>
        </div>

        {/* Enable / Disable Texture Checkbox */}
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={hasTexture}
            onChange={(e) => {
              if (!e.target.checked) onChange(null);
              else handleSelectPattern(activeMeta);
            }}
            className="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer"
          />
          <span className="font-semibold">Enable Texture</span>
        </label>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-4">
        {/* ========================================================================= */}
        {/* TAB 1: TEXTURE CATALOG (Image 1) */}
        {/* ========================================================================= */}
        {activeSubTab === "texture" && (
          <div className="flex flex-col gap-3">
            {/* Header: Selected Pattern Info */}
            <div className="px-3 py-2 rounded-lg bg-zinc-950/60 border border-white/5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-zinc-100 truncate text-xs">
                  {activeMeta.fileName}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {activeMeta.width} × {activeMeta.height} px • {activeMeta.tags.join(", ")}
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25">
                Active
              </span>
            </div>

            {/* Filter Bar: Tags & Search */}
            <div className="flex items-center gap-2">
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none cursor-pointer"
              >
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>

              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search textures..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-md pl-7 pr-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Split View: Left Thumbnails Grid + Right High-Res Preview */}
            <div className="grid grid-cols-2 gap-3 min-h-60">
              {/* Left: Patterns Thumbnail Grid */}
              <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto p-1 bg-zinc-950/40 rounded-lg border border-white/5">
                {filteredPatterns.map((pat) => {
                  const isSelected = activeMeta.id === pat.id;
                  return (
                    <button
                      key={pat.id}
                      type="button"
                      onClick={() => handleSelectPattern(pat)}
                      title={`${pat.name} (${pat.width}x${pat.height})`}
                      className={`relative aspect-square rounded-md overflow-hidden border transition-all cursor-pointer ${
                        isSelected
                          ? "border-blue-500 ring-2 ring-blue-500/40 shadow-sm"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {thumbnails[pat.id] ? (
                        <img
                          src={thumbnails[pat.id]}
                          alt={pat.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                          <Waves className="w-4 h-4 text-zinc-500" />
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check className="w-2 h-2 text-white stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right: High-Res Pattern Zoom Detail Preview */}
              <div className="flex flex-col gap-2 bg-zinc-950/60 p-2 rounded-lg border border-white/5 max-h-72">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Full Tile Preview
                </span>
                <div className="flex-1 w-full rounded overflow-hidden bg-black/60 border border-white/5 flex items-center justify-center relative">
                  {largePreviewUrl ? (
                    <img
                      src={largePreviewUrl}
                      alt={activeMeta.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-zinc-500 text-xs">Loading tile...</div>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 truncate text-center">
                  {activeMeta.name}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: OPTIONS (Image 2) */}
        {/* ========================================================================= */}
        {activeSubTab === "options" && (
          <div className="flex flex-col gap-3.5">
            {/* Texturing Mode & Soft Texturing */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-zinc-400 w-28 shrink-0 font-medium">Texturing Mode:</span>
                <select
                  value={textureConfig?.texturingMode ?? "linear_height"}
                  onChange={(e) => {
                    const mode = e.target.value;
                    const blendMode: TextureBlendMode =
                      mode === "subtract"
                        ? "subtract"
                        : mode === "add"
                        ? "add"
                        : mode === "screen"
                        ? "screen"
                        : "multiply";
                    updateOption({ texturingMode: mode, mode: blendMode });
                  }}
                  className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 cursor-pointer"
                >
                  {TEXTURING_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={textureConfig?.softTexturing ?? false}
                  onChange={(e) => updateOption({ softTexturing: e.target.checked })}
                  className="accent-blue-600 w-3.5 h-3.5 rounded"
                />
                <span>Soft texturing</span>
              </label>
            </div>

            {/* Pattern Scale */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 w-28 shrink-0 font-medium">Scale:</span>
              <input
                type="range"
                min={0.1}
                max={4.0}
                step={0.05}
                value={textureConfig?.scale ?? 1.0}
                onChange={(e) => updateOption({ scale: Number(e.target.value) })}
                className="flex-1 accent-blue-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="w-16 font-mono text-right text-zinc-200">
                {(textureConfig?.scale ?? 1.0).toFixed(2)}x
              </span>
            </div>

            {/* Brightness */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 w-28 shrink-0 font-medium">Brightness:</span>
              <input
                type="range"
                min={-1.0}
                max={1.0}
                step={0.02}
                value={textureConfig?.brightness ?? -0.27}
                onChange={(e) => updateOption({ brightness: Number(e.target.value) })}
                className="flex-1 accent-blue-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="w-16 font-mono text-right text-zinc-200">
                {(textureConfig?.brightness ?? -0.27).toFixed(2)}
              </span>
            </div>

            {/* Contrast */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 w-28 shrink-0 font-medium">Contrast:</span>
              <input
                type="range"
                min={0.0}
                max={3.0}
                step={0.05}
                value={textureConfig?.contrast ?? 1.29}
                onChange={(e) => updateOption({ contrast: Number(e.target.value) })}
                className="flex-1 accent-blue-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="w-16 font-mono text-right text-zinc-200">
                {(textureConfig?.contrast ?? 1.29).toFixed(2)}
              </span>
            </div>

            {/* Neutral point */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 w-28 shrink-0 font-medium">Neutral point:</span>
              <input
                type="range"
                min={0.0}
                max={1.0}
                step={0.02}
                value={textureConfig?.neutralPoint ?? 0.51}
                onChange={(e) => updateOption({ neutralPoint: Number(e.target.value) })}
                className="flex-1 accent-blue-600 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="w-16 font-mono text-right text-zinc-200">
                {(textureConfig?.neutralPoint ?? 0.51).toFixed(2)}
              </span>
            </div>

            {/* Cutoff Policy & Gradient Slider */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
              <span className="text-zinc-400 w-28 shrink-0 font-medium">Cutoff Policy:</span>
              <select
                value={textureConfig?.cutoffPolicy ?? "disabled"}
                onChange={(e) =>
                  updateOption({ cutoffPolicy: e.target.value as "disabled" | "below" | "above" })
                }
                className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 cursor-pointer"
              >
                <option value="disabled">Cut Off Disabled</option>
                <option value="below">Cut Off Below</option>
                <option value="above">Cut Off Above</option>
              </select>
            </div>

            {/* Dual Cutoff Gradient Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>Cutoff Left: {Math.round((textureConfig?.cutoffLeft ?? 0.0) * 100)}%</span>
                <span>Cutoff Right: {Math.round((textureConfig?.cutoffRight ?? 1.0) * 100)}%</span>
              </div>
              <div
                className="h-4 w-full rounded border border-white/10 relative overflow-hidden"
                style={{
                  background:
                    "linear-gradient(to right, #000000 0%, #7f7f7f 50%, #ffffff 100%)",
                }}
              />
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.0}
                  max={0.9}
                  step={0.02}
                  value={textureConfig?.cutoffLeft ?? 0.0}
                  onChange={(e) => updateOption({ cutoffLeft: Number(e.target.value) })}
                  title="Cutoff Left threshold"
                  className="flex-1 accent-blue-600 h-1 bg-zinc-800 rounded cursor-pointer"
                />
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.02}
                  value={textureConfig?.cutoffRight ?? 1.0}
                  onChange={(e) => updateOption({ cutoffRight: Number(e.target.value) })}
                  title="Cutoff Right threshold"
                  className="flex-1 accent-blue-600 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Horizontal & Vertical Offsets */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/5">
              <div className="flex flex-col gap-1">
                <span className="text-zinc-400 font-medium">Horizontal Offset:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={textureConfig?.offsetX ?? 0}
                    onChange={(e) => updateOption({ offsetX: Number(e.target.value) })}
                    className="w-20 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200"
                  />
                  <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={textureConfig?.randomOffset ?? false}
                      onChange={(e) => updateOption({ randomOffset: e.target.checked })}
                      className="accent-blue-600 w-3 h-3 rounded"
                    />
                    <span>Random</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-zinc-400 font-medium">Vertical Offset:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={textureConfig?.offsetY ?? 0}
                    onChange={(e) => updateOption({ offsetY: Number(e.target.value) })}
                    className="w-20 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200"
                  />
                  <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={textureConfig?.randomOffset ?? false}
                      onChange={(e) => updateOption({ randomOffset: e.target.checked })}
                      className="accent-blue-600 w-3 h-3 rounded"
                    />
                    <span>Random</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Toggles: Invert & Auto Invert For Eraser */}
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/5">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={textureConfig?.invert ?? false}
                  onChange={(e) => updateOption({ invert: e.target.checked })}
                  className="accent-blue-600 w-3.5 h-3.5 rounded"
                />
                <span>Invert Pattern</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={textureConfig?.autoInvertForEraser ?? true}
                  onChange={(e) => updateOption({ autoInvertForEraser: e.target.checked })}
                  className="accent-blue-600 w-3.5 h-3.5 rounded"
                />
                <span>Auto Invert For Eraser</span>
              </label>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: STRENGTH / DYNAMICS (Image 3) */}
        {/* ========================================================================= */}
        {activeSubTab === "strength" && (
          <div className="flex flex-col gap-3.5">
            {/* Master Strength Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-zinc-200">
                  Strength: {Math.round((textureConfig?.strength ?? 0.8) * 100)}%
                </span>
                <span className="font-mono text-zinc-400">
                  {((textureConfig?.strength ?? 0.8) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.0}
                max={1.0}
                step={0.02}
                value={textureConfig?.strength ?? 0.8}
                onChange={(e) => updateOption({ strength: Number(e.target.value) })}
                className="w-full accent-blue-600 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Enable Pen Settings Toggle */}
            <label className="flex items-center gap-2 cursor-pointer font-medium text-zinc-200 pt-1">
              <input
                type="checkbox"
                checked={textureConfig?.byPressure ?? true}
                onChange={(e) => updateOption({ byPressure: e.target.checked })}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              />
              <span>Enable Pen Settings</span>
            </label>

            {/* Split Sensor List & Curve Editor */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Sensor Selection Column */}
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto bg-zinc-950/60 p-1.5 rounded-lg border border-white/5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Sensors
                </span>
                {SENSOR_OPTIONS.map((s) => {
                  const isChecked = (textureConfig?.sensorInput ?? "pressure") === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => updateOption({ sensorInput: s.id })}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-colors cursor-pointer text-[11px] ${
                        isChecked
                          ? "bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/30"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="accent-blue-600 w-3 h-3 rounded pointer-events-none"
                      />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Curve Presets & Calculation Mode */}
              <div className="flex flex-col gap-2">
                {/* Curve Quick Presets */}
                <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-md border border-white/5">
                  {CURVE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => updateOption({ sensorCurvePoints: preset.points })}
                      title={preset.id}
                      className="flex-1 py-0.5 rounded text-xs font-mono font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Curve Editor Display */}
                <div className="flex-1 min-h-36 bg-zinc-950/70 rounded-lg border border-white/5 p-1 flex items-center justify-center">
                  <CurveEditor
                    value={
                      (textureConfig?.sensorCurvePoints as CurvePoint[]) ?? [
                        { x: 0, y: 0.1 },
                        { x: 0.5, y: 0.6 },
                        { x: 1, y: 1.0 },
                      ]
                    }
                    onChange={(pts) => updateOption({ sensorCurvePoints: pts })}
                    inputLabel="Input"
                    outputLabel="Strength"
                  />
                </div>

                {/* Calculation Mode */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Calculation mode:</span>
                  <select
                    value={textureConfig?.curveCalculationMode ?? "multiply"}
                    onChange={(e) =>
                      updateOption({
                        curveCalculationMode: e.target.value as "multiply" | "add" | "max" | "min",
                      })
                    }
                    className="bg-zinc-900 border border-white/10 rounded px-1.5 py-0.5 text-zinc-200 text-xs cursor-pointer"
                  >
                    <option value="multiply">Multiply</option>
                    <option value="add">Add</option>
                    <option value="max">Max</option>
                    <option value="min">Min</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
