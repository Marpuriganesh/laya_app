import { useState, useRef, useCallback, useEffect, type FC, type PointerEvent, type MouseEvent, type ChangeEvent } from "react";
import {
  evaluateNaturalSplineCurve,
  generateCurveLookupTable256,
  createLinearCurve,
  KRITA_CURVE_PRESETS,
  clampScalar,
  type CurvePoint,
} from "@/engine/math/dynamics_curve";
import { RotateCcw, Activity } from "lucide-react";

export interface CurveEditorProps {
  value: readonly CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  onLutChange?: (lut: Float32Array) => void;
  width?: number;
  height?: number;
  inputLabel?: string;
  outputLabel?: string;
  showLiveTelemetry?: boolean;
  showPresets?: boolean;
  className?: string;
}

// Fixed coordinate space for SVG vector rendering (automatically scales to 100% container width)
const V_WIDTH = 240;
const V_HEIGHT = 135;
const PAD_X = 10;
const PAD_Y = 10;
const GRAPH_W = V_WIDTH - PAD_X * 2;
const GRAPH_H = V_HEIGHT - PAD_Y * 2;

/**
 * Mini SVG icon visualizing a curve preset shape for toolbar buttons.
 */
const PresetIcon: FC<{ symbol: string; points: readonly CurvePoint[] }> = ({ points }) => {
  const samples = 10;
  let d = "";

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const yVal = evaluateNaturalSplineCurve(points, t);
    const px = 2 + t * 14;
    const py = 2 + (1.0 - yVal) * 14;
    d += `${i === 0 ? "M" : " L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }

  return (
    <svg width={18} height={18} viewBox="0 0 18 18" className="block shrink-0">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const CurveEditor: FC<CurveEditorProps> = ({
  value,
  onChange,
  onLutChange,
  showLiveTelemetry = true,
  showPresets = true,
  className = "",
}) => {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [liveSensor, setLiveSensor] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Coordinate Conversion Functions inside fixed viewBox space
  const toScreenX = useCallback((nx: number) => PAD_X + nx * GRAPH_W, []);
  const toScreenY = useCallback((ny: number) => PAD_Y + (1.0 - ny) * GRAPH_H, []);

  const toNormX = useCallback(
    (sx: number) => clampScalar((sx - PAD_X) / GRAPH_W, 0.0, 1.0),
    []
  );
  const toNormY = useCallback(
    (sy: number) => clampScalar(1.0 - (sy - PAD_Y) / GRAPH_H, 0.0, 1.0),
    []
  );

  // Keep ref in sync
  activeIndexRef.current = activePointIndex;

  // Whenever points change, update LUT if callback provided
  useEffect(() => {
    if (onLutChange) {
      const lut = generateCurveLookupTable256(value);
      onLutChange(lut);
    }
  }, [value, onLutChange]);

  // 1. Unified Pointer Down (grab existing or create & drag new point)
  const handleSvgPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = ((e.clientX - rect.left) / rect.width) * V_WIDTH;
    const clientY = ((e.clientY - rect.top) / rect.height) * V_HEIGHT;

    // Check if clicked close to an existing control point (hit radius 16px in SVG units)
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

    // Limit maximum points
    if (value.length >= 10) return;

    // Don't add if x is right on the endpoints
    if (normX <= 0.03 || normX >= 0.97) return;

    // If click is within 25px of the actual curve line, snap Y to curve for an intuitive touch feel
    const curveNormY = evaluateNaturalSplineCurve(value, normX);
    const curveScreenY = toScreenY(curveNormY);
    const effectiveNormY =
      Math.abs(curveScreenY - clientY) < 25 ? curveNormY : normY;

    const newPoint: CurvePoint = { x: normX, y: clampScalar(effectiveNormY, 0.0, 1.0) };
    const nextPoints = [...value, newPoint].sort((a, b) => a.x - b.x);
    const newIndex = nextPoints.findIndex((p) => p === newPoint);

    onChange(nextPoints);
    setActivePointIndex(newIndex);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // 2. Smooth Pointer Move with dynamic X sorting (no stiff dead walls!)
  const handleSvgPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const idx = activeIndexRef.current;
    if (idx === null || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clientX = ((e.clientX - rect.left) / rect.width) * V_WIDTH;
    const clientY = ((e.clientY - rect.top) / rect.height) * V_HEIGHT;

    const newNormX = toNormX(clientX);
    const newNormY = toNormY(clientY);

    // Endpoint 0: X fixed at 0.0, Y free [0.0 .. 1.0]
    if (idx === 0) {
      const nextPoints = [...value];
      nextPoints[0] = { x: 0.0, y: newNormY };
      onChange(nextPoints);
      return;
    }

    // Endpoint N-1: X fixed at 1.0, Y free [0.0 .. 1.0]
    if (idx === value.length - 1) {
      const nextPoints = [...value];
      nextPoints[idx] = { x: 1.0, y: newNormY };
      onChange(nextPoints);
      return;
    }

    // Interior point: freely moves in X and Y
    const clampedX = clampScalar(newNormX, 0.01, 0.99);
    const targetPoint: CurvePoint = { x: clampedX, y: newNormY };

    // Update point and sort by X to prevent crossing
    const otherPoints = value.filter((_, i) => i !== idx);
    const sorted = [...otherPoints, targetPoint].sort((a, b) => a.x - b.x);
    const newActiveIndex = sorted.indexOf(targetPoint);

    activeIndexRef.current = newActiveIndex;
    setActivePointIndex(newActiveIndex);
    onChange(sorted);
  };

  // 3. Pointer Up
  const handleSvgPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const idx = activeIndexRef.current;
    if (idx !== null && svgRef.current && idx > 0 && idx < value.length - 1) {
      const rect = svgRef.current.getBoundingClientRect();
      const clientY = ((e.clientY - rect.top) / rect.height) * V_HEIGHT;
      // If dragged out of widget vertically (> 30px above or below), delete it
      if (clientY < -30 || clientY > V_HEIGHT + 30) {
        const nextPoints = value.filter((_, i) => i !== idx);
        onChange(nextPoints);
      }
    }

    setActivePointIndex(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // 4. Delete Point on Double-click or Right-click
  const handleDeletePoint = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (index === 0 || index === value.length - 1) return; // Cannot delete endpoints
    const nextPoints = value.filter((_, i) => i !== index);
    onChange(nextPoints);
    setActivePointIndex(null);
  };

  // 5. Direct numerical controls for Start % and End %
  const startY = Math.round((value[0]?.y ?? 0.0) * 100);
  const endY = Math.round((value[value.length - 1]?.y ?? 1.0) * 100);

  const handleStartPercentChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = clampScalar(Number(e.target.value) / 100.0, 0.0, 1.0);
    const next = [...value];
    next[0] = { x: 0.0, y: val };
    onChange(next);
  };

  const handleEndPercentChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = clampScalar(Number(e.target.value) / 100.0, 0.0, 1.0);
    const next = [...value];
    next[next.length - 1] = { x: 1.0, y: val };
    onChange(next);
  };

  // 6. Live Sensor / Stylus Testing Strip
  const handleTestPointer = (e: PointerEvent<HTMLDivElement>) => {
    let p = e.pressure;
    if (e.pointerType === "mouse" || p <= 0.001) {
      const rect = e.currentTarget.getBoundingClientRect();
      p = clampScalar((e.clientX - rect.left) / rect.width, 0.0, 1.0);
    }
    setLiveSensor(clampScalar(p, 0.0, 1.0));
  };

  const handleTestPointerUp = () => {
    setLiveSensor(null);
  };

  // 7. Generate Natural Spline Path and Shaded Area
  const samples = 48;
  let curvePath = "";
  let areaPath = "";

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const yVal = evaluateNaturalSplineCurve(value, t);
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
    liveSensor !== null ? evaluateNaturalSplineCurve(value, liveSensor) : null;
  const liveScreenX = liveSensor !== null ? toScreenX(liveSensor) : null;
  const liveScreenY = liveOutput !== null ? toScreenY(liveOutput) : null;

  return (
    <div className={`w-full max-w-full overflow-hidden flex flex-col gap-2 select-none text-zinc-800 dark:text-zinc-200 ${className}`}>
      {/* 8 Krita Curve Presets Bar: Strictly fluid grid that never overflows */}
      {showPresets && (
        <div className="w-full grid grid-cols-8 gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg border border-zinc-200/80 dark:border-white/5 overflow-hidden">
          {KRITA_CURVE_PRESETS.map((preset) => {
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange([...preset.points])}
                className="flex items-center justify-center p-1 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-700/80 transition-colors cursor-pointer overflow-hidden"
                title={`${preset.name}: ${preset.description}`}
                aria-label={preset.name}
              >
                <PresetIcon symbol={preset.symbol} points={preset.points} />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Curve Graph Canvas: 100% fluid responsive SVG */}
      <div className="relative w-full rounded-xl bg-zinc-50 dark:bg-zinc-900/95 border border-zinc-200 dark:border-white/5 shadow-inner overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
          className="w-full h-auto block cursor-crosshair touch-none select-none"
        >
          {/* Grid Lines (25%, 50%, 75%) */}
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

          {/* 1:1 Reference Diagonal */}
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

          {/* Shaded Area Under Curve */}
          <path d={areaPath} className="fill-blue-500/10 dark:fill-blue-500/20" />

          {/* Natural Spline Curve Stroke */}
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
                r="7"
                className="fill-blue-500/30 animate-ping"
              />
              <circle
                cx={liveScreenX}
                cy={liveScreenY}
                r="4.5"
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Interactive Control Knots */}
          {value.map((point, index) => {
            const cx = toScreenX(point.x);
            const cy = toScreenY(point.y);
            const isActive = activePointIndex === index;
            const isEndpoint = index === 0 || index === value.length - 1;

            return (
              <g key={index}>
                {/* Hit Circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="12"
                  fill="transparent"
                  className="cursor-grab active:cursor-grabbing"
                  onDoubleClick={(e) => handleDeletePoint(index, e)}
                  onContextMenu={(e) => handleDeletePoint(index, e)}
                />
                {/* Visible handle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 5.5 : isEndpoint ? 4.5 : 4}
                  className={`pointer-events-none transition-transform duration-75 ${
                    isActive
                      ? "fill-blue-600 stroke-white dark:stroke-zinc-900 stroke-2 drop-shadow-md"
                      : "fill-white dark:fill-zinc-200 stroke-blue-600 stroke-2 drop-shadow-xs"
                  }`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Min / Max Percentage Numerical Inputs + Reset */}
      <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
        <label className="flex items-center gap-1 cursor-pointer" title="Output value at 0% input">
          <span className="text-zinc-500 dark:text-zinc-400">Min</span>
          <div className="flex items-center">
            <input
              type="number"
              min={0}
              max={100}
              value={startY}
              onChange={handleStartPercentChange}
              className="w-10 h-5 px-1 text-center font-medium rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <span className="ml-0.5 text-zinc-400">%</span>
          </div>
        </label>

        <button
          type="button"
          onClick={() => onChange(createLinearCurve())}
          title="Reset curve to 1:1 linear default"
          aria-label="Reset curve"
          className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <label className="flex items-center gap-1 cursor-pointer" title="Output value at 100% input">
          <span className="text-zinc-500 dark:text-zinc-400">Max</span>
          <div className="flex items-center">
            <input
              type="number"
              min={0}
              max={100}
              value={endY}
              onChange={handleEndPercentChange}
              className="w-10 h-5 px-1 text-center font-medium rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <span className="ml-0.5 text-zinc-400">%</span>
          </div>
        </label>
      </div>

      {/* Live Stylus Pressure Testing Pad (Compact single-line) */}
      {showLiveTelemetry && (
        <div
          onPointerDown={handleTestPointer}
          onPointerMove={(e) => {
            if (e.buttons > 0) handleTestPointer(e);
          }}
          onPointerUp={handleTestPointerUp}
          onPointerCancel={handleTestPointerUp}
          onPointerLeave={handleTestPointerUp}
          className="w-full h-6 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/5 flex items-center justify-between px-2 cursor-crosshair touch-none transition-colors relative overflow-hidden"
          title="Press down with stylus or drag with mouse to test curve response live"
        >
          {liveOutput !== null && (
            <div
              className="absolute inset-y-0 left-0 bg-blue-500/25 dark:bg-blue-500/30 transition-all duration-75"
              style={{ width: `${Math.round(liveOutput * 100)}%` }}
            />
          )}
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 relative z-10 pointer-events-none">
            <Activity className="w-3 h-3 text-blue-500" />
            <span>Stylus Test</span>
          </span>
          <span className="text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-300 relative z-10 pointer-events-none">
            {liveSensor !== null && liveOutput !== null
              ? `${Math.round(liveSensor * 100)}% ➔ ${Math.round(liveOutput * 100)}%`
              : "Draw here"}
          </span>
        </div>
      )}
    </div>
  );
};
