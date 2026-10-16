import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent } from "react";
import { X, Square, Triangle } from "lucide-react";
import {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "@/engine/color/color_conversions";

interface ColorPickerPopoverProps {
  isOpen: boolean;
  activeColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

type PickerTab = "classic" | "artistic";
type InnerShape = "square" | "triangle";

const ARTISTIC_PALETTE = [
  "#000000",
  "#334155",
  "#64748b",
  "#cbd5e1",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#78350f",
];

export const ColorPickerPopover: FC<ColorPickerPopoverProps> = ({
  isOpen,
  activeColor,
  onClose,
  onSelectColor,
}) => {
  const [tab, setTab] = useState<PickerTab>("classic");
  const [innerShape, setInnerShape] = useState<InnerShape>("square");
  const [initialColor] = useState(activeColor);

  // Directly derive HSV from activeColor — single source of truth, no cascading renders
  const [currentHue, currentSaturation, currentValue] = useMemo(() => {
    const rgb = hexToRgb(activeColor) || [30, 30, 30];
    return rgbToHsv(rgb[0], rgb[1], rgb[2]);
  }, [activeColor]);

  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement>(null);
  const artisticCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const [isDraggingInner, setIsDraggingInner] = useState(false);

  // Emit color update
  const commitHsv = useCallback(
    (h: number, s: number, v: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      onSelectColor(rgbToHex(r, g, b));
    },
    [onSelectColor]
  );

  // 1. Draw Outer Hue Ring
  useEffect(() => {
    if (!isOpen || tab !== "classic") return;
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 2;
    const innerRadius = outerRadius - 16;

    ctx.clearRect(0, 0, size, size);

    // Render 360 degree rainbow ring
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 1) * Math.PI) / 180;
      const endAngle = ((angle + 1) * Math.PI) / 180;
      const [r, g, b] = hsvToRgb(angle, 1, 1);

      ctx.beginPath();
      ctx.arc(center, center, outerRadius, startAngle, endAngle);
      ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
    }

    // Draw active Hue needle/indicator handle
    const handleAngle = (currentHue * Math.PI) / 180;
    const handleDist = (outerRadius + innerRadius) / 2;
    const handleX = center + Math.cos(handleAngle) * handleDist;
    const handleY = center + Math.sin(handleAngle) * handleDist;

    ctx.beginPath();
    ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, tab, currentHue]);

  // 2. Draw Inner Saturation-Value Surface (Square or Triangle)
  useEffect(() => {
    if (!isOpen || tab !== "classic") return;
    const canvas = innerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (innerShape === "square") {
      // Horizontal gradient: White to Pure Hue
      const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);
      const horizGrad = ctx.createLinearGradient(0, 0, width, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);

      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, 0, width, height);

      // Vertical gradient: Transparent to Black
      const vertGrad = ctx.createLinearGradient(0, 0, 0, height);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");

      ctx.fillStyle = vertGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw indicator handle
      const handleX = currentSaturation * width;
      const handleY = (1 - currentValue) * height;

      ctx.beginPath();
      ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = currentValue > 0.5 && currentSaturation < 0.5 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else {
      // Triangle Mode (Photoshop / Krita equilateral triangle)
      const topX = width / 2;
      const topY = 10;
      const leftX = 10;
      const leftY = height - 10;
      const rightX = width - 10;
      const rightY = height - 10;

      // Clip to triangle
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.clip();

      // Horizontal base fill: White to Pure Hue
      const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);
      const horizGrad = ctx.createLinearGradient(leftX, 0, rightX, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, 0, width, height);

      // Vertical shade gradient towards black
      const vertGrad = ctx.createLinearGradient(0, topY, 0, leftY);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");
      ctx.fillStyle = vertGrad;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();

      // Triangle border
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Triangle handle position interpolation
      const handleX = leftX + currentSaturation * (rightX - leftX);
      const handleY = topY + (1 - currentValue) * (leftY - topY);

      ctx.beginPath();
      ctx.arc(handleX, handleY, 5, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }, [isOpen, tab, innerShape, currentHue, currentSaturation, currentValue, activeColor]);

  // 3. Draw Krita-Style Artistic Color Selector
  useEffect(() => {
    if (!isOpen || tab !== "artistic") return;
    const canvas = artisticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const sectors = 16;
    const sectorAngle = (Math.PI * 2) / sectors;

    ctx.clearRect(0, 0, size, size);

    // 4 concentric tiers:
    // Tier 0: Pure Hue (outer, r=90-108)
    // Tier 1: Tint (r=68-88) - lightened/desaturated
    // Tier 2: Tone (r=46-66) - muted gray tone
    // Tier 3: Shade (r=24-44) - deep darkened
    const tiers = [
      { rInner: 78, rOuter: 98, sat: 1.0, val: 1.0 },
      { rInner: 56, rOuter: 76, sat: 0.65, val: 0.9 },
      { rInner: 34, rOuter: 54, sat: 0.45, val: 0.6 },
      { rInner: 12, rOuter: 32, sat: 0.7, val: 0.35 },
    ];

    for (let s = 0; s < sectors; s++) {
      const hue = (s * 360) / sectors;
      const startAngle = s * sectorAngle - Math.PI / 2;
      const endAngle = (s + 1) * sectorAngle - Math.PI / 2;

      tiers.forEach((tier) => {
        const [r, g, b] = hsvToRgb(hue, tier.sat, tier.val);
        ctx.beginPath();
        ctx.arc(center, center, tier.rOuter, startAngle, endAngle);
        ctx.arc(center, center, tier.rInner, endAngle, startAngle, true);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Center Neutral Core
    ctx.beginPath();
    ctx.arc(center, center, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#888888";
    ctx.fill();
  }, [isOpen, tab]);

  // Pointer interactions for Outer Hue Ring
  const handleHuePointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    commitHsv(Math.round(angleDeg), currentSaturation, currentValue);
  };

  // Pointer interactions for Inner Saturation-Value box
  const handleInnerPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = innerCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    const s = Math.max(0, Math.min(1, x / canvas.width));
    const v = Math.max(0, Math.min(1, 1 - y / canvas.height));

    commitHsv(currentHue, s, v);
  };

  // Pointer interaction for Krita Artistic Wheel
  const handleArtisticPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = artisticCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;
    const dist = Math.hypot(x, y);

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    // Determine tier from distance
    let sat = 1.0;
    let val = 1.0;
    if (dist >= 78 && dist <= 100) {
      sat = 1.0;
      val = 1.0;
    } else if (dist >= 56 && dist < 78) {
      sat = 0.65;
      val = 0.9;
    } else if (dist >= 34 && dist < 56) {
      sat = 0.45;
      val = 0.6;
    } else if (dist >= 12 && dist < 34) {
      sat = 0.7;
      val = 0.35;
    } else if (dist < 12) {
      // Center neutral
      sat = 0.0;
      val = 0.5;
    }

    commitHsv(Math.round(angleDeg), sat, val);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Color Picker"
      className="fixed right-4 top-16 z-40 w-80 p-4 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 shadow-2xl select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-3"
    >
      {/* Header & Tabs */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => setTab("classic")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === "classic" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Classic
          </button>
          <button
            type="button"
            onClick={() => setTab("artistic")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === "artistic" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Artistic (Krita)
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close color picker"
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Interactive Color Surface */}
      <div className="flex justify-center items-center py-1">
        {tab === "classic" ? (
          <div className="relative w-52 h-52 flex items-center justify-center">
            {/* Outer Hue Ring Canvas */}
            <canvas
              ref={hueCanvasRef}
              width={208}
              height={208}
              onPointerDown={(e) => {
                setIsDraggingHue(true);
                handleHuePointer(e);
              }}
              onPointerMove={(e) => {
                if (isDraggingHue) handleHuePointer(e);
              }}
              onPointerUp={() => setIsDraggingHue(false)}
              className="absolute inset-0 cursor-crosshair rounded-full touch-none"
            />

            {/* Inner Saturation-Value Canvas */}
            <div className="w-28 h-28 relative">
              <canvas
                ref={innerCanvasRef}
                width={112}
                height={112}
                onPointerDown={(e) => {
                  setIsDraggingInner(true);
                  handleInnerPointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingInner) handleInnerPointer(e);
                }}
                onPointerUp={() => setIsDraggingInner(false)}
                className="w-full h-full rounded-md cursor-crosshair touch-none shadow-md"
              />

              {/* Inner shape toggle button */}
              <button
                type="button"
                onClick={() => setInnerShape((prev) => (prev === "square" ? "triangle" : "square"))}
                title={`Switch to ${innerShape === "square" ? "Triangle" : "Square"} color mode`}
                className="absolute -top-6 right-0 p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
              >
                {innerShape === "square" ? (
                  <Triangle className="w-3 h-3" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Krita-Style Artistic Color Wheel */
          <div className="relative w-52 h-52 flex items-center justify-center">
            <canvas
              ref={artisticCanvasRef}
              width={208}
              height={208}
              onPointerDown={handleArtisticPointer}
              onPointerMove={(e) => {
                if (e.buttons === 1) handleArtisticPointer(e);
              }}
              className="w-full h-full cursor-crosshair rounded-full touch-none shadow-xl"
            />
          </div>
        )}
      </div>

      {/* Direct Hex & Comparison Swatches */}
      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
        {/* Previous vs Current Color Swatches */}
        <div className="flex items-center rounded-xl overflow-hidden border border-zinc-700/80 shrink-0 shadow-xs">
          <button
            type="button"
            title="Revert to previous color"
            onClick={() => onSelectColor(initialColor)}
            className="w-7 h-8 cursor-pointer"
            style={{ backgroundColor: initialColor }}
          />
          <div
            title="Current active color"
            className="w-7 h-8"
            style={{ backgroundColor: activeColor }}
          />
        </div>

        {/* Hex Input */}
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-400">#</span>
          <input
            type="text"
            value={activeColor.replace(/^#/, "").toUpperCase()}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                if (val.length === 6 || val.length === 3) {
                  onSelectColor("#" + val);
                }
              }
            }}
            className="w-full bg-transparent text-xs text-zinc-100 font-mono focus:outline-none"
            maxLength={6}
          />
        </div>
      </div>

      {/* Artistic Palette Swatches */}
      <div>
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {ARTISTIC_PALETTE.map((color) => {
            const isSelected = activeColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                onClick={() => onSelectColor(color)}
                aria-label={`Select color ${color}`}
                className={`h-5 rounded-md border transition-transform hover:scale-110 ${
                  isSelected
                    ? "border-white ring-1 ring-zinc-300 scale-105"
                    : "border-zinc-800 hover:border-zinc-600"
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
