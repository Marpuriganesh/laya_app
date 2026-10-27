import { useRef, useCallback, type FC, type PointerEvent as ReactPointerEvent } from "react";

export interface ShapeRotationDialProps {
  valueRadians: number; // 0 to 2*PI
  onChange: (radians: number) => void;
  size?: number;
  className?: string;
}

export const ShapeRotationDial: FC<ShapeRotationDialProps> = ({
  valueRadians,
  onChange,
  size = 110,
  className = "",
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const radius = (size - 24) / 2;
  const center = size / 2;

  // Degrees: 0° to 360°
  const degrees = Math.round(((valueRadians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * (180 / Math.PI));

  // Handle position on circle
  // 0 rad = top (or 3 o'clock; in Procreate 0° is 12 o'clock or right; let's standard math: 0 rad = right, moving clockwise)
  const handleX = center + radius * Math.cos(valueRadians);
  const handleY = center + radius * Math.sin(valueRadians);

  const updateAngleFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;

      let angle = Math.atan2(dy, dx);
      if (angle < 0) {
        angle += 2 * Math.PI;
      }
      onChange(angle);
    },
    [onChange]
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
      // Ignored if already released
    }
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 select-none ${className}`}>
      <div className="relative">
        <svg
          ref={svgRef}
          width={size}
          height={size}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-crosshair touch-none select-none"
          role="slider"
          aria-label="Brush tip rotation dial"
          aria-valuenow={degrees}
          aria-valuemin={0}
          aria-valuemax={360}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange((valueRadians + (5 * Math.PI) / 180) % (2 * Math.PI));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(((valueRadians - (5 * Math.PI) / 180) + 2 * Math.PI) % (2 * Math.PI));
            }
          }}
        >
          {/* Outer circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="stroke-zinc-200 dark:stroke-zinc-700/80 fill-zinc-100/50 dark:fill-zinc-800/40"
            strokeWidth={1.5}
          />

          {/* Quadrant tick marks: 0°, 90°, 180°, 270° */}
          <line
            x1={center + radius - 4}
            y1={center}
            x2={center + radius + 3}
            y2={center}
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1}
          />
          <line
            x1={center}
            y1={center + radius - 4}
            x2={center}
            y2={center + radius + 3}
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1}
          />
          <line
            x1={center - radius + 4}
            y1={center}
            x2={center - radius - 3}
            y2={center}
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1}
          />
          <line
            x1={center}
            y1={center - radius + 4}
            x2={center}
            y2={center - radius - 3}
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1}
          />

          {/* Needle indicator from center to handle */}
          <line
            x1={center}
            y1={center}
            x2={handleX}
            y2={handleY}
            className="stroke-blue-500/80 dark:stroke-blue-400/80"
            strokeWidth={1.5}
            strokeDasharray="2,2"
          />

          {/* Center pivot dot */}
          <circle
            cx={center}
            cy={center}
            r={3}
            className="fill-zinc-400 dark:fill-zinc-500"
          />

          {/* Interactive drag handle */}
          <circle
            cx={handleX}
            cy={handleY}
            r={7}
            className="fill-blue-600 stroke-white dark:stroke-zinc-900 shadow-md transition-transform active:scale-125"
            strokeWidth={2}
          />
          <circle
            cx={handleX}
            cy={handleY}
            r={2.5}
            className="fill-white"
          />
        </svg>

        {/* Live Angle Readout Badge */}
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 pointer-events-none">
          {degrees}°
        </div>
      </div>
    </div>
  );
};
