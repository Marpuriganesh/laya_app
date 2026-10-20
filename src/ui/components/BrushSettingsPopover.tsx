import { useState, useRef, useEffect, useCallback, type FC } from "react";
import {
  SlidersHorizontal,
  PenTool,
  RotateCw,
  Spline,
  Sparkles,
  Activity,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import type { BrushPreset, StrokeSmoothingConfig } from "@/types/brush";
import type { StrokePoint } from "@/types/stroke";

export type SplineInterpolationMode = "catmullRom" | "midpoint";

interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
}

type SettingsTab = "tip" | "stroke" | "stabilization" | "dynamics";

export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  activeColor = "#1e1e1e",
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("tip");

  // Local state for live sliders reflecting current active brush
  const [activeBrush, setActiveBrush] = useState<BrushPreset | null>(() =>
    globalDrawingEngine.getActiveBrush()
  );

  const [hardness, setHardness] = useState<number>(0.85);
  const [aspectRatio, setAspectRatio] = useState<number>(1.0);
  const [angleDegrees, setAngleDegrees] = useState<number>(0);
  const [spacingPercent, setSpacingPercent] = useState<number>(12);
  const [flowPercent, setFlowPercent] = useState<number>(100);

  const [splineMode, setSplineMode] = useState<SplineInterpolationMode>("midpoint");
  const [smoothingConfig, setSmoothingConfig] = useState<StrokeSmoothingConfig>(() =>
    globalDrawingEngine.getSmoothingConfig?.() ?? {
      mode: "movingAverage",
      streamlineStringRadiusPx: 4.0,
      streamlineBaseSmoothing: 0.15,
      streamlineMaxSmoothing: 0.5,
      streamlineVelocityThresholdPxPerSec: 600.0,
      movingAverageWindowSize: 3,
      predictiveLookAheadFrames: 2,
    }
  );

  const [sizeDynamicsEnabled, setSizeDynamicsEnabled] = useState<boolean>(true);
  const [opacityDynamicsEnabled, setOpacityDynamicsEnabled] = useState<boolean>(false);

  // Scratchpad interactive canvas refs
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isScratchDrawingRef = useRef(false);
  const lastScratchPointRef = useRef<StrokePoint | null>(null);

  // Synchronize state from global engine when opened or brush changes
  const syncFromActiveBrush = useCallback(() => {
    const brush = globalDrawingEngine.getActiveBrush();
    setActiveBrush(brush);
    if (!brush) return;

    const params = brush.engineParameters;
    if ("brushTip" in params && params.brushTip.tipType === "generated") {
      setHardness(params.brushTip.hardness);
      setAspectRatio(params.brushTip.aspectRatio);
      setAngleDegrees(Math.round((params.brushTip.angleRadians * 180) / Math.PI));
    }
    if ("spacingFraction" in params) {
      setSpacingPercent(Math.round(params.spacingFraction * 100));
    }
    if ("baseFlow" in params) {
      setFlowPercent(Math.round(params.baseFlow * 100));
    }
    if (globalDrawingEngine.getSplineInterpolationMode) {
      setSplineMode(globalDrawingEngine.getSplineInterpolationMode());
    }
    if (brush.smoothingConfig) {
      setSmoothingConfig(brush.smoothingConfig);
    }
    if ("sizeDynamics" in params && params.sizeDynamics) {
      setSizeDynamicsEnabled(params.sizeDynamics.isEnabled);
    }
    if ("opacityDynamics" in params && params.opacityDynamics) {
      setOpacityDynamicsEnabled(params.opacityDynamics.isEnabled);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      syncFromActiveBrush();
    }
  }, [isOpen, syncFromActiveBrush]);

  // Handlers for Slider changes with live updates to globalDrawingEngine
  const handleHardnessChange = (newVal: number) => {
    setHardness(newVal);
    globalDrawingEngine.setBrushHardness?.(newVal);
  };

  const handleAspectRatioChange = (newVal: number) => {
    setAspectRatio(newVal);
    globalDrawingEngine.setBrushAspectRatio?.(newVal);
  };

  const handleAngleChange = (newVal: number) => {
    setAngleDegrees(newVal);
    globalDrawingEngine.setBrushAngle?.((newVal * Math.PI) / 180);
  };

  const handleSpacingChange = (newVal: number) => {
    setSpacingPercent(newVal);
    globalDrawingEngine.setBrushSpacing?.(newVal / 100);
  };

  const handleFlowChange = (newVal: number) => {
    setFlowPercent(newVal);
    globalDrawingEngine.setBrushFlow?.(newVal / 100);
  };

  const handleSplineModeChange = (mode: SplineInterpolationMode) => {
    setSplineMode(mode);
    globalDrawingEngine.setSplineInterpolationMode?.(mode);
  };

  const handleSmoothingModeChange = (mode: StrokeSmoothingConfig["mode"]) => {
    const nextConfig: StrokeSmoothingConfig = {
      ...smoothingConfig,
      mode,
    };
    setSmoothingConfig(nextConfig);
    globalDrawingEngine.setSmoothingConfig(nextConfig);
  };

  const handleMovingAverageWindowChange = (windowSize: number) => {
    const nextConfig: StrokeSmoothingConfig = {
      ...smoothingConfig,
      movingAverageWindowSize: windowSize,
    };
    setSmoothingConfig(nextConfig);
    globalDrawingEngine.setSmoothingConfig(nextConfig);
  };

  const handleStreamlineSmoothingChange = (smoothing: number) => {
    const nextConfig: StrokeSmoothingConfig = {
      ...smoothingConfig,
      streamlineBaseSmoothing: smoothing * 0.5,
      streamlineMaxSmoothing: smoothing,
    };
    setSmoothingConfig(nextConfig);
    globalDrawingEngine.setSmoothingConfig(nextConfig);
  };

  const handleSizeDynamicsToggle = (enabled: boolean) => {
    setSizeDynamicsEnabled(enabled);
    globalDrawingEngine.setSizeDynamicsEnabled?.(enabled);
  };

  const handleOpacityDynamicsToggle = (enabled: boolean) => {
    setOpacityDynamicsEnabled(enabled);
    globalDrawingEngine.setOpacityDynamicsEnabled?.(enabled);
  };

  const handleResetDefaults = () => {
    syncFromActiveBrush();
    handleClearScratchpad();
  };

  // Scratchpad drawing handlers
  const handleScratchPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const canvas = scratchCanvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pointerType === "mouse" ? 1.0 : e.pressure > 0 ? e.pressure : 1.0;

    const strokePoint: StrokePoint = {
      canvasX: x,
      canvasY: y,
      pressure,
      tiltX: e.tiltX ?? 0,
      tiltY: e.tiltY ?? 0,
      rotation: 0,
      speed: 0,
      timeMs: e.timeStamp ?? Date.now(),
    };

    isScratchDrawingRef.current = true;
    lastScratchPointRef.current = strokePoint;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = activeColor;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, 8 * pressure), 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handleScratchPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!isScratchDrawingRef.current) return;
    const canvas = scratchCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pointerType === "mouse" ? 1.0 : e.pressure > 0 ? e.pressure : 1.0;

    const strokePoint: StrokePoint = {
      canvasX: x,
      canvasY: y,
      pressure,
      tiltX: e.tiltX ?? 0,
      tiltY: e.tiltY ?? 0,
      rotation: 0,
      speed: 0,
      timeMs: e.timeStamp ?? Date.now(),
    };

    const ctx = canvas.getContext("2d");
    if (ctx && lastScratchPointRef.current) {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = Math.max(1, 16 * pressure);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lastScratchPointRef.current.canvasX, lastScratchPointRef.current.canvasY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastScratchPointRef.current = strokePoint;
  };

  const handleScratchPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!isScratchDrawingRef.current) return;
    isScratchDrawingRef.current = false;
    lastScratchPointRef.current = null;
  };

  const handleClearScratchpad = () => {
    const canvas = scratchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <FloatingWindowPanel
      title="Brush Settings"
      icon={<SlidersHorizontal className="w-4 h-4 text-zinc-400" />}
      isOpen={isOpen}
      onClose={onClose}
      width={410}
      height={640}
      initialOffset={{ x: 0, y: 0 }}
      anchorClassName="fixed right-24 top-16"
      zIndex={45}
      allowPopout={true}
      headerActions={
        <button
          type="button"
          onClick={handleResetDefaults}
          title="Reset brush to preset defaults"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="flex flex-col h-full bg-zinc-950 text-zinc-200 select-none overflow-hidden text-xs">
        {/* Preset Name & Active Tag Header */}
        <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-zinc-100 truncate">
              {activeBrush?.displayName ?? "Studio Pen"}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 border border-zinc-700/60 text-zinc-300">
            {activeBrush?.tags[0] ?? "Preset"}
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 border-b border-zinc-800 bg-zinc-900/40 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("tip")}
            className={`py-2 px-1 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
              activeTab === "tip"
                ? "border-sky-500 text-sky-400 font-semibold bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <PenTool className="w-3 h-3" />
            <span>Tip</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stroke")}
            className={`py-2 px-1 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
              activeTab === "stroke"
                ? "border-sky-500 text-sky-400 font-semibold bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Spacing</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stabilization")}
            className={`py-2 px-1 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
              activeTab === "stabilization"
                ? "border-sky-500 text-sky-400 font-semibold bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Spline className="w-3 h-3" />
            <span>Spline</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dynamics")}
            className={`py-2 px-1 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
              activeTab === "dynamics"
                ? "border-sky-500 text-sky-400 font-semibold bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Dynamics</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: TIP & SHAPE */}
          {activeTab === "tip" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Hardness */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300">Hardness / Softness</span>
                  <span className="font-mono text-zinc-400">{Math.round(hardness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={hardness}
                  onChange={(e) => handleHardnessChange(parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Soft Gaussian (0%)</span>
                  <span>Crisp Anti-Aliased (100%)</span>
                </div>
              </div>

              {/* Roundness / Aspect Ratio */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300">Roundness (Aspect Ratio)</span>
                  <span className="font-mono text-zinc-400">{Math.round(aspectRatio * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.01"
                  value={aspectRatio}
                  onChange={(e) => handleAspectRatioChange(parseFloat(e.target.value))}
                  className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Tip Angle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300 flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Rotation Angle</span>
                  </span>
                  <span className="font-mono text-zinc-400">{angleDegrees}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={angleDegrees}
                  onChange={(e) => handleAngleChange(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB 2: STROKE & SPACING */}
          {activeTab === "stroke" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Spacing */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300">Dab Spacing</span>
                  <span className="font-mono text-zinc-400">{spacingPercent}%</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="100"
                  step="1"
                  value={spacingPercent}
                  onChange={(e) => handleSpacingChange(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Continuous Solid (5%)</span>
                  <span>Dotted Stamp (100%)</span>
                </div>
              </div>

              {/* Base Flow */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300">Base Flow</span>
                  <span className="font-mono text-zinc-400">{flowPercent}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="1"
                  value={flowPercent}
                  onChange={(e) => handleFlowChange(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-zinc-500">
                  Controls ink deposition rate per dab stamp.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: STABILIZATION & SPLINE */}
          {activeTab === "stabilization" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Spline Mode Selection */}
              <div className="space-y-2">
                <span className="font-medium text-zinc-300">Spline Curve Generator</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSplineModeChange("midpoint")}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      splineMode === "midpoint"
                        ? "bg-sky-950/60 border-sky-500 text-sky-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-semibold text-xs text-zinc-100">Midpoint Bézier</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Procreate/Paper C¹ midpoint curves (Zero corner kinks)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSplineModeChange("catmullRom")}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      splineMode === "catmullRom"
                        ? "bg-sky-950/60 border-sky-500 text-sky-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-semibold text-xs text-zinc-100">Catmull-Rom</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Direct point interpolation with continuous velocity
                    </div>
                  </button>
                </div>
              </div>

              {/* Stabilization Mode Selection */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <span className="font-medium text-zinc-300">Stabilizer Algorithm</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["movingAverage", "streamline", "none"] as const).map((m) => {
                    const isSelected = smoothingConfig.mode === m;
                    const label =
                      m === "movingAverage"
                        ? "Moving Avg"
                        : m === "streamline"
                        ? "Streamline"
                        : "None (Raw)";
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleSmoothingModeChange(m)}
                        className={`py-1.5 px-2 rounded-md border text-center font-medium transition-all ${
                          isSelected
                            ? "bg-sky-950/70 border-sky-500 text-sky-200"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-controls based on mode */}
              {smoothingConfig.mode === "movingAverage" && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Smoothing Window Size</span>
                    <span className="font-mono text-zinc-400">
                      {smoothingConfig.movingAverageWindowSize}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={smoothingConfig.movingAverageWindowSize}
                    onChange={(e) =>
                      handleMovingAverageWindowChange(parseInt(e.target.value, 10))
                    }
                    className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>Snappy (1)</span>
                    <span>Smooth (8)</span>
                  </div>
                </div>
              )}

              {smoothingConfig.mode === "streamline" && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Streamline Strength</span>
                    <span className="font-mono text-zinc-400">
                      {Math.round(smoothingConfig.streamlineMaxSmoothing * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={smoothingConfig.streamlineMaxSmoothing}
                    onChange={(e) =>
                      handleStreamlineSmoothingChange(parseFloat(e.target.value))
                    }
                    className="w-full accent-sky-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PRESSURE DYNAMICS */}
          {activeTab === "dynamics" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Pressure to Size */}
              <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200">Pressure → Size Dynamics</div>
                  <div className="text-[10px] text-zinc-400">
                    Scales brush diameter with Apple Pencil / stylus pressure
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSizeDynamicsToggle(!sizeDynamicsEnabled)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                    sizeDynamicsEnabled ? "bg-sky-500" : "bg-zinc-800"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      sizeDynamicsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Pressure to Opacity */}
              <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200">Pressure → Opacity Dynamics</div>
                  <div className="text-[10px] text-zinc-400">
                    Softens ink opacity with light touch
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpacityDynamicsToggle(!opacityDynamicsEnabled)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                    opacityDynamicsEnabled ? "bg-sky-500" : "bg-zinc-800"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      opacityDynamicsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Test Scratchpad Footer */}
        <div className="border-t border-zinc-800 bg-zinc-900/70 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Live Test Scratchpad (Draw Here)</span>
            </span>
            <button
              type="button"
              onClick={handleClearScratchpad}
              title="Clear scratchpad doodles"
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>

          <div className="relative w-full h-28 bg-[#18181b] rounded-lg border border-zinc-800/80 overflow-hidden shadow-inner">
            <canvas
              ref={scratchCanvasRef}
              width={380}
              height={112}
              onPointerDown={handleScratchPointerDown}
              onPointerMove={handleScratchPointerMove}
              onPointerUp={handleScratchPointerUp}
              onPointerCancel={handleScratchPointerUp}
              className="w-full h-full block touch-none cursor-crosshair"
              style={{ imageRendering: "auto" }}
            />
          </div>
        </div>
      </div>
    </FloatingWindowPanel>
  );
};
