/**
 * Brush Scratchpad
 * Ultra-lightweight, memory-efficient live drawing canvas for instant brush experimentation.
 * Powered by an isolated WasmBrushBridge instance running Rust sketch_core's
 * continuous midpoint quadratic Bézier splines and subpixel dab stepping (zero faceting),
 * with graceful smooth spline fallback for headless environments.
 */

import { useRef, useEffect, useCallback, useState, type FC, type PointerEvent } from "react";
import { Trash2, Sparkles } from "lucide-react";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { WasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";

export interface BrushScratchpadProps {
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

  const isDrawingRef = useRef(false);
  const pointsRef = useRef<PointWithPressure[]>([]);

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
  }, []);

  // Initialize isolated Wasm engine for scratchpad
  useEffect(() => {
    const bridge = new WasmBrushBridge();
    bridgeRef.current = bridge;

    void bridge.initialize(width, height).then((ready) => {
      if (ready) {
        bridge.resizeCanvas(width, height, 0, 0, 0, 0);
        setIsReady(true);
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
  }, [width, height, clearCanvas]);

  // Sync brush parameters to Wasm bridge whenever they change:
  // Always pure white in dark mode, pure black in light mode (no need to follow selected color)
  useEffect(() => {
    if (!bridgeRef.current) return;
    const strokeRgb: [number, number, number] = resolvedTheme === "dark" ? [255, 255, 255] : [0, 0, 0];
    bridgeRef.current.setBrushConfig({
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
  }, [brushSize, brushOpacity, softness, spacing, sizeDynamics, opacityDynamics, resolvedTheme]);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pointerType === "pen" ? Math.max(0.05, Math.min(1.0, e.pressure)) : 0.75;
    const timeMs = performance.now();

    isDrawingRef.current = true;
    pointsRef.current = [{ x, y, pressure }];

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (bridgeRef.current?.ready) {
      bridgeRef.current.beginStroke(
        { canvasX: x, canvasY: y, pressure, timeMs, tiltX: 0, tiltY: 0, rotation: 0, speed: 0 },
        ctx
      );
    } else {
      // Spline fallback: Stamp single initial dab (white in dark mode, black in light mode)
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pointerType === "pen" ? Math.max(0.05, Math.min(1.0, e.pressure)) : 0.75;
    const timeMs = performance.now();

    const points = pointsRef.current;
    const prev = points[points.length - 1];
    if (prev) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      if (dx * dx + dy * dy < 0.8) return;
    }

    points.push({ x, y, pressure });

    if (bridgeRef.current?.ready) {
      // Canonical Rust brush engine: continuous midpoint quadratic Bézier splines
      bridgeRef.current.extendStroke(
        { canvasX: x, canvasY: y, pressure, timeMs, tiltX: 0, tiltY: 0, rotation: 0, speed: 0 },
        ctx
      );
    } else {
      // Continuous Midpoint Quadratic Bézier Spline Fallback (NO linear faceting!)
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
  };

  return (
    <div
      className={`relative flex flex-col items-center bg-white dark:bg-zinc-950/80 rounded-xl border border-zinc-200 dark:border-white/10 shadow-inner overflow-hidden ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {/* Scratchpad Header Info */}
      <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none select-none z-10">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/10 dark:bg-white/10 backdrop-blur-md text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
          <Sparkles className="w-3 h-3 text-blue-500" />
          <span>Scratchpad</span>
          {isReady && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Wasm Engine Active" />}
        </div>

        <button
          type="button"
          onClick={clearCanvas}
          title="Clear Scratchpad"
          aria-label="Clear Scratchpad"
          className="pointer-events-auto p-1.5 rounded-lg bg-white/80 dark:bg-zinc-800/80 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 border border-zinc-200/80 dark:border-white/10 shadow-xs transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
