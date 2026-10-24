/**
 * Brush Scratchpad
 * Ultra-lightweight, memory-efficient live drawing canvas for instant brush experimentation.
 * Powered by an isolated WasmBrushBridge instance running Rust sketch_core's
 * continuous midpoint quadratic Bézier splines and subpixel dab stepping (zero faceting),
 * with full hardware Apple Pencil / stylus pressure & tilt support and simulated dynamics stroke.
 */

import { useRef, useEffect, useCallback, useState, type FC, type PointerEvent } from "react";
import { Trash2, Sparkles, Wand2 } from "lucide-react";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { WasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { generateCurveLookupTable256 } from "@/engine/math/dynamics_curve";
import type { BrushPreset } from "@/types/brush";
import type { StrokePoint } from "@/types/stroke";

export interface BrushScratchpadProps {
  activeBrush?: BrushPreset | null;
  brushSize: number;
  brushOpacity: number;
  softness?: number;
  spacing?: number;
  sizeDynamics?: boolean;
  opacityDynamics?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

interface PointWithPressure {
  x: number;
  y: number;
  pressure: number;
}

export const BrushScratchpad: FC<BrushScratchpadProps> = ({
  activeBrush,
  brushSize,
  brushOpacity,
  softness = 0.45,
  spacing = 8,
  sizeDynamics = true,
  opacityDynamics = false,
  width = 248,
  height = 460,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<WasmBrushBridge | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const brushSettingsRevision = useDocumentStore((s) => s.brushSettingsRevision);
  const globalPressureCurve = useDocumentStore((s) => s.globalPressureCurve);

  const isDrawingRef = useRef(false);
  const pointsRef = useRef<PointWithPressure[]>([]);
  const strokeStepCountRef = useRef(0);
  const [hasUserDrawn, setHasUserDrawn] = useState(false);
  const completedStrokesRef = useRef<StrokePoint[][]>([]);
  const currentStrokePointsRef = useRef<StrokePoint[]>([]);

  // Clear canvas and Wasm buffer
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bridgeRef.current?.ready) {
      bridgeRef.current.clear(0, 0, 0, 0);
    }
    completedStrokesRef.current = [];
    currentStrokePointsRef.current = [];
    setHasUserDrawn(false);
  }, []);

  // Synchronizes full brush parameters, tip geometry, dynamics, and scattering to Wasm bridge
  const syncBridgeConfig = useCallback(() => {
    if (!bridgeRef.current?.ready) return;
    const bridge = bridgeRef.current;
    const strokeRgb: [number, number, number] = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];

    const params = activeBrush?.engineParameters;
    let scatterAmp = 0;
    let hasScatter = false;

    if (params && params.engineId === "pixelbrush") {
      scatterAmp = typeof params.scatterAmplitude === "number" ? params.scatterAmplitude : 0;
      hasScatter = Boolean((params.scatterDynamics && params.scatterDynamics.isEnabled) || scatterAmp > 0.01);
    }

    // Configure base parameters
    bridge.setBrushConfig({
      diameter: Math.max(1, brushSize),
      spacing: Math.max(0.01, (spacing ?? 8) / 100),
      softness: Math.max(0, Math.min(1, softness ?? 0.45)),
      color: [strokeRgb[0], strokeRgb[1], strokeRgb[2], 255],
      opacity: Math.max(0, Math.min(1, brushOpacity)),
      flow: 1.0,
      sizeByPressure: sizeDynamics ?? true,
      opacityByPressure: opacityDynamics ?? false,
      isErase: false,
      antialias: true,
    });

    // 1. Sync global pressure LUT
    if (globalPressureCurve && globalPressureCurve.length >= 2) {
      const pLut = generateCurveLookupTable256(globalPressureCurve);
      bridge.setPressureLut(pLut);
    }

    // 2. Sync dynamics (multi-sensor or legacy single sensor)
    const multiDyn = params && "multiDynamics" in params ? params.multiDynamics : null;
    if (multiDyn) {
      for (const [paramKey, pConfig] of Object.entries(multiDyn)) {
        if (!pConfig) continue;
        if (pConfig.calculationMode) {
          bridge.setDynamicsCalculationMode(paramKey, pConfig.calculationMode);
        }
        if (pConfig.sensors) {
          for (const [sensorKey, sVal] of Object.entries(pConfig.sensors)) {
            if (!sVal) continue;
            const lut = sVal.curvePoints && sVal.curvePoints.length >= 2
              ? generateCurveLookupTable256(sVal.curvePoints.map((p) => ({ x: p.inputValue, y: p.outputValue })))
              : new Float32Array(256);
            bridge.setDynamicsMapping(
              paramKey,
              sVal.isEnabled,
              sensorKey,
              sVal.minOutput ?? 0.0,
              sVal.maxOutput ?? 1.0,
              lut
            );
          }
        }
      }
    } else {
      // Legacy single dynamics fallback
      const sizeDyn = params && "sizeDynamics" in params ? params.sizeDynamics : null;
      if (sizeDyn && sizeDyn.isEnabled && sizeDyn.curvePoints.length >= 2) {
        const pts = sizeDyn.curvePoints.map((p) => ({ x: p.inputValue, y: p.outputValue }));
        const lut = generateCurveLookupTable256(pts);
        bridge.setDynamicsMapping("size", true, sizeDyn.sensorInput, 0.02, 1.0, lut);
      } else {
        bridge.setDynamicsMapping("size", false, "pressure", 0.0, 1.0, new Float32Array(256));
      }

      const opDyn = params && "opacityDynamics" in params ? params.opacityDynamics : null;
      if (opDyn && opDyn.isEnabled && opDyn.curvePoints.length >= 2) {
        const pts = opDyn.curvePoints.map((p) => ({ x: p.inputValue, y: p.outputValue }));
        const lut = generateCurveLookupTable256(pts);
        bridge.setDynamicsMapping("opacity", true, opDyn.sensorInput, 0.05, 1.0, lut);
      } else {
        bridge.setDynamicsMapping("opacity", false, "pressure", 0.0, 1.0, new Float32Array(256));
      }

      if (hasScatter) {
        const lut = new Float32Array(256);
        for (let i = 0; i < 256; i++) lut[i] = 1.0;
        const maxOut = Math.max(scatterAmp, 0.6);
        bridge.setDynamicsMapping("jitter", true, "random", 0.0, maxOut, lut);
      } else {
        bridge.setDynamicsMapping("jitter", false, "random", 0.0, 0.0, new Float32Array(256));
      }
    }

    // 3. Sync predefined brush tip vs generated
    if (params && params.engineId === "pixelbrush") {
      const tip = params.brushTip;
      if (tip && tip.tipType === "predefined" && tip.imageData && tip.width > 0 && tip.height > 0) {
        const tipId = `scratch-tip-${activeBrush?.presetId ?? "active"}`;
        const maskBytes = new Uint8Array(tip.imageData.buffer, tip.imageData.byteOffset, tip.imageData.byteLength);
        bridge.registerTipMask(tipId, "Scratch Tip", tip.width, tip.height, maskBytes, true);
        bridge.setBrushPredefinedTip(tipId, 1.0, 0.0);
      } else {
        bridge.clearBrushPredefinedTip();
      }

      // 4. Sync paper grain texture
      const tex = params.grainTexture;
      if (tex && tex.bytes && tex.bytes.length > 0) {
        const patBytes = tex.bytes instanceof Uint8Array ? tex.bytes : new Uint8Array(tex.bytes);
        bridge.registerPatternGrayscale(tex.patternId, tex.name, tex.width, tex.height, patBytes);
        bridge.setBrushTextureResource(
          tex.patternId,
          tex.scale ?? 1.0,
          tex.mode ?? "multiply",
          tex.strength ?? 1.0,
          tex.invert ?? false,
          tex.brightness ?? 0.0,
          tex.contrast ?? 1.0,
          tex.byPressure ?? false
        );
      } else {
        bridge.clearBrushTexture();
      }
    }
  }, [
    activeBrush,
    brushSize,
    brushOpacity,
    softness,
    spacing,
    sizeDynamics,
    opacityDynamics,
    resolvedTheme,
    globalPressureCurve,
  ]);

  // Initialize isolated Wasm engine for scratchpad
  useEffect(() => {
    const bridge = new WasmBrushBridge();
    bridgeRef.current = bridge;

    void bridge.initialize(width, height).then((ready) => {
      if (ready) {
        bridge.resizeCanvas(width, height, 0, 0, 0, 0);
        setIsReady(true);
        syncBridgeConfig();
      }
    });

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      clearCanvas();
    }

    return () => {
      bridgeRef.current = null;
    };
  }, [width, height, clearCanvas, syncBridgeConfig]);

  // Replay strokes for Procreate-style memory pruning
  const replayStrokes = useCallback((strokes: StrokePoint[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bridgeRef.current?.ready) {
      bridgeRef.current.clear(0, 0, 0, 0);
      for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        bridgeRef.current.beginStroke(stroke[0], ctx);
        for (let i = 1; i < stroke.length; i++) {
          bridgeRef.current.extendStroke(stroke[i], ctx);
        }
        bridgeRef.current.finishStroke(ctx);
      }
    }
  }, []);

  // Sync brush parameters whenever dependencies change
  useEffect(() => {
    syncBridgeConfig();
  }, [syncBridgeConfig, brushSettingsRevision, isReady]);

  // Draw default simulated test stroke (ramping pressure, tilt, velocity & scattering)
  const handleDrawDefaultStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Generate ~75 points along an authentic hand-painted S-curve
    const steps = 75;
    const points: StrokePoint[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Fluid S-curve trajectory
      const x = w * (0.24 + 0.52 * t + Math.sin(t * Math.PI * 2) * 0.18);
      const y = h * (0.12 + 0.76 * t);

      // Realistic stylus pressure: start delicate, swell in center, taper at tail
      const pressure = Math.pow(Math.sin(t * Math.PI), 0.75) * 0.88 + 0.08;

      // Realistic Apple Pencil / stylus tilt: sweeps from 10 deg to 45 deg tilt and back
      const tiltX = Math.sin(t * Math.PI) * 0.65;
      const tiltY = Math.cos(t * Math.PI * 2) * 0.35;

      const timeMs = i * 16.6; // 60fps velocity pacing
      const speed = 400 + Math.sin(t * Math.PI) * 1200;

      points.push({
        canvasX: x,
        canvasY: y,
        pressure,
        tiltX,
        tiltY,
        rotation: t * Math.PI,
        timeMs,
        speed,
      });
    }

    if (bridgeRef.current?.ready) {
      bridgeRef.current.beginStroke(points[0], ctx);
      for (let i = 1; i < points.length; i++) {
        bridgeRef.current.extendStroke(points[i], ctx);
      }
      bridgeRef.current.finishStroke(ctx);
    } else {
      // Fallback: draw smooth spline on 2D context
      const strokeRgb = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < points.length; i++) {
        const pPrev = points[i - 1];
        const pCurr = points[i];
        const avgPressure = (pPrev.pressure + pCurr.pressure) * 0.5;
        const effSize = sizeDynamics ? Math.max(1, brushSize * avgPressure) : brushSize;
        const effAlpha = opacityDynamics ? brushOpacity * avgPressure : brushOpacity;

        ctx.strokeStyle = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${effAlpha})`;
        ctx.lineWidth = effSize;

        ctx.beginPath();
        ctx.moveTo(pPrev.canvasX, pPrev.canvasY);
        ctx.lineTo(pCurr.canvasX, pCurr.canvasY);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [brushSize, brushOpacity, sizeDynamics, opacityDynamics, resolvedTheme]);

  // Live auto-updating test stroke: whenever brush settings change, update test stroke if user hasn't drawn
  useEffect(() => {
    if (isReady && !hasUserDrawn) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (bridgeRef.current?.ready) {
        bridgeRef.current.clear(0, 0, 0, 0);
      }
      handleDrawDefaultStroke();
    }
  }, [
    isReady,
    hasUserDrawn,
    brushSettingsRevision,
    activeBrush,
    brushSize,
    brushOpacity,
    softness,
    spacing,
    sizeDynamics,
    opacityDynamics,
    handleDrawDefaultStroke,
  ]);

  // Extracts true normalized pressure [0.01 .. 1.0] across all devices (Apple Pencil, Wacom, Mac Force Touch, mouse)
  const extractPressure = (e: PointerEvent<HTMLCanvasElement>, isMove = false): number => {
    // 1. Apple Pencil / Stylus (pointerType === "pen")
    if (e.pointerType === "pen") {
      if (typeof e.pressure === "number" && e.pressure > 0.0001) {
        return Math.max(0.01, Math.min(1.0, e.pressure));
      }
      return 0.5;
    }

    // 2. Hardware tablet sending analog pressure (non-default value)
    if (typeof e.pressure === "number" && e.pressure > 0 && e.pressure !== 0.5) {
      return Math.max(0.01, Math.min(1.0, e.pressure));
    }

    // 3. Apple MacBook Force Touch trackpad (WebKit webkitForce API)
    const webkitForce = (e as any).webkitForce;
    if (typeof webkitForce === "number" && webkitForce > 0) {
      // 1.0 = standard click down, 2.0 = medium, 3.0 = full deep press
      return Math.max(0.05, Math.min(1.0, (webkitForce - 1.0) / 2.0));
    }

    // 4. Fallback for mouse / trackpad without force touch:
    // Continuous dynamic organic stylus pressure modulation along the stroke:
    // Sweeps and breathes organically without dying out or freezing to a flat line
    if (!isMove) {
      strokeStepCountRef.current = 0;
      return 0.22;
    }

    strokeStepCountRef.current++;
    const step = strokeStepCountRef.current;
    const wave1 = Math.sin(step * 0.08);
    const wave2 = Math.cos(step * 0.035) * 0.5;
    const normalizedWave = 0.5 + 0.5 * (wave1 * 0.7 + wave2 * 0.3);
    return Math.max(0.12, Math.min(1.0, 0.20 + normalizedWave * 0.78));
  };

  // Extracts normalized tilt from hardware degrees [-90 .. 90]
  const extractTilt = (e: PointerEvent<HTMLCanvasElement>): { tiltX: number; tiltY: number } => {
    const rawX = typeof e.tiltX === "number" ? e.tiltX : 0;
    const rawY = typeof e.tiltY === "number" ? e.tiltY : 0;
    const tiltX = rawX !== 0 ? Math.sin((rawX * Math.PI) / 180) : 0;
    const tiltY = rawY !== 0 ? Math.sin((rawY * Math.PI) / 180) : 0;
    return { tiltX, tiltY };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    // If switching from auto-test stroke to user drawing, clear canvas first
    if (!hasUserDrawn) {
      setHasUserDrawn(true);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bridgeRef.current?.ready) {
        bridgeRef.current.clear(0, 0, 0, 0);
      }
      completedStrokesRef.current = [];
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = extractPressure(e, false);
    const { tiltX, tiltY } = extractTilt(e);
    const rotation = typeof e.twist === "number" && e.twist !== 0 ? (e.twist * Math.PI) / 180 : 0;
    const timeMs = performance.now();

    isDrawingRef.current = true;
    pointsRef.current = [{ x, y, pressure }];

    const strokePoint: StrokePoint = {
      canvasX: x,
      canvasY: y,
      pressure,
      timeMs,
      tiltX,
      tiltY,
      rotation,
      speed: 0,
    };
    currentStrokePointsRef.current = [strokePoint];

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (bridgeRef.current?.ready) {
      bridgeRef.current.beginStroke(strokePoint, ctx);
    } else {
      const strokeRgb = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];
      const effSize = sizeDynamics ? Math.max(1, brushSize * pressure) : brushSize;
      const effAlpha = opacityDynamics ? brushOpacity * pressure : brushOpacity;

      ctx.save();
      ctx.fillStyle = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${effAlpha})`;
      ctx.beginPath();
      ctx.arc(x, y, effSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const timeMs = performance.now();
    const { tiltX, tiltY } = extractTilt(e);
    const rotation = typeof e.twist === "number" && e.twist !== 0 ? (e.twist * Math.PI) / 180 : 0;

    // Use coalesced events if available for 120Hz-240Hz stylus fidelity
    const coalescedEvents =
      typeof (e as any).getCoalescedEvents === "function"
        ? ((e as any).getCoalescedEvents() as PointerEvent<HTMLCanvasElement>[])
        : [e];

    for (const evt of coalescedEvents) {
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const pressure = extractPressure(evt, true);

      const points = pointsRef.current;
      const prev = points[points.length - 1];
      if (prev) {
        const dx = x - prev.x;
        const dy = y - prev.y;
        if (dx * dx + dy * dy < 0.6) continue;
      }

      points.push({ x, y, pressure });

      const strokePoint: StrokePoint = {
        canvasX: x,
        canvasY: y,
        pressure,
        timeMs,
        tiltX,
        tiltY,
        rotation,
        speed: 0,
      };
      currentStrokePointsRef.current.push(strokePoint);

      if (bridgeRef.current?.ready) {
        bridgeRef.current.extendStroke(strokePoint, ctx);
      } else {
        if (points.length >= 3) {
          const p0 = points[points.length - 3];
          const p1 = points[points.length - 2];
          const p2 = points[points.length - 1];

          const midPrev = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
          const midNext = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };

          const avgPressure = (p1.pressure + p2.pressure) * 0.5;
          const effSize = sizeDynamics ? Math.max(1, brushSize * avgPressure) : brushSize;
          const effAlpha = opacityDynamics ? brushOpacity * avgPressure : brushOpacity;
          const strokeRgb = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];

          ctx.save();
          ctx.strokeStyle = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${effAlpha})`;
          ctx.lineWidth = effSize;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          if (softness > 0.05) {
            ctx.shadowBlur = effSize * softness * 0.6;
            ctx.shadowColor = `rgba(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]}, ${effAlpha * 0.5})`;
          }

          ctx.beginPath();
          ctx.moveTo(midPrev.x, midPrev.y);
          ctx.quadraticCurveTo(p1.x, p1.y, midNext.x, midNext.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    pointsRef.current = [];

    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }

    const ctx = canvas?.getContext("2d");
    if (ctx && bridgeRef.current?.ready) {
      bridgeRef.current.finishStroke(ctx);
    }

    // Procreate-style stroke memory bounding: retain up to 5 strokes
    if (currentStrokePointsRef.current.length > 0) {
      completedStrokesRef.current.push([...currentStrokePointsRef.current]);
      currentStrokePointsRef.current = [];

      if (completedStrokesRef.current.length > 5) {
        completedStrokesRef.current.shift();
        replayStrokes(completedStrokesRef.current);
      }
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center bg-white dark:bg-zinc-950/80 rounded-xl border border-zinc-200 dark:border-white/10 shadow-inner overflow-hidden ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {/* Scratchpad Header: Title Badge & Actions */}
      <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between select-none z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/10 dark:bg-white/10 backdrop-blur-md text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
          <Sparkles className="w-3 h-3 text-blue-500" />
          <span>Scratchpad</span>
          {isReady && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Wasm Engine Active" />}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Default Simulated Test Stroke Button */}
          <button
            type="button"
            onClick={() => {
              clearCanvas();
              handleDrawDefaultStroke();
            }}
            title="Draw simulated test stroke with pressure, tilt & velocity dynamics"
            aria-label="Draw simulated test stroke"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 dark:bg-zinc-800/90 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-zinc-600 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400 border border-zinc-200/80 dark:border-white/10 shadow-xs text-[10px] font-medium transition-colors cursor-pointer"
          >
            <Wand2 className="w-3 h-3 text-blue-500 shrink-0" />
            <span>Test Stroke</span>
          </button>

          <button
            type="button"
            onClick={clearCanvas}
            title="Clear Scratchpad"
            aria-label="Clear Scratchpad"
            className="p-1.5 rounded-lg bg-white/90 dark:bg-zinc-800/90 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 border border-zinc-200/80 dark:border-white/10 shadow-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="touch-none cursor-crosshair block w-full h-full"
      />

      {/* Bottom Hint */}
      <div className="absolute bottom-1.5 text-[9px] text-zinc-400 dark:text-zinc-500 pointer-events-none select-none">
        Continuous Spline Engine • Test strokes freely
      </div>
    </div>
  );
};
