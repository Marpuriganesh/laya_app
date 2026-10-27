import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type FC,
  type PointerEvent,
} from "react";
import { Trash2, Wand2, Paintbrush } from "lucide-react";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { WasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { generateCurveLookupTable256 } from "@/engine/math/dynamics_curve";
import type { BrushPreset, StrokeSmoothingConfig } from "@/types/brush";
import type { StrokePoint } from "@/types/stroke";
import type { CurvePoint } from "@/engine/math/dynamics_curve";

export interface BrushStudioDrawingPadProps {
  draftPreset: BrushPreset;
  draftSmoothing: StrokeSmoothingConfig;
  draftPressureCurve: CurvePoint[];
  className?: string;
}

interface PointWithPressure {
  x: number;
  y: number;
  pressure: number;
}

export const BrushStudioDrawingPad: FC<BrushStudioDrawingPadProps> = ({
  draftPreset,
  draftSmoothing,
  draftPressureCurve,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<WasmBrushBridge | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 440,
    height: 600,
  });
  const [isReady, setIsReady] = useState(false);
  const { resolvedTheme } = useTheme();

  const isDrawingRef = useRef(false);
  const pointsRef = useRef<PointWithPressure[]>([]);
  const strokeStepCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const [hasUserDrawn, setHasUserDrawn] = useState(false);

  // Sync canvas size with container dimensions via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          const w = Math.round(width);
          const h = Math.round(height);
          setDimensions({ width: w, height: h });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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
    pointsRef.current = [];
    strokeStepCountRef.current = 0;
    setHasUserDrawn(false);
  }, []);

  // Synchronize full draft preset parameters, tip geometry, dynamics, and textures to Wasm bridge
  const syncBridgeConfig = useCallback(() => {
    if (!bridgeRef.current?.ready) return;
    const bridge = bridgeRef.current;
    const strokeRgb: [number, number, number] = resolvedTheme === "dark" ? [255, 255, 255] : [24, 24, 27];

    const params = draftPreset.engineParameters;
    if (params.engineId !== "pixelbrush") return;

    let scatterAmp = typeof params.scatterAmplitude === "number" ? params.scatterAmplitude : 0;
    let hasScatter = Boolean((params.scatterDynamics && params.scatterDynamics.isEnabled) || scatterAmp > 0.01);

    // Configure base parameters
    bridge.setBrushConfig({
      diameter: Math.max(1, params.baseSizePx ?? 32),
      spacing: Math.max(0.01, params.spacingFraction ?? 0.08),
      softness: Math.max(0, Math.min(1, params.softness ?? 0.45)),
      color: [strokeRgb[0], strokeRgb[1], strokeRgb[2], 255],
      opacity: Math.max(0, Math.min(1, params.baseOpacity ?? 1.0)),
      flow: Math.max(0, Math.min(1, params.baseFlow ?? 1.0)),
      sizeByPressure: params.sizeDynamics?.isEnabled ?? true,
      opacityByPressure: params.opacityDynamics?.isEnabled ?? false,
      isErase: false,
      antialias: true,
    });

    // 1. Sync pressure LUT
    if (draftPressureCurve && draftPressureCurve.length >= 2) {
      const pLut = generateCurveLookupTable256(draftPressureCurve);
      bridge.setPressureLut(pLut);
    }

    // 2. Sync multi-dynamics or legacy single dynamics
    const multiDyn = params.multiDynamics;
    if (multiDyn) {
      for (const [paramKey, pConfig] of Object.entries(multiDyn)) {
        if (!pConfig) continue;
        if (pConfig.calculationMode) {
          bridge.setDynamicsCalculationMode(paramKey, pConfig.calculationMode);
        }
        if (pConfig.sensors) {
          for (const [sensorKey, sVal] of Object.entries(pConfig.sensors)) {
            if (!sVal) continue;
            const lut =
              sVal.curvePoints && sVal.curvePoints.length >= 2
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
      // Legacy dynamics
      const sizeDyn = params.sizeDynamics;
      if (sizeDyn && sizeDyn.isEnabled && sizeDyn.curvePoints.length >= 2) {
        const pts = sizeDyn.curvePoints.map((p) => ({ x: p.inputValue, y: p.outputValue }));
        const lut = generateCurveLookupTable256(pts);
        bridge.setDynamicsMapping("size", true, sizeDyn.sensorInput, 0.02, 1.0, lut);
      } else {
        bridge.setDynamicsMapping("size", false, "pressure", 0.0, 1.0, new Float32Array(256));
      }

      const opDyn = params.opacityDynamics;
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

    // 3. Tip geometry (Predefined stamp vs Auto ellipse)
    const tip = params.brushTip;
    if (tip && tip.tipType === "predefined" && tip.imageData && tip.width > 0 && tip.height > 0) {
      const tipId = `pad-tip-${draftPreset.presetId}`;
      const maskBytes = new Uint8Array(tip.imageData.buffer, tip.imageData.byteOffset, tip.imageData.byteLength);
      bridge.registerTipMask(tipId, "Pad Tip", tip.width, tip.height, maskBytes, true);
      const angle = (tip as any).angleRadians ?? 0.0;
      bridge.setBrushPredefinedTip(tipId, 1.0, angle);
    } else {
      bridge.clearBrushPredefinedTip();
      const ar = tip?.tipType === "generated" ? (tip.aspectRatio ?? 1.0) : 1.0;
      const angle = tip?.tipType === "generated" ? (tip.angleRadians ?? 0.0) : 0.0;
      bridge.setBrushAutoTip(ar, angle);
    }

    // 4. Paper grain texture
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
  }, [draftPreset, draftSmoothing, draftPressureCurve, resolvedTheme]);

  // Initialize and resize isolated Wasm engine
  useEffect(() => {
    let active = true;
    const { width, height } = dimensions;
    if (width <= 0 || height <= 0) return;

    let bridge = bridgeRef.current;
    if (!bridge) {
      bridge = new WasmBrushBridge();
      bridgeRef.current = bridge;
      void bridge.initialize(width, height).then((ready) => {
        if (ready && active) {
          bridge?.resizeCanvas(width, height, 0, 0, 0, 0);
          setIsReady(true);
          syncBridgeConfig();
        }
      });
    } else if (bridge.ready) {
      bridge.resizeCanvas(width, height, 0, 0, 0, 0);
      syncBridgeConfig();
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }

    return () => {
      active = false;
    };
  }, [dimensions, syncBridgeConfig]);

  // Sync parameters when draft or ready state changes
  useEffect(() => {
    if (isReady) {
      syncBridgeConfig();
    }
  }, [syncBridgeConfig, isReady]);

  // Simulated Procreate S-Curve stroke
  const handleDrawSampleStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    clearCanvas();

    const w = canvas.width;
    const h = canvas.height;
    const steps = 90;
    const points: StrokePoint[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Fluid S-curve trajectory
      const x = w * (0.2 + 0.6 * t + Math.sin(t * Math.PI * 2) * 0.16);
      const y = h * (0.15 + 0.7 * t);

      // Stylus pressure ramp
      const pressure = Math.pow(Math.sin(t * Math.PI), 0.75) * 0.85 + 0.15;
      const tiltX = Math.sin(t * Math.PI) * 0.6;
      const tiltY = Math.cos(t * Math.PI * 2) * 0.3;

      points.push({
        canvasX: x,
        canvasY: y,
        pressure,
        tiltX,
        tiltY,
        rotation: t * Math.PI,
        timeMs: i * 16.6,
        speed: 400 + Math.sin(t * Math.PI) * 1000,
      });
    }

    if (bridgeRef.current?.ready) {
      bridgeRef.current.beginStroke(points[0], ctx);
      for (let i = 1; i < points.length; i++) {
        bridgeRef.current.extendStroke(points[i], ctx);
      }
      bridgeRef.current.finishStroke(ctx);
    }
    setHasUserDrawn(true);
  }, [clearCanvas]);

  // Automatically draw a sample stroke initially if empty
  useEffect(() => {
    if (isReady && !hasUserDrawn) {
      handleDrawSampleStroke();
    }
  }, [isReady, handleDrawSampleStroke, hasUserDrawn]);

  // Pointer event drawing
  const getCanvasCoords = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const { x, y } = getCanvasCoords(e);
    const pressure = e.pointerType === "mouse" ? (e.buttons === 1 ? 0.7 : 0.0) : Math.max(0.01, e.pressure);

    isDrawingRef.current = true;
    setHasUserDrawn(true);
    pointsRef.current = [{ x, y, pressure }];
    strokeStepCountRef.current = 0;
    const now = performance.now();
    lastTimeRef.current = now;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (bridgeRef.current?.ready) {
      bridgeRef.current.beginStroke(
        {
          canvasX: x,
          canvasY: y,
          pressure,
          tiltX: (e.tiltX || 0) / 90,
          tiltY: (e.tiltY || 0) / 90,
          rotation: 0,
          timeMs: now,
          speed: 0,
        },
        ctx
      );
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoords(e);
    const pressure = e.pointerType === "mouse" ? (e.buttons === 1 ? 0.7 : 0.0) : Math.max(0.01, e.pressure);

    const prevPoint = pointsRef.current[pointsRef.current.length - 1];
    const now = performance.now();
    const dt = Math.max(1, now - (lastTimeRef.current || now));
    const dist = prevPoint ? Math.hypot(x - prevPoint.x, y - prevPoint.y) : 0;
    const speed = (dist / dt) * 1000;
    lastTimeRef.current = now;

    pointsRef.current.push({ x, y, pressure });
    strokeStepCountRef.current++;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (bridgeRef.current?.ready) {
      bridgeRef.current.extendStroke(
        {
          canvasX: x,
          canvasY: y,
          pressure,
          tiltX: (e.tiltX || 0) / 90,
          tiltY: (e.tiltY || 0) / 90,
          rotation: 0,
          timeMs: now,
          speed,
        },
        ctx
      );
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const ctx = canvas?.getContext("2d");
    if (ctx && bridgeRef.current?.ready) {
      bridgeRef.current.finishStroke(ctx);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full w-full bg-zinc-900/90 dark:bg-zinc-950/80 relative overflow-hidden select-none ${className}`}
    >
      {/* Top Pad Header Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/40 dark:bg-zinc-900/40 border-b border-zinc-200/10 dark:border-white/5 backdrop-blur-xs shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">
            Drawing Pad
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDrawSampleStroke}
            title="Generate sample stroke"
            aria-label="Generate sample stroke"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 border border-white/5 transition-all cursor-pointer"
          >
            <Wand2 className="w-3 h-3 text-blue-400" />
            <span>Sample</span>
          </button>

          <button
            type="button"
            onClick={clearCanvas}
            title="Clear drawing pad"
            aria-label="Clear drawing pad"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-red-400 bg-zinc-700/40 hover:bg-red-500/10 border border-white/5 transition-all cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Interactive Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none block"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
          }}
        />
      </div>
    </div>
  );
};
