import { useState, useEffect, useCallback, type FC } from "react";
import { SlidersHorizontal, Trash2, Activity, Spline, ChevronRight, Waves, PenLine } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { CurveEditor } from "@/ui/components/CurveEditor";
import { BrushScratchpad } from "@/ui/components/BrushScratchpad";
import type { BrushPreset } from "@/types/brush";

export interface BrushStudioContentProps {
  activeColor?: string;
}

export const BrushStudioContent: FC<BrushStudioContentProps> = ({ activeColor = "#18181b" }) => {
  const {
    brushSize,
    brushOpacity,
    setBrushSize,
    setBrushOpacity,
    globalPressureCurve,
    setGlobalPressureCurve,
    movingAverageConfig,
    setMovingAverageConfig,
    pullStringConfig,
    setPullStringConfig,
  } = useDocumentStore();

  const [activeBrush, setActiveBrush] = useState<BrushPreset | null>(() =>
    globalDrawingEngine.getActiveBrush?.()
  );

  const [softness, setSoftness] = useState(() => globalDrawingEngine.getBrushSoftness?.() ?? 0.45);
  const [spacing, setSpacing] = useState(() => (globalDrawingEngine.getBrushSpacing?.() ?? 0.08) * 100);
  const [flow, setFlow] = useState(() => (globalDrawingEngine.getBrushFlow?.() ?? 1.0) * 100);
  const [sizeDynamics, setSizeDynamics] = useState(() => globalDrawingEngine.getSizeDynamicsEnabled?.() ?? true);
  const [opacityDynamics, setOpacityDynamics] = useState(() => globalDrawingEngine.getOpacityDynamicsEnabled?.() ?? false);
  const [antialias, setAntialias] = useState(() => globalDrawingEngine.getAntialias?.() ?? true);

  const [isCurveOpen, setIsCurveOpen] = useState(false);

  const syncFromActiveBrush = useCallback(() => {
    const brush = globalDrawingEngine.getActiveBrush?.();
    setActiveBrush(brush);
    if (!brush) return;

    if (brush.engineParameters && brush.engineParameters.engineId === "pixelbrush") {
      const p = brush.engineParameters;
      if (typeof p.softness === "number") setSoftness(p.softness);
      if (typeof p.spacingFraction === "number") setSpacing(Math.round(p.spacingFraction * 100));
      if (typeof p.baseFlow === "number") setFlow(Math.round(p.baseFlow * 100));
      if (typeof p.baseSizePx === "number") setBrushSize(p.baseSizePx);
      if (typeof p.baseOpacity === "number") setBrushOpacity(p.baseOpacity);
      if (p.sizeDynamics) setSizeDynamics(p.sizeDynamics.isEnabled);
      if (p.opacityDynamics) setOpacityDynamics(p.opacityDynamics.isEnabled);
    }
  }, [setBrushSize, setBrushOpacity]);

  useEffect(() => {
    syncFromActiveBrush();
  }, [syncFromActiveBrush]);

  const handleSoftnessChange = (val: number) => {
    setSoftness(val);
    globalDrawingEngine.setBrushSoftness?.(val);
    globalDrawingEngine.updateActivePreset?.({ softness: val });
  };

  const handleSpacingChange = (valPercent: number) => {
    setSpacing(valPercent);
    const frac = valPercent / 100;
    globalDrawingEngine.setBrushSpacing?.(frac);
    globalDrawingEngine.updateActivePreset?.({ spacingFraction: frac });
  };

  const handleFlowChange = (valPercent: number) => {
    setFlow(valPercent);
    const fl = valPercent / 100;
    globalDrawingEngine.setBrushFlow?.(fl);
    globalDrawingEngine.updateActivePreset?.({ baseFlow: fl });
  };

  const handleSizeDynamicsToggle = (enabled: boolean) => {
    setSizeDynamics(enabled);
    globalDrawingEngine.setSizeDynamicsEnabled?.(enabled);
  };

  const handleOpacityDynamicsToggle = (enabled: boolean) => {
    setOpacityDynamics(enabled);
    globalDrawingEngine.setOpacityDynamicsEnabled?.(enabled);
  };

  const handleAntialiasToggle = (enabled: boolean) => {
    setAntialias(enabled);
    globalDrawingEngine.setAntialias?.(enabled);
  };

  const handleClear = () => {
    globalDrawingEngine.clearCanvas();
  };

  return (
    <div className="flex h-130 w-full overflow-hidden select-none">
      {/* Left Column: Scrollable Settings Inspector */}
      <div className="flex-1 p-4 flex flex-col gap-4 text-xs text-zinc-700 dark:text-zinc-200 overflow-y-auto border-r border-zinc-200 dark:border-white/5">
        {/* Active Brush Header */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {activeBrush?.displayName ?? "Studio Pen"}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {activeBrush?.tags?.join(" • ") ?? "Active Preset Parameters"}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shrink-0">
            Live Tuned
          </span>
        </div>
        {/* Brush Size */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Brush Size</span>
            <span className="font-mono text-zinc-500">{Math.round(brushSize)}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={300}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Master Opacity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Opacity</span>
            <span className="font-mono text-zinc-500">{Math.round(brushOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={1.0}
            step={0.01}
            value={brushOpacity}
            onChange={(e) => setBrushOpacity(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Tip Softness */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Softness / Radial Fade</span>
            <span className="font-mono text-zinc-500">{Math.round(softness * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.02}
            value={softness}
            onChange={(e) => handleSoftnessChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Dab Spacing */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Dab Spacing</span>
            <span className="font-mono text-zinc-500">{Math.round(spacing)}%</span>
          </div>
          <input
            type="range"
            min={2}
            max={100}
            value={spacing}
            onChange={(e) => handleSpacingChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Flow */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Flow Accumulation</span>
            <span className="font-mono text-zinc-500">{Math.round(flow)}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            value={flow}
            onChange={(e) => handleFlowChange(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Anti-Aliasing (Subpixel Smoothing) */}
        <label className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Anti-Aliasing</span>
            <span className="text-[10px] text-zinc-500">Smooth subpixel edges (disable for pixel art)</span>
          </div>
          <input
            type="checkbox"
            checked={antialias}
            onChange={(e) => handleAntialiasToggle(e.target.checked)}
            className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
          />
        </label>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Hardware Pressure Dynamics */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            Hardware Stylus Dynamics
          </span>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors">
            <span className="text-xs">Pressure &rarr; Size</span>
            <input
              type="checkbox"
              checked={sizeDynamics}
              onChange={(e) => handleSizeDynamicsToggle(e.target.checked)}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors">
            <span className="text-xs">Pressure &rarr; Opacity</span>
            <input
              type="checkbox"
              checked={opacityDynamics}
              onChange={(e) => handleOpacityDynamicsToggle(e.target.checked)}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          {/* Pressure Smoothing (Independent of spatial leash) */}
          <div className="flex flex-col gap-1 p-2 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Pressure Smoothing</span>
              <span className="font-mono text-zinc-500">{Math.round((pullStringConfig.pressureSmoothing ?? 0.35) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.90}
              step={0.02}
              value={pullStringConfig.pressureSmoothing ?? 0.35}
              onChange={(e) => setPullStringConfig({ pressureSmoothing: Number(e.target.value) })}
              className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              title="Smooths pressure transitions and filters out stylus pressure step jitter"
            />
            <div className="flex justify-between text-[9px] text-zinc-400">
              <span>0% (Raw 1:1)</span>
              <span>Hardware jitter filter</span>
              <span>90% (Silky)</span>
            </div>
          </div>

          {/* Collapsible Curve Editor for Brush Dynamics */}
          <button
            type="button"
            onClick={() => setIsCurveOpen(!isCurveOpen)}
            className="flex items-center justify-between p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Spline className="w-3.5 h-3.5 text-blue-500" />
              <span>Pressure Response Curve</span>
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${
                isCurveOpen ? "rotate-90" : ""
              }`}
            />
          </button>

          {isCurveOpen && (
            <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              <CurveEditor
                value={globalPressureCurve}
                onChange={setGlobalPressureCurve}
                width={360}
                height={160}
                inputLabel="Pressure"
                outputLabel="Response"
                showLiveTelemetry={true}
                showPresets={true}
              />
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Dynamic Moving Average (Line Art Smoothing) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <PenLine className="w-3.5 h-3.5 text-blue-500" />
              Moving Average (Line Art)
            </span>
            <input
              type="checkbox"
              checked={movingAverageConfig.enabled}
              onChange={(e) => setMovingAverageConfig({ enabled: e.target.checked })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              title="Toggle dynamic moving average line art smoothing"
            />
          </div>

          {movingAverageConfig.enabled && (
            <div className="flex flex-col gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              {/* Window Size */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Smoothing Window</span>
                  <span className="font-mono text-zinc-500">{movingAverageConfig.windowSize} samples</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={movingAverageConfig.windowSize}
                  onChange={(e) => setMovingAverageConfig({ windowSize: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Number of trajectory samples in the smoothing window"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>2 (Sharp)</span>
                  <span>Anti-jitter window</span>
                  <span>24 (Maximum)</span>
                </div>
              </div>

              {/* Dynamic Velocity Scaling */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Velocity Scaling</span>
                  <span className="font-mono text-zinc-500">{movingAverageConfig.velocityMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.0}
                  max={4.0}
                  step={0.1}
                  value={movingAverageConfig.velocityMultiplier}
                  onChange={(e) => setMovingAverageConfig({ velocityMultiplier: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Expands smoothing window on fast sweeps, contracts down for tight corners"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>0.0x (Fixed)</span>
                  <span>Contracts in corners</span>
                  <span>4.0x (Heavy)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Stroke Stabilization (Pull String) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-blue-500" />
              Pull String (Calligraphy)
            </span>
            <input
              type="checkbox"
              checked={pullStringConfig.enabled}
              onChange={(e) => setPullStringConfig({ enabled: e.target.checked })}
              className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              title="Toggle pull string stroke smoothing"
            />
          </div>

          {pullStringConfig.enabled && (
            <div className="flex flex-col gap-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-white/5 animate-in fade-in zoom-in-95 duration-100">
              {/* Max String Length */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Max String Length</span>
                  <span className="font-mono text-zinc-500">{pullStringConfig.maxStringLength}px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={2}
                  value={pullStringConfig.maxStringLength}
                  onChange={(e) => setPullStringConfig({ maxStringLength: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Maximum leash length in pixels at high velocity"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>10px (Agile)</span>
                  <span>Elastic leash</span>
                  <span>120px (Maximum)</span>
                </div>
              </div>

              {/* Velocity Multiplier */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Velocity Scaling</span>
                  <span className="font-mono text-zinc-500">{pullStringConfig.velocityMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6.0}
                  step={0.1}
                  value={pullStringConfig.velocityMultiplier}
                  onChange={(e) => setPullStringConfig({ velocityMultiplier: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="Expands leash length dynamically based on stroke speed"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>0.5x (Subtle)</span>
                  <span>Speed sensitivity</span>
                  <span>6.0x (Heavy)</span>
                </div>
              </div>

              {/* Catch-Up Speed */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Catch-Up Responsiveness</span>
                  <span className="font-mono text-zinc-500">{Math.round(pullStringConfig.catchUpSpeed * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.50}
                  step={0.01}
                  value={pullStringConfig.catchUpSpeed}
                  onChange={(e) => setPullStringConfig({ catchUpSpeed: Number(e.target.value) })}
                  className="w-full accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                  title="How fast the leash contracts to zero when slowing down into corners"
                />
                <div className="flex justify-between text-[9px] text-zinc-400">
                  <span>5% (Flowy)</span>
                  <span>Contracts in corners</span>
                  <span>50% (Instant)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

        {/* Clear Canvas Action */}
        <button
          type="button"
          onClick={handleClear}
          className="w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-98 transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Canvas Paper
        </button>
      </div>

      {/* Right Column: Embedded Live Scratchpad */}
      <div className="w-68 p-3 flex flex-col items-center justify-center bg-zinc-50/60 dark:bg-zinc-900/40 shrink-0">
        <BrushScratchpad
          activeColor={activeColor}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          softness={softness}
          spacing={spacing}
          sizeDynamics={sizeDynamics}
          opacityDynamics={opacityDynamics}
          width={248}
          height={460}
        />
      </div>
    </div>
  );
};

interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
  onDetach?: () => void;
}

export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  activeColor = "#18181b",
  onDetach,
}) => {
  return (
    <FloatingWindowPanel
      title="Brush Studio & Engine"
      icon={<SlidersHorizontal className="w-4 h-4 text-blue-500" />}
      isOpen={isOpen}
      onClose={onClose}
      width={720}
      height={540}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-4 top-16"
    >
      <BrushStudioContent activeColor={activeColor} />
    </FloatingWindowPanel>
  );
};
