import { useState, useEffect, type FC } from "react";
import { SlidersHorizontal, Trash2, Activity, Spline, ChevronRight } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { CurveEditor } from "@/ui/components/CurveEditor";

interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
  onDetach?: () => void;
}

export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  const {
    brushSize,
    brushOpacity,
    setBrushSize,
    setBrushOpacity,
    globalPressureCurve,
    setGlobalPressureCurve,
  } = useDocumentStore();

  const [softness, setSoftness] = useState(() => globalDrawingEngine.getBrushSoftness?.() ?? 0.45);
  const [spacing, setSpacing] = useState(() => (globalDrawingEngine.getBrushSpacing?.() ?? 0.08) * 100);
  const [flow, setFlow] = useState(() => (globalDrawingEngine.getBrushFlow?.() ?? 1.0) * 100);
  const [sizeDynamics, setSizeDynamics] = useState(() => globalDrawingEngine.getSizeDynamicsEnabled?.() ?? true);
  const [opacityDynamics, setOpacityDynamics] = useState(() => globalDrawingEngine.getOpacityDynamicsEnabled?.() ?? false);
  const [antialias, setAntialias] = useState(() => globalDrawingEngine.getAntialias?.() ?? true);
  const [isCurveOpen, setIsCurveOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSoftness(globalDrawingEngine.getBrushSoftness?.() ?? 0.45);
      setSpacing((globalDrawingEngine.getBrushSpacing?.() ?? 0.08) * 100);
      setFlow((globalDrawingEngine.getBrushFlow?.() ?? 1.0) * 100);
      setSizeDynamics(globalDrawingEngine.getSizeDynamicsEnabled?.() ?? true);
      setOpacityDynamics(globalDrawingEngine.getOpacityDynamicsEnabled?.() ?? false);
      setAntialias(globalDrawingEngine.getAntialias?.() ?? true);
    }
  }, [isOpen]);

  const handleSoftnessChange = (val: number) => {
    setSoftness(val);
    globalDrawingEngine.setBrushSoftness?.(val);
  };

  const handleSpacingChange = (valPercent: number) => {
    setSpacing(valPercent);
    globalDrawingEngine.setBrushSpacing?.(valPercent / 100);
  };

  const handleFlowChange = (valPercent: number) => {
    setFlow(valPercent);
    globalDrawingEngine.setBrushFlow?.(valPercent / 100);
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
    <FloatingWindowPanel
      title="Brush Studio & Engine"
      icon={<SlidersHorizontal className="w-4 h-4 text-blue-500" />}
      isOpen={isOpen}
      onClose={onClose}
      width={320}
      height={460}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-4 top-16"
    >
      <div className="p-4 flex flex-col gap-4 text-xs text-zinc-700 dark:text-zinc-200 select-none overflow-y-auto max-h-100">
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
                width={270}
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
    </FloatingWindowPanel>
  );
};
