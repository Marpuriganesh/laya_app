import { useRef, useCallback, type FC, type PointerEvent as ReactPointerEvent } from "react";

export interface StylusTiltArcWidgetProps {
  /** Tilt threshold elevation angle in degrees (0° = flat against canvas, 90° = vertical upright) */
  valueDegrees: number;
  onChange: (degrees: number) => void;
  size?: number;
  className?: string;
}

export const StylusTiltArcWidget: FC<StylusTiltArcWidgetProps> = ({
  valueDegrees,
  onChange,
  size = 180,
  className = "",
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Quarter circle parameters: origin at bottom-left (padding inset)
  const pad = 24;
  const arcRadius = size - pad * 2;
  const originX = pad;
  const originY = size - pad;

  // Clamped angle in degrees: 0° (flat/horizontal) to 90° (vertical)
  const clampedDeg = Math.max(0, Math.min(90, valueDegrees));
  const rad = (clampedDeg * Math.PI) / 180;

  // Point on arc: 0° is along horizontal axis (x = originX + R, y = originY)
  // 90° is along vertical axis (x = originX, y = originY - R)
  const handleX = originX + arcRadius * Math.cos(rad);
  const handleY = originY - arcRadius * Math.sin(rad);

  const updateAngleFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = size / rect.width;
      const scaleY = size / rect.height;

      const px = (clientX - rect.left) * scaleX;
      const py = (clientY - rect.top) * scaleY;

      const dx = px - originX;
      const dy = originY - py; // Invert Y since screen coordinates increase downwards

      if (dx <= 0 && dy <= 0) return;

      const angleRad = Math.atan2(Math.max(0, dy), Math.max(0, dx));
      const deg = Math.round((angleRad * 180) / Math.PI);
      onChange(Math.max(0, Math.min(90, deg)));
    },
    [onChange, size, originX, originY]
  );

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateAngleFromEvent(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    updateAngleFromEvent(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  // SVG arc path for filled wedge sector
  const wedgePath = `M ${originX} ${originY} L ${originX + arcRadius} ${originY} A ${arcRadius} ${arcRadius} 0 0 0 ${originX} ${originY - arcRadius} Z`;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <div className="relative w-full flex items-center justify-center p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-inner">
        <svg
          ref={svgRef}
          width={size}
          height={size}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-pointer touch-none select-none"
          role="slider"
          aria-label="Stylus tilt threshold angle"
          aria-valuenow={clampedDeg}
          aria-valuemin={0}
          aria-valuemax={90}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              e.preventDefault();
              onChange(Math.min(90, clampedDeg + 2));
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
              e.preventDefault();
              onChange(Math.max(0, clampedDeg - 2));
            }
          }}
        >
          {/* Shaded quarter circle wedge (matching Procreate dark sector) */}
          <path
            d={wedgePath}
            className="fill-zinc-800/60 stroke-zinc-700/50"
            strokeWidth={1}
          />

          {/* Subtly shaded active angle sector up to the handle */}
          <path
            d={`M ${originX} ${originY} L ${handleX} ${handleY} A ${arcRadius} ${arcRadius} 0 0 1 ${originX + arcRadius} ${originY} Z`}
            className="fill-blue-500/10 stroke-none"
          />

          {/* Quarter circle arc track */}
          <path
            d={`M ${originX + arcRadius} ${originY} A ${arcRadius} ${arcRadius} 0 0 0 ${originX} ${originY - arcRadius}`}
            className="stroke-zinc-600 fill-none"
            strokeWidth={2}
          />

          {/* Radial line from origin to handle */}
          <line
            x1={originX}
            y1={originY}
            x2={handleX}
            y2={handleY}
            className="stroke-blue-400/80"
            strokeWidth={1.5}
            strokeDasharray="3,3"
          />

          {/* Horizon line (0° surface axis) */}
          <line
            x1={originX}
            y1={originY}
            x2={originX + arcRadius + 8}
            y2={originY}
            className="stroke-zinc-500"
            strokeWidth={1.5}
          />

          {/* Vertical line (90° upright axis) */}
          <line
            x1={originX}
            y1={originY}
            x2={originX}
            y2={originY - arcRadius - 8}
            className="stroke-zinc-500"
            strokeWidth={1.5}
          />

          {/* Origin anchor dot */}
          <circle
            cx={originX}
            cy={originY}
            r={3}
            className="fill-zinc-500"
          />

          {/* Draggable handle dot along arc */}
          <circle
            cx={handleX}
            cy={handleY}
            r={8}
            className="fill-blue-500 stroke-white shadow-lg cursor-grab active:cursor-grabbing transition-transform active:scale-125"
            strokeWidth={2.5}
          />
          <circle
            cx={handleX}
            cy={handleY}
            r={3}
            className="fill-white"
          />

          {/* Axis Labels */}
          <text
            x={originX + arcRadius + 2}
            y={originY + 14}
            className="fill-zinc-400 text-[10px] font-mono select-none"
          >
            0° Flat
          </text>
          <text
            x={originX + 4}
            y={originY - arcRadius - 2}
            className="fill-zinc-400 text-[10px] font-mono select-none"
          >
            90° Upright
          </text>
        </svg>

        {/* Live Angle Readout Badge (matching Procreate's top-right angle badge) */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-mono font-bold bg-zinc-800 border border-zinc-700/80 text-blue-400 shadow-sm pointer-events-none">
          {clampedDeg}°
        </div>
      </div>
    </div>
  );
};
