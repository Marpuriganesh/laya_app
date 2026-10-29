import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FC,
  type PointerEvent,
} from "react";
import {
  Activity,
  Pause,
  Play,
  Trash2,
  Copy,
  Check,
  Compass,
  Gauge,
  PenTool,
  RotateCw,
  Zap,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { globalBrushTelemetryStore } from "@/engine/telemetry/brush_telemetry_store";
import type { PointerTelemetry } from "@/types/telemetry";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";

export interface BrushDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrushDebugPanel: FC<BrushDebugPanelProps> = ({ isOpen, onClose }) => {
  const [telemetry, setTelemetry] = useState<PointerTelemetry>(() =>
    globalBrushTelemetryStore.getCurrentTelemetry()
  );
  const [isFrozen, setIsFrozen] = useState<boolean>(() =>
    globalBrushTelemetryStore.getIsFrozen()
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [showEventLog, setShowEventLog] = useState<boolean>(false);

  // Oscilloscope & Scratchpad Canvas Refs
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const scratchpadCanvasRef = useRef<HTMLCanvasElement>(null);
  const isScratchingRef = useRef<boolean>(false);
  const lastScratchPosRef = useRef<{ x: number; y: number } | null>(null);

  // Detect macOS Native AppKit mode
  const isMacNative =
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    /macintosh|mac os x/i.test(navigator.userAgent);

  // Subscribe to telemetry store updates
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = globalBrushTelemetryStore.subscribe((updated) => {
      setTelemetry({ ...updated });
      setIsFrozen(globalBrushTelemetryStore.getIsFrozen());
    });

    return unsubscribe;
  }, [isOpen]);

  // Periodic Native AppKit Telemetry Poller (Desktop Tauri only)
  useEffect(() => {
    if (!isOpen || !isMacNative) return;

    let animId: number;
    let isCancelled = false;

    const pollNativeTelemetry = async () => {
      if (isCancelled) return;
      try {
        const nativeDto = await globalRustBrushBridge.getTelemetry();
        if (nativeDto && !globalBrushTelemetryStore.getIsFrozen()) {
          globalBrushTelemetryStore.recordNativeDto(nativeDto);
        }
      } catch {
        // Ignore fallback
      }

      if (!isCancelled) {
        animId = requestAnimationFrame(pollNativeTelemetry);
      }
    };

    animId = requestAnimationFrame(pollNativeTelemetry);
    return () => {
      isCancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [isOpen, isMacNative]);

  // Render rolling oscilloscope waveform on canvas
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderWaveform = () => {
      const width = canvas.width;
      const height = canvas.height;
      const samples = globalBrushTelemetryStore.getWaveformSamples();

      ctx.clearRect(0, 0, width, height);

      // Grid background lines
      ctx.strokeStyle = "rgba(120, 120, 140, 0.15)";
      ctx.lineWidth = 1;

      // 25%, 50%, 75% horizontal guide lines
      for (let p = 0.25; p <= 0.75; p += 0.25) {
        const y = height - p * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (samples.length < 2) {
        animId = requestAnimationFrame(renderWaveform);
        return;
      }

      const stepX = width / Math.max(1, samples.length - 1);

      // 1. Draw Speed Curve (Green/Emerald)
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "#10b981"; // Emerald-500
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";

      // Normalize speed: max clamp at 3000 px/s for scale
      const MAX_SPEED = 3000;
      for (let i = 0; i < samples.length; i++) {
        const x = i * stepX;
        const normSpeed = Math.min(1.0, samples[i].speed / MAX_SPEED);
        const y = height - normSpeed * (height - 6) - 3;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // 2. Draw Pressure Curve (Cyan/Blue)
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "#38bdf8"; // Sky-400
      ctx.lineWidth = 2.0;
      ctx.lineJoin = "round";

      for (let i = 0; i < samples.length; i++) {
        const x = i * stepX;
        const p = Math.max(0, Math.min(1, samples[i].pressure));
        const y = height - p * (height - 6) - 3;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(renderWaveform);
    };

    animId = requestAnimationFrame(renderWaveform);
    return () => cancelAnimationFrame(animId);
  }, [isOpen]);

  // Freeze/Pause toggle
  const handleToggleFreeze = useCallback(() => {
    globalBrushTelemetryStore.toggleFrozen();
    setIsFrozen(globalBrushTelemetryStore.getIsFrozen());
  }, []);

  // Clear waveform and counters
  const handleClear = useCallback(() => {
    globalBrushTelemetryStore.clear();
    const scratchCanvas = scratchpadCanvasRef.current;
    if (scratchCanvas) {
      const ctx = scratchCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    }
  }, []);

  // Copy JSON telemetry to clipboard
  const handleCopyJson = useCallback(async () => {
    try {
      const jsonStr = globalBrushTelemetryStore.exportToJson();
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn("Failed to copy telemetry to clipboard:", err);
    }
  }, []);

  // Scratchpad Pointer Handlers
  const handleScratchPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    isScratchingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastScratchPosRef.current = { x, y };

    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      const radius = Math.max(2, (e.pressure || 0.5) * 16);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Feed to telemetry
    globalBrushTelemetryStore.recordWebEvent(
      e.nativeEvent,
      {
        canvasX: x,
        canvasY: y,
        pressure: e.pressure,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        rotation: e.twist ?? 0,
        speed: 0,
        timeMs: e.timeStamp || Date.now(),
      },
      true
    );
  };

  const handleScratchPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isScratchingRef.current) return;
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = e.currentTarget.getContext("2d");
    if (ctx && lastScratchPosRef.current) {
      const p = e.pressure || 0.5;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = Math.max(2, p * 20);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lastScratchPosRef.current.x, lastScratchPosRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    const prev = lastScratchPosRef.current || { x, y };
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const speed = dist * 60; // Approximate px/s
    lastScratchPosRef.current = { x, y };

    globalBrushTelemetryStore.recordWebEvent(
      e.nativeEvent,
      {
        canvasX: x,
        canvasY: y,
        pressure: e.pressure,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        rotation: e.twist ?? 0,
        speed,
        timeMs: e.timeStamp || Date.now(),
      },
      true
    );
  };

  const handleScratchPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isScratchingRef.current) return;
    isScratchingRef.current = false;
    lastScratchPosRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    globalBrushTelemetryStore.recordWebEvent(
      e.nativeEvent,
      {
        canvasX: x,
        canvasY: y,
        pressure: 0,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        rotation: e.twist ?? 0,
        speed: 0,
        timeMs: e.timeStamp || Date.now(),
      },
      false
    );
  };

  // 2D Tilt needle vector calculation for circular compass
  const compassAngleRad = (telemetry.azimuthAngle * Math.PI) / 180;
  // Needle length proportional to tilt severity (90° elevation = center dot, 0° = full radius)
  const tiltMagnitude = Math.max(0, Math.min(1.0, (90 - telemetry.altitudeAngle) / 90));
  const needleRadius = 24 * tiltMagnitude;
  const needleX = 28 + Math.cos(compassAngleRad) * needleRadius;
  // In SVG coordinates, Y=0 is top, so tilt towards top/north (-Y) subtracts sin
  const needleY = 28 - Math.sin(compassAngleRad) * needleRadius;

  const headerActions = (
    <div className="flex items-center gap-1 mr-1">
      {/* Freeze / Pause Toggle */}
      <button
        type="button"
        onClick={handleToggleFreeze}
        title={isFrozen ? "Resume live telemetry updates" : "Freeze telemetry updates to inspect values"}
        aria-label={isFrozen ? "Resume Telemetry" : "Freeze Telemetry"}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          isFrozen
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
            : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80"
        }`}
      >
        {isFrozen ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Clear Waveform / History */}
      <button
        type="button"
        onClick={handleClear}
        title="Clear telemetry history and waveform"
        aria-label="Clear Telemetry History"
        className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Copy JSON */}
      <button
        type="button"
        onClick={handleCopyJson}
        title="Copy complete telemetry snapshot as JSON"
        aria-label="Copy Telemetry JSON"
        className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer relative"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );

  return (
    <FloatingWindowPanel
      id="brush-debug-panel"
      title="Brush Input Debugger"
      icon={<Activity className="w-3.5 h-3.5 text-blue-500" />}
      isOpen={isOpen}
      onClose={onClose}
      width={360}
      height={580}
      anchorClassName="fixed right-6 top-16"
      zIndex={45}
      headerActions={headerActions}
    >
      <div
        data-native-ui="brush-debug-panel"
        onPointerDown={(e) => e.stopPropagation()}
        className="flex flex-col p-3 gap-3 overflow-y-auto max-h-[520px] select-none text-xs font-sans"
      >
        {/* Source & Rate Status Banner */}
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-white/5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                telemetry.isDrawing
                  ? "bg-emerald-500 animate-pulse"
                  : isFrozen
                  ? "bg-amber-500"
                  : "bg-zinc-400"
              }`}
            />
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {telemetry.source === "native-appkit" ? "macOS AppKit Native" : "Web PointerEvents"}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="text-zinc-500 dark:text-zinc-400">
              {telemetry.estimatedHz > 0 ? `${telemetry.estimatedHz} Hz` : "-- Hz"}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300">
              {telemetry.pointerType.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Live Input Scratchpad Test Strip */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <PenTool className="w-3 h-3 text-blue-500" />
              <span>Input Test Strip</span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Draw here or on canvas
            </span>
          </div>
          <div className="relative w-full h-11 rounded-lg bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-white/10 overflow-hidden cursor-crosshair">
            <canvas
              ref={scratchpadCanvasRef}
              width={334}
              height={44}
              onPointerDown={handleScratchPointerDown}
              onPointerMove={handleScratchPointerMove}
              onPointerUp={handleScratchPointerUp}
              onPointerCancel={handleScratchPointerUp}
              className="w-full h-full touch-none"
            />
            {!telemetry.isDrawing && telemetry.canvasX === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] text-zinc-400 dark:text-zinc-600">
                Press stylus down to test pressure & tilt
              </div>
            )}
          </div>
        </div>

        {/* Live Analog Sensor Gauges */}
        <div className="grid grid-cols-2 gap-2">
          {/* 1. Pressure Gauge */}
          <div className="flex flex-col p-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-white/5 gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>Pressure</span>
              </div>
              <span className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">
                {(telemetry.curvePressure * 100).toFixed(1)}%
              </span>
            </div>

            {/* Visual Level Bar */}
            <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-fuchsia-500 transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, telemetry.curvePressure * 100))}%` }}
              />
            </div>

            <div className="flex justify-between font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              <span>Raw: {telemetry.rawPressure.toFixed(3)}</span>
              <span>Curve: {telemetry.curvePressure.toFixed(3)}</span>
            </div>
          </div>

          {/* 2. Velocity Speedometer */}
          <div className="flex flex-col p-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-white/5 gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1">
                <Gauge className="w-3 h-3 text-emerald-500" />
                <span>Velocity</span>
              </div>
              <span className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">
                {telemetry.speed} px/s
              </span>
            </div>

            {/* Velocity Level Bar (Clamped at 2500 px/s) */}
            <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700/60 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${Math.min(100, (telemetry.speed / 2500) * 100)}%` }}
              />
            </div>

            <div className="flex justify-between font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              <span>Dist: {telemetry.distance.toFixed(0)} px</span>
              <span>Dur: {telemetry.strokeDurationMs} ms</span>
            </div>
          </div>
        </div>

        {/* 3. Spatial Orientation (Tilt Compass & Barrel Roll) */}
        <div className="flex p-2.5 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-white/5 items-center justify-between gap-3">
          {/* Circular Compass Reticle */}
          <div className="flex items-center gap-2.5">
            <div className="relative w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0 shadow-inner">
              {/* Compass crosshairs */}
              <div className="absolute w-full h-px bg-zinc-300 dark:bg-zinc-700/50" />
              <div className="absolute h-full w-px bg-zinc-300 dark:bg-zinc-700/50" />
              <div className="absolute w-7 h-7 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700/50" />

              {/* Azimuth & Tilt Needle */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 56 56">
                <line
                  x1="28"
                  y1="28"
                  x2={needleX}
                  y2={needleY}
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx={needleX} cy={needleY} r="3" fill="#3b82f6" />
                <circle cx="28" cy="28" r="2" fill="#ef4444" />
              </svg>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <Compass className="w-3 h-3 text-blue-500" />
                <span>Tilt & Bearing</span>
              </span>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                Azimuth: {telemetry.azimuthAngle}°
              </span>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                Altitude: {telemetry.altitudeAngle}°
              </span>
            </div>
          </div>

          {/* Cartesian Tilt & Barrel Roll */}
          <div className="flex flex-col gap-0.5 text-right font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
            <div>tiltX: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{telemetry.tiltX}°</span></div>
            <div>tiltY: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{telemetry.tiltY}°</span></div>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <RotateCw className="w-2.5 h-2.5 text-purple-500" />
              <span>Twist: {telemetry.twist}°</span>
            </div>
          </div>
        </div>

        {/* Real-time Oscilloscope (Rolling Waveform Strip Chart) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-sky-400" />
              <span>Oscilloscope Waveform</span>
            </span>
            <div className="flex items-center gap-2 font-mono text-[9px]">
              <span className="flex items-center gap-1 text-sky-400">
                <span className="w-2 h-0.5 bg-sky-400 rounded-full inline-block" /> Pressure
              </span>
              <span className="flex items-center gap-1 text-emerald-500">
                <span className="w-2 h-0.5 bg-emerald-500 rounded-full inline-block" /> Velocity
              </span>
            </div>
          </div>

          <div className="w-full h-16 rounded-lg bg-zinc-900 border border-zinc-200 dark:border-white/10 overflow-hidden relative shadow-inner">
            <canvas
              ref={waveformCanvasRef}
              width={334}
              height={64}
              className="w-full h-full block"
            />
          </div>
        </div>

        {/* Kinematic & Positional Telemetry Data Grid */}
        <div className="p-2 rounded-lg bg-zinc-50/60 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-white/5 flex flex-col gap-1">
          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
            Hardware & Positional Telemetry
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Canvas Pos</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {telemetry.canvasX}, {telemetry.canvasY}
              </span>
            </div>

            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Screen Pos</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {telemetry.clientX}, {telemetry.clientY}
              </span>
            </div>

            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Buttons</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                btn:{telemetry.button} [msk:{telemetry.buttons}]
              </span>
            </div>

            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Coalesced</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {telemetry.coalescedCount} sample{telemetry.coalescedCount > 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Stroke Dir</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {telemetry.strokeDirection}° (init: {telemetry.initialDirection}°)
              </span>
            </div>

            <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 pb-0.5">
              <span className="text-zinc-400">Events in Stroke</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                #{telemetry.strokeEventIndex} (tot: {telemetry.totalStrokesRecorded})
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Recent Event History Log */}
        <div className="flex flex-col rounded-lg bg-zinc-50/60 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-white/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowEventLog(!showEventLog)}
            className="flex items-center justify-between p-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-zinc-500" />
              <span>Event Log (Last {globalBrushTelemetryStore.getEventLog().length} points)</span>
            </div>
            {showEventLog ? (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>

          {showEventLog && (
            <div className="p-2 border-t border-zinc-200/80 dark:border-white/5 max-h-36 overflow-y-auto flex flex-col gap-1 font-mono text-[9px]">
              {globalBrushTelemetryStore.getEventLog().length === 0 ? (
                <div className="text-zinc-400 text-center py-2">No stroke events logged yet</div>
              ) : (
                globalBrushTelemetryStore.getEventLog().map((ev, idx) => (
                  <div
                    key={`${ev.timeStamp}-${idx}`}
                    className="flex justify-between items-center py-0.5 border-b border-zinc-100 dark:border-white/5 last:border-0"
                  >
                    <span className="text-zinc-400">#{ev.strokeEventIndex}</span>
                    <span>
                      ({ev.canvasX}, {ev.canvasY})
                    </span>
                    <span className="text-sky-500 font-semibold">P: {ev.rawPressure.toFixed(3)}</span>
                    <span className="text-zinc-500">
                      T: {ev.tiltX}°, {ev.tiltY}°
                    </span>
                    <span className="text-emerald-500">{ev.speed} px/s</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </FloatingWindowPanel>
  );
};
