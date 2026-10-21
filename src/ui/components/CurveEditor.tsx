import { useState, useRef, useCallback, type FC, type PointerEvent, type MouseEvent } from "react";
import {
  evaluateMonotonicCurve,
  generateSvgPathFromCurve,
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
  width = 240,
  height = 180,
  inputLabel = "Pressure In",
  outputLabel = "Output Scale",
  showLiveTelemetry = true,
  showPresets = true,
  className = "",
}) => {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [livePressure, setLivePressure] = useState<number | null>(null);
  const graphRef = useRef<SVGSVGElement>(null);

  // Padding inside SVG canvas so endpoints don't get clipped
  const pad = 12;
  const graphW = width - pad * 2;
  const graphH = height - pad * 2;

  // Normalized [0..1] to SVG Screen Coordinates
  const toScreenX = useCallback((nx: number) => pad + nx * graphW, [graphW]);
  const toScreenY = useCallback((ny: number) => pad + (1.0 - ny) * graphH, [graphH]);

  // Screen Coordinates to Normalized [0..1]
  const toNormX = useCallback(
    (sx: number) => clampScalar((sx - pad) / graphW, 0.0, 1.0),
    [graphW]
  );
  const toNormY = useCallback(
    (sy: number) => clampScalar(1.0 - (sy - pad) / graphH, 0.0, 1.0),
    [graphH]
  );

  // 1. Pointer Dragging on Existing Control Points
  const handlePointPointerDown = (index: number, e: PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActivePointIndex(index);
  };

  const handlePointPointerMove = (index: number, e: PointerEvent<SVGCircleElement>) => {
    if (activePointIndex !== index || !graphRef.current) return;
    const rect = graphRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const newNormX = toNormX(clientX);
    const newNormY = toNormY(clientY);

    const nextPoints = [...value].map((p) => ({ ...p }));

    // Endpoints: x is locked to 0 or 1, only y can change
    if (index === 0) {
      nextPoints[0] = { x: 0.0, y: newNormY };
    } else if (index === nextPoints.length - 1) {
      nextPoints[index] = { x: 1.0, y: newNormY };
    } else {
      // Interior points: clamp x between neighbor points with minimum clearance
      const minX = (nextPoints[index - 1]?.x ?? 0.0) + 0.03;
      const maxX = (nextPoints[index + 1]?.x ?? 1.0) - 0.03;
      nextPoints[index] = {
        x: clampScalar(newNormX, minX, maxX),
        y: newNormY,
      };
    }

    onChange(nextPoints);
  };

  const handlePointPointerUp = (e: PointerEvent<SVGCircleElement>) => {
    setActivePointIndex(null);
    if ((e.target as Element).hasPointerCapture(e.pointerId)) {
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  };

  // 2. Click to Add Point on Graph Background
  const handleGraphClick = (e: MouseEvent<SVGSVGElement>) => {
    if (activePointIndex !== null || !graphRef.current) return;
    const rect = graphRef.current.getBoundingClientRect();
    const normX = toNormX(e.clientX - rect.left);
    const normY = toNormY(e.clientY - rect.top);

    // Max 8 points to prevent over-complication
    if (value.length >= 8) return;

    // Don't add if too close to an existing point
    const isTooClose = value.some(
      (p) => Math.hypot(p.x - normX, p.y - normY) < 0.06
    );
    if (isTooClose) return;

    const newPoint: CurvePoint = { x: normX, y: normY };
    const nextPoints = [...value, newPoint].sort((a, b) => a.x - b.x);
    onChange(nextPoints);
  };

  // 3. Double-click or Right-click to Delete Interior Point
  const handlePointDoubleClick = (index: number, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (index === 0 || index === value.length - 1) return; // Cannot delete endpoints
    const nextPoints = value.filter((_, idx) => idx !== index);
    onChange(nextPoints);
  };

  // 4. Live Pressure Testing Pad
  const handleTestPointer = (e: PointerEvent<HTMLDivElement>) => {
    let p = e.pressure;
    // Fallback for mouse dragging on test pad: simulate pressure by horizontal ratio
    if (e.pointerType === "mouse" || p <= 0.001) {
      const rect = e.currentTarget.getBoundingClientRect();
      p = clampScalar((e.clientX - rect.left) / rect.width, 0.0, 1.0);
    }
    setLivePressure(clampScalar(p, 0.0, 1.0));
  };

  const handleTestPointerUp = () => {
    setLivePressure(null);
  };

  // Precomputed Spline Curve SVG Path
  const curvePath = generateSvgPathFromCurve(value, graphW, graphH, 48);

  // Closed Path for Subtle Area Fill under curve
  const areaPath = `${curvePath} L ${(pad + graphW).toFixed(2)} ${(pad + graphH).toFixed(2)} L ${pad.toFixed(2)} ${(pad + graphH).toFixed(2)} Z`;

  // Evaluated live telemetry coordinates
  const liveOutput =
    livePressure !== null ? evaluateMonotonicCurve(value, livePressure) : null;
  const liveScreenX =
    livePressure !== null ? toScreenX(livePressure) : null;
  const liveScreenY =
    liveOutput !== null ? toScreenY(liveOutput) : null;

  return (
    <div className={`flex flex-col gap-2.5 select-none text-zinc-800 dark:text-zinc-200 ${className}`}>
      {/* Curve Canvas Area */}
      <div className="relative rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-white/5 p-2 shadow-inner overflow-hidden">
        {/* Axis Labels */}
        <div className="absolute top-2 left-2 text-[9px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none">
          {outputLabel} (1.0)
        </div>
        <div className="absolute bottom-2 right-2 text-[9px] font-mono font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none">
          {inputLabel} (1.0)
        </div>

        <svg
          ref={graphRef}
          width={width}
          height={height}
          onClick={handleGraphClick}
          className="cursor-crosshair touch-none"
        >
          {/* Subtle Grid Lines (25%, 50%, 75%) */}
          <line
            x1={pad}
            y1={toScreenY(0.25)}
            x2={pad + graphW}
            y2={toScreenY(0.25)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />
          <line
            x1={pad}
            y1={toScreenY(0.5)}
            x2={pad + graphW}
            y2={toScreenY(0.5)}
            stroke="currentColor"
            className="text-zinc-300 dark:text-white/10"
            strokeDasharray="3 3"
          />
          <line
            x1={pad}
            y1={toScreenY(0.75)}
            x2={pad + graphW}
            y2={toScreenY(0.75)}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />

          <line
            x1={toScreenX(0.25)}
            y1={pad}
            x2={toScreenX(0.25)}
            y2={pad + graphH}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.5)}
            y1={pad}
            x2={toScreenX(0.5)}
            y2={pad + graphH}
            stroke="currentColor"
            className="text-zinc-300 dark:text-white/10"
            strokeDasharray="3 3"
          />
          <line
            x1={toScreenX(0.75)}
            y1={pad}
            x2={toScreenX(0.75)}
            y2={pad + graphH}
            stroke="currentColor"
            className="text-zinc-200 dark:text-white/5"
            strokeDasharray="3 3"
          />

          {/* 1:1 Linear Reference Line */}
          <line
            x1={pad}
            y1={pad + graphH}
            x2={pad + graphW}
            y2={pad}
            stroke="currentColor"
            className="text-zinc-300/80 dark:text-white/10"
            strokeDasharray="4 4"
            strokeWidth="1"
          />

          {/* Area Fill under Curve */}
          <path d={areaPath} className="fill-blue-500/10 dark:fill-blue-500/15" />

          {/* Interpolated Monotonic Spline Line */}
          <g transform={`translate(${pad}, ${pad})`}>
            <path
              d={curvePath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Live Telemetry Indicator (Stylus input feedback) */}
          {liveScreenX !== null && liveScreenY !== null && (
            <g className="animate-in fade-in duration-75">
              {/* Vertical tracking line */}
              <line
                x1={liveScreenX}
                y1={pad}
                x2={liveScreenX}
                y2={pad + graphH}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />
              {/* Outer pulse aura */}
              <circle
                cx={liveScreenX}
                cy={liveScreenY}
                r="9"
                className="fill-blue-500/30 animate-ping"
              />
              {/* Center point */}
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

          {/* Draggable Control Points */}
          {value.map((point, index) => {
            const cx = toScreenX(point.x);
            const cy = toScreenY(point.y);
            const isActive = activePointIndex === index;

            return (
              <g key={index}>
                {/* Invisible larger hit circle for easy stylus grab */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="12"
                  fill="transparent"
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => handlePointPointerDown(index, e)}
                  onPointerMove={(e) => handlePointPointerMove(index, e)}
                  onPointerUp={handlePointPointerUp}
                  onPointerCancel={handlePointPointerUp}
                  onDoubleClick={(e) => handlePointDoubleClick(index, e)}
                  onContextMenu={(e) => handlePointDoubleClick(index, e)}
                />
                {/* Visible Control Point */}
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
            {/* Live Visual Gauge filling horizontally */}
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

      {/* Preset Buttons */}
      {showPresets && (
        <div className="flex items-center justify-between gap-1 pt-1">
          <div className="flex gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => onChange(createLinearCurve())}
              className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="1:1 Linear default pressure response"
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => onChange(createSoftCurve())}
              className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Soft touch: high initial sensitivity"
            >
              Soft
            </button>
            <button
              type="button"
              onClick={() => onChange(createFirmCurve())}
              className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Firm touch: requires heavier hand pressure"
            >
              Firm
            </button>
            <button
              type="button"
              onClick={() => onChange(createSCurve())}
              className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
              title="S-Curve: subtle low end with rapid high-contrast midtones"
            >
              S-Curve
            </button>
            <button
              type="button"
              onClick={() => onChange(createDeadzoneCurve())}
              className="px-2 py-1 text-[10px] font-medium rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
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
