import { useState, useRef, useCallback, type FC, type PointerEvent, type MouseEvent } from "react";
import {
  evaluateMonotonicCurve,
  createLinearCurve,
  createSoftCurve,
  createFirmCurve,
  createSCurve,
  createDeadzoneCurve,
  clampScalar,
  type CurvePoint,
} from "@/engine/math/dynamics_curve";
import { RotateCcw, Activity } from "lucide-react";

export interface CurveEditorProps {
  value: readonly CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  width?: number;
  height?: number;
  inputLabel?: string;
  outputLabel?: string;
  showLiveTelemetry?: boolean;
  showPresets?: boolean;
  className?: string;
}

export const CurveEditor: FC<CurveEditorProps> = ({
  value,
  onChange,
  width = 260,
  height = 170,
  inputLabel = "Pressure In",
  outputLabel = "Output Scale",
  showLiveTelemetry = true,
  showPresets = true,
  className = "",
}) => {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [livePressure, setLivePressure] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Safe internal padding so endpoint circles (radius 6px + 2px border) never clip against SVG boundaries
  const padX = 14;
  const padY = 14;
  const graphW = width - padX * 2;
  const graphH = height - padY * 2;

  // Coordinate Conversion Functions
  const toScreenX = useCallback((nx: number) => padX + nx * graphW, [graphW]);
  const toScreenY = useCallback((ny: number) => padY + (1.0 - ny) * graphH, [graphH]);

  const toNormX = useCallback(
    (sx: number) => clampScalar((sx - padX) / graphW, 0.0, 1.0),
    [graphW]
  );
  const toNormY = useCallback(
    (sy: number) => clampScalar(1.0 - (sy - padY) / graphH, 0.0, 1.0),
    [graphH]
  );

  // Keep ref in sync for synchronous pointer event processing
  activeIndexRef.current = activePointIndex;

  // 1. Unified Pointer Down on SVG (Handles grabbing existing points OR fluidly creating & immediately dragging a new point)
  const handleSvgPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = ((e.clientX - rect.left) / rect.width) * width;
    const clientY = ((e.clientY - rect.top) / rect.height) * height;

    // Check if clicked close to an existing control point (hit radius 16px)
    let hitIndex = -1;
    let minDistance = 16;
    for (let i = 0; i < value.length; i++) {
      const px = toScreenX(value[i].x);
      const py = toScreenY(value[i].y);
      const dist = Math.hypot(px - clientX, py - clientY);
      if (dist < minDistance) {
        minDistance = dist;
        hitIndex = i;
      }
    }

    if (hitIndex >= 0) {
      // Grabbed existing point
      setActivePointIndex(hitIndex);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Otherwise: click on canvas to add a new point fluidly
    const normX = toNormX(clientX);
    const normY = toNormY(clientY);

    // Max 10 points
    if (value.length >= 10) return;

    // Don't add if x is too close to endpoints (within 0.03) or any existing point
    if (normX <= 0.03 || normX >= 0.97) return;
    const tooCloseToX = value.some((p) => Math.abs(p.x - normX) < 0.04);
    if (tooCloseToX) return;

    // If click is within 35px of the actual curve line, snap Y to curve for a natural feel
    const curveNormY = evaluateMonotonicCurve(value, normX);
    const curveScreenY = toScreenY(curveNormY);
    const effectiveNormY =
      Math.abs(curveScreenY - clientY) < 35 ? curveNormY : normY;

    const newPoint: CurvePoint = { x: normX, y: effectiveNormY };
    const nextPoints = [...value, newPoint].sort((a, b) => a.x - b.x);
    const newIndex = nextPoints.findIndex((p) => p === newPoint);

    onChange(nextPoints);
    setActivePointIndex(newIndex);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // 2. Smooth Pointer Move on SVG Canvas
  const handleSvgPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const idx = activeIndexRef.current;
    if (idx === null || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clientX = ((e.clientX - rect.left) / rect.width) * width;
    const clientY = ((e.clientY - rect.top) / rect.height) * height;

    const newNormX = toNormX(clientX);
    const newNormY = toNormY(clientY);

    const nextPoints = [...value].map((p) => ({ ...p }));

    if (idx === 0) {
      // First point: locked at x=0
      nextPoints[0] = { x: 0.0, y: newNormY };
    } else if (idx === nextPoints.length - 1) {
      // Last point: locked at x=1
      nextPoints[idx] = { x: 1.0, y: newNormY };
    } else {
      // Interior point: bounded between previous and next points
      const minX = (nextPoints[idx - 1]?.x ?? 0.0) + 0.025;
      const maxX = (nextPoints[idx + 1]?.x ?? 1.0) - 0.025;
      nextPoints[idx] = {
        x: clampScalar(newNormX, minX, maxX),
        y: newNormY,
      };
    }

    onChange(nextPoints);
  };

  const handleSvgPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    setActivePointIndex(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // 3. Delete Point on Double-click or Context Menu
  const handleDeletePoint = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (index === 0 || index === value.length - 1) return; // Cannot delete endpoints
    const nextPoints = value.filter((_, i) => i !== index);
    onChange(nextPoints);
    setActivePointIndex(null);
  };

  // 4. Live Stylus Testing Pad
  const handleTestPointer = (e: PointerEvent<HTMLDivElement>) => {
    let p = e.pressure;
    if (e.pointerType === "mouse" || p <= 0.001) {
      const rect = e.currentTarget.getBoundingClientRect();
      p = clampScalar((e.clientX - rect.left) / rect.width, 0.0, 1.0);
    }
    setLivePressure(clampScalar(p, 0.0, 1.0));
  };

  const handleTestPointerUp = () => {
    setLivePressure(null);
  };

  // 5. Generate Curve and Area Fill using the shared (toScreenX, toScreenY) coordinates
  const samples = 48;
  let curvePath = "";
  let areaPath = "";

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const yVal = evaluateMonotonicCurve(value, t);
    const sx = toScreenX(t);
    const sy = toScreenY(yVal);
    const prefix = i === 0 ? "M" : "L";
    curvePath += `${prefix} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
    areaPath += `${prefix} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
  }

  const bottomY = toScreenY(0.0);
  const startX = toScreenX(0.0);
  const endX = toScreenX(1.0);
  areaPath += ` L ${endX.toFixed(1)} ${bottomY.toFixed(1)} L ${startX.toFixed(1)} ${bottomY.toFixed(1)} Z`;

  // Live Telemetry coordinates
  const liveOutput =
    livePressure !== null ? evaluateMonotonicCurve(value, livePressure) : null;
  const liveScreenX = livePressure !== null ? toScreenX(livePressure) : null;
  const liveScreenY = liveOutput !== null ? toScreenY(liveOutput) : null;

  return (
    <div className={`flex flex-col gap-2.5 select-none text-zinc-800 dark:text-zinc-200 ${className}`}>
      {/* Curve Canvas Area */}
      <div className="relative rounded-xl bg-zinc-50 dark:bg-zinc-900/95 border border-zinc-200 dark:border-white/5 shadow-inner overflow-hidden">
        {/* Subtle Axis Watermarks */}
        <div className="absolute top-2 left-2 text-[9px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none select-none">
          {outputLabel} (1.0)
        </div>
        <div className="absolute bottom-2 right-2 text-[9px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none select-none">
          {inputLabel} (1.0)
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
          className="w-full h-auto block cursor-crosshair touch-none select-none"
        >
          {/* Subtle Grid Lines (25%, 50%, 75%) */}
          <line
            x1={toScreenX(0.0)}
            y1={toScreenY(0.25)}
            x2={toScreenX(1.0)}
            y2={toScreenY(0.25)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.0)}
            y1={toScreenY(0.5)}
            x2={toScreenX(1.0)}
            y2={toScreenY(0.5)}
            stroke="currentColor"
            className="text-zinc-300 dark:text-white/10"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.0)}
            y1={toScreenY(0.75)}
            x2={toScreenX(1.0)}
            y2={toScreenY(0.75)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />

          <line
            x1={toScreenX(0.25)}
            y1={toScreenY(0.0)}
            x2={toScreenX(0.25)}
            y2={toScreenY(1.0)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.5)}
            y1={toScreenY(0.0)}
            x2={toScreenX(0.5)}
            y2={toScreenY(1.0)}
            stroke="currentColor"
            className="text-zinc-300 dark:text-white/10"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.75)}
            y1={toScreenY(0.0)}
            x2={toScreenX(0.75)}
            y2={toScreenY(1.0)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />

          {/* 1:1 Reference Line */}
          <line
            x1={toScreenX(0.0)}
            y1={toScreenY(0.0)}
            x2={toScreenX(1.0)}
            y2={toScreenY(1.0)}
            stroke="currentColor"
            className="text-zinc-300/80 dark:text-white/10"
            strokeDasharray="4 4"
            strokeWidth="1"
          />

          {/* Smooth Shaded Area Fill Under Curve */}
          <path d={areaPath} className="fill-blue-500/10 dark:fill-blue-500/20" />

          {/* Smooth Spline Curve Stroke */}
          <path
            d={curvePath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live Telemetry Indicator Dot */}
          {liveScreenX !== null && liveScreenY !== null && (
            <g className="animate-in fade-in duration-75">
              <line
                x1={liveScreenX}
                y1={toScreenY(0.0)}
                x2={liveScreenX}
                y2={toScreenY(1.0)}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />
              <circle
                cx={liveScreenX}
                cy={liveScreenY}
                r="9"
                className="fill-blue-500/30 animate-ping"
              />
              <circle
                cx={liveScreenX}
                cy={liveScreenY}
                r="5"
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Interactive Control Points */}
          {value.map((point, index) => {
            const cx = toScreenX(point.x);
            const cy = toScreenY(point.y);
            const isActive = activePointIndex === index;

            return (
              <g key={index}>
                {/* Hit circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="14"
                  fill="transparent"
                  className="cursor-grab active:cursor-grabbing"
                  onDoubleClick={(e) => handleDeletePoint(index, e)}
                  onContextMenu={(e) => handleDeletePoint(index, e)}
                />
                {/* Visible point */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6.5 : 5}
                  className={`pointer-events-none transition-transform duration-75 ${
                    isActive
                      ? "fill-blue-600 stroke-white dark:stroke-zinc-900 stroke-2 drop-shadow-md"
                      : "fill-white dark:fill-zinc-200 stroke-blue-600 stroke-2 drop-shadow-sm"
                  }`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Live Stylus Pressure Testing Strip */}
      {showLiveTelemetry && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-blue-500" />
              <span>Test Stylus Pressure</span>
            </span>
            <span>
              {livePressure !== null && liveOutput !== null
                ? `In: ${Math.round(livePressure * 100)}% ➔ Out: ${Math.round(liveOutput * 100)}%`
                : "Press or drag here"}
            </span>
          </div>

          <div
            onPointerDown={handleTestPointer}
            onPointerMove={(e) => {
              if (e.buttons > 0) handleTestPointer(e);
            }}
            onPointerUp={handleTestPointerUp}
            onPointerCancel={handleTestPointerUp}
            onPointerLeave={handleTestPointerUp}
            className="w-full h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/5 flex items-center justify-center cursor-crosshair touch-none transition-colors relative overflow-hidden"
            title="Press down with stylus to test pressure curve response live"
          >
            {liveOutput !== null && (
              <div
                className="absolute inset-y-0 left-0 bg-blue-500/25 dark:bg-blue-500/30 transition-all duration-75"
                style={{ width: `${Math.round(liveOutput * 100)}%` }}
              />
            )}
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none relative z-10">
              {livePressure !== null ? `${Math.round(livePressure * 100)}%` : "Draw / Press with stylus"}
            </span>
          </div>
        </div>
      )}

      {/* Preset Pills */}
      {showPresets && (
        <div className="flex items-center justify-between gap-1 pt-0.5">
          <div className="flex gap-1 flex-wrap items-center">
            <button
              type="button"
              onClick={() => onChange(createLinearCurve())}
              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="1:1 Linear default pressure response"
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => onChange(createSoftCurve())}
              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Soft touch: high initial sensitivity"
            >
              Soft
            </button>
            <button
              type="button"
              onClick={() => onChange(createFirmCurve())}
              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Firm touch: requires heavier hand pressure"
            >
              Firm
            </button>
            <button
              type="button"
              onClick={() => onChange(createSCurve())}
              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="S-Curve: subtle low end with rapid high-contrast midtones"
            >
              S-Curve
            </button>
            <button
              type="button"
              onClick={() => onChange(createDeadzoneCurve())}
              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Deadzone: ignores resting feather touches below 10%"
            >
              Deadzone
            </button>
          </div>

          <button
            type="button"
            onClick={() => onChange(createLinearCurve())}
            title="Reset curve to linear"
            aria-label="Reset curve"
            className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
