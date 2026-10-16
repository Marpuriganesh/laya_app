import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent } from "react";
import { X, Square, Triangle, Sparkles, Sliders } from "lucide-react";
import {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "@/engine/color/color_conversions";
import {
  rybHueToRgbHue,
  rgbHueToRybHue,
  calculateRybHarmonies,
  calculatePerceptualLuma,
} from "@/engine/color/ryb";

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
  const [tab, setTab] = useState<PickerTab>("artistic");
  const [innerShape, setInnerShape] = useState<InnerShape>("triangle");
  const [showHarmonies, setShowHarmonies] = useState(true);
  const [initialColor] = useState(activeColor);

  // Derive HSV from active color
  const [currentHue, currentSaturation, currentValue] = useMemo(() => {
    const rgb = hexToRgb(activeColor) || [30, 30, 30];
    return rgbToHsv(rgb[0], rgb[1], rgb[2]);
  }, [activeColor]);

  // Artistic RYB coordinates reactively derived from activeColor
  const [lastRybAngle, setLastRybAngle] = useState(0);
  const artisticRybAngle = useMemo(() => {
    if (currentSaturation > 0.03) {
      return rgbHueToRybHue(currentHue);
    }
    return lastRybAngle;
  }, [currentHue, currentSaturation, lastRybAngle]);

  const artisticSat = currentSaturation;

  const artisticVal = useMemo(() => {
    const rgb = hexToRgb(activeColor) || [30, 30, 30];
    const luma = calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
    return Math.max(0.01, Math.min(0.99, luma));
  }, [activeColor]);

  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement>(null);
  const artisticWheelCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const [isDraggingInner, setIsDraggingInner] = useState(false);
  const [isDraggingArtisticWheel, setIsDraggingArtisticWheel] = useState(false);

  const commitHsv = useCallback(
    (h: number, s: number, v: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      onSelectColor(rgbToHex(r, g, b));
    },
    [onSelectColor]
  );

  // 1. Draw Classic Outer Hue Ring
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

  // 2. Draw Classic Inner Saturation-Value Surface
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
      const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);
      const horizGrad = ctx.createLinearGradient(0, 0, width, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, 0, width, height);

      const vertGrad = ctx.createLinearGradient(0, 0, 0, height);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");
      ctx.fillStyle = vertGrad;
      ctx.fillRect(0, 0, width, height);

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
      const topX = width / 2;
      const topY = 8;
      const leftX = 8;
      const leftY = height - 8;
      const rightX = width - 8;
      const rightY = height - 8;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.clip();

      const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);
      const horizGrad = ctx.createLinearGradient(leftX, 0, rightX, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, 0, width, height);

      const vertGrad = ctx.createLinearGradient(0, topY, 0, leftY);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");
      ctx.fillStyle = vertGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

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

  // 3. Draw Krita-Style Artistic RYB Color Wheel with Isoluminant Saturation Rings
  useEffect(() => {
    if (!isOpen || tab !== "artistic") return;
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = 8;
    const rings = 5;

    ctx.clearRect(0, 0, size, size);

    // Render concentric saturation rings with RYB hue sectors
    const sectors = 24;
    const sectorAngle = (Math.PI * 2) / sectors;

    for (let s = 0; s < sectors; s++) {
      const rybAngle = (s * 360) / sectors;
      const rgbHue = rybHueToRgbHue(rybAngle);
      const startAngle = s * sectorAngle - Math.PI / 2;
      const endAngle = (s + 1) * sectorAngle - Math.PI / 2;

      for (let r = 0; r < rings; r++) {
        // Saturation goes from 0.1 near center to 1.0 at outer edge
        const satRatio = (r + 1) / rings;
        const rInner = innerRadius + (r / rings) * (outerRadius - innerRadius);
        const rOuter = innerRadius + ((r + 1) / rings) * (outerRadius - innerRadius);

        // Calculate RGB for this hue, saturation, and current artistic value level
        const [red, green, blue] = hsvToRgb(rgbHue, satRatio, artisticVal);

        ctx.beginPath();
        ctx.arc(center, center, rOuter, startAngle, endAngle);
        ctx.arc(center, center, rInner, endAngle, startAngle, true);
        ctx.fillStyle = `rgb(${red},${green},${blue})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Center Neutral Gray Core (exact perceptual value of current slider)
    const grayByte = Math.round(artisticVal * 255);
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${grayByte},${grayByte},${grayByte})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Harmonic Chord Overlay (Complementary & Triadic markers)
    if (showHarmonies) {
      const harmonies = calculateRybHarmonies(artisticRybAngle);
      const complementAngleRad = (harmonies.complement * Math.PI) / 180 - Math.PI / 2;

      // Draw dashed complementary harmony chord
      const activeAngleRad = (artisticRybAngle * Math.PI) / 180 - Math.PI / 2;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(
        center + Math.cos(activeAngleRad) * outerRadius,
        center + Math.sin(activeAngleRad) * outerRadius
      );
      ctx.lineTo(
        center + Math.cos(complementAngleRad) * outerRadius,
        center + Math.sin(complementAngleRad) * outerRadius
      );
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // Complementary blip on perimeter
      ctx.beginPath();
      ctx.arc(
        center + Math.cos(complementAngleRad) * (outerRadius - 4),
        center + Math.sin(complementAngleRad) * (outerRadius - 4),
        3.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // Active Selection Blip on Wheel
    const blipAngleRad = (artisticRybAngle * Math.PI) / 180 - Math.PI / 2;
    const blipDist = innerRadius + artisticSat * (outerRadius - innerRadius);
    const blipX = center + Math.cos(blipAngleRad) * blipDist;
    const blipY = center + Math.sin(blipAngleRad) * blipDist;

    ctx.beginPath();
    ctx.arc(blipX, blipY, 6, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = artisticVal > 0.6 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, tab, artisticRybAngle, artisticSat, artisticVal, showHarmonies, activeColor]);

  // Pointer handler for Artistic RYB Wheel
  const handleArtisticWheelPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    const maxRadius = canvas.width / 2 - 4;
    const dist = Math.hypot(x, y);
    const sat = Math.max(0, Math.min(1, dist / maxRadius));

    setLastRybAngle(Math.round(angleDeg));

    // Convert to RGB
    const rgbHue = rybHueToRgbHue(angleDeg);
    const [r, g, b] = hsvToRgb(rgbHue, sat, artisticVal);
    onSelectColor(rgbToHex(r, g, b));
  };

  // Pointer handler for Artistic Value Scale
  const handleArtisticValueChange = (val: number) => {
    const rgbHue = rybHueToRgbHue(artisticRybAngle);
    const [r, g, b] = hsvToRgb(rgbHue, artisticSat, val);
    onSelectColor(rgbToHex(r, g, b));
  };

  // Classic handlers
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Color Picker"
      className="fixed right-4 top-16 z-40 w-88 p-4 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 shadow-2xl select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-3"
    >
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => setTab("artistic")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              tab === "artistic" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Artistic (Krita RYB)
          </button>
          <button
            type="button"
            onClick={() => setTab("classic")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              tab === "classic" ? "bg-zinc-800 text-white shadow-xs" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            Classic (HSV)
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

      {/* Main Interactive Surface */}
      <div className="flex justify-center items-center py-1">
        {tab === "artistic" ? (
          /* Krita Artistic RYB Wheel + Companion Vertical Value Scale */
          <div className="flex items-center gap-4 w-full justify-center">
            {/* RYB Wheel with Isoluminant Saturation Rings */}
            <div className="relative w-52 h-52 flex items-center justify-center">
              <canvas
                ref={artisticWheelCanvasRef}
                width={208}
                height={208}
                onPointerDown={(e) => {
                  setIsDraggingArtisticWheel(true);
                  handleArtisticWheelPointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingArtisticWheel) handleArtisticWheelPointer(e);
                }}
                onPointerUp={() => setIsDraggingArtisticWheel(false)}
                className="w-full h-full cursor-crosshair rounded-full touch-none shadow-xl"
              />
            </div>

            {/* Companion Vertical Value / Lightness Slider */}
            <div className="flex flex-col items-center gap-1.5 h-52 justify-center">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                Val
              </span>
              <div className="relative h-40 w-6 flex items-center justify-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(artisticVal * 100)}
                  aria-label="Artistic Value / Lightness Scale"
                  onChange={(e) => handleArtisticValueChange(Number(e.target.value) / 100)}
                  className="w-40 h-3 bg-gradient-to-r from-black via-zinc-500 to-white rounded-lg appearance-none cursor-pointer -rotate-90 origin-center accent-amber-400"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {Math.round(artisticVal * 100)}%
              </span>
            </div>
          </div>
        ) : (
          /* Classic HSV Ring with Inner Triangle/Square */
          <div className="relative w-52 h-52 flex items-center justify-center">
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

              <button
                type="button"
                onClick={() => setInnerShape((prev) => (prev === "square" ? "triangle" : "square"))}
                title={`Switch to ${innerShape === "square" ? "Triangle" : "Square"} color mode`}
                className="absolute -top-6 right-0 p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
              >
                {innerShape === "square" ? <Triangle className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Harmony Toggle (in Artistic Mode) */}
      {tab === "artistic" && (
        <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
          <span>Artistic Complements (RYB)</span>
          <button
            type="button"
            onClick={() => setShowHarmonies((prev) => !prev)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              showHarmonies
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800"
            }`}
          >
            {showHarmonies ? "Harmonies On" : "Harmonies Off"}
          </button>
        </div>
      )}

      {/* Direct Hex & Swatch Comparison */}
      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center rounded-xl overflow-hidden border border-zinc-700/80 shrink-0 shadow-xs">
          <button
            type="button"
            title="Revert to initial color"
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

      {/* Quick Swatches */}
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
  );
};
