import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent } from "react";
import {
  X,
  Square,
  Triangle,
  Sparkles,
  Sliders,
  Settings2,
  Infinity as InfinityIcon,
  Palette,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "@/engine/color/color_conversions";
import {
  rybHueToRgbHue,
  rgbHueToRybHue,
  calculatePerceptualLuma,
} from "@/engine/color/ryb";
import { hsyToRgb } from "@/engine/color/hsy";
import {
  calculateHarmonyAngles,
  generateHarmonySwatches,
  type HarmonyType,
} from "@/engine/color/harmonies";
import {
  pointToSaturationValue,
  saturationValueToPoint,
  calculateBarycentricWeights,
  type TriangleVertices,
} from "@/engine/color/barycentric_triangle";
import {
  quantizeRybHue,
  quantizeSaturation,
  quantizeValue,
  generateDiscreteValueSteps,
  type DiscreteWheelConfig,
  DEFAULT_DISCRETE_WHEEL_CONFIG,
} from "@/engine/color/discrete_wheel";

interface ColorPickerPopoverProps {
  isOpen: boolean;
  activeColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

type PickerTab = "artistic" | "classic";
type InnerShape = "triangle" | "square";

const HARMONY_OPTIONS: { id: HarmonyType; label: string }[] = [
  { id: "none", label: "None" },
  { id: "complementary", label: "Complementary" },
  { id: "split-complementary", label: "Split-Comp" },
  { id: "triadic", label: "Triadic" },
  { id: "tetradic", label: "Tetradic" },
  { id: "analogous", label: "Analogous" },
];

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
  const [harmonyType, setHarmonyType] = useState<HarmonyType>("complementary");
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [initialColor] = useState(activeColor);

  // Krita Discrete Wheel configuration
  const [wheelConfig, setWheelConfig] = useState<DiscreteWheelConfig>(DEFAULT_DISCRETE_WHEEL_CONFIG);

  // Derive HSV from active color for Classic Mode
  const [currentHue, currentSaturation, currentValue] = useMemo(() => {
    const rgb = hexToRgb(activeColor) || [30, 30, 30];
    return rgbToHsv(rgb[0], rgb[1], rgb[2]);
  }, [activeColor]);

  // Initial target luma derived from active color upon mount
  const [artisticTargetLuma, setArtisticTargetLuma] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [128, 128, 128];
    return calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
  });

  // Artistic RYB angle & saturation
  const [lastRybAngle, setLastRybAngle] = useState(0);
  const [lastSat, setLastSat] = useState(0.85);

  const artisticRybAngle = useMemo(() => {
    if (currentSaturation > 0.03) {
      return rgbHueToRybHue(currentHue);
    }
    return lastRybAngle;
  }, [currentHue, currentSaturation, lastRybAngle]);

  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const innerCanvasRef = useRef<HTMLCanvasElement>(null);
  const artisticWheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const valueLadderRef = useRef<HTMLDivElement>(null);

  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const [isDraggingInner, setIsDraggingInner] = useState(false);
  const [isDraggingArtisticWheel, setIsDraggingArtisticWheel] = useState(false);
  const [isDraggingValueLadder, setIsDraggingValueLadder] = useState(false);

  const commitHsv = useCallback(
    (h: number, s: number, v: number) => {
      const [r, g, b] = hsvToRgb(h, s, v);
      const hex = rgbToHex(r, g, b);
      setArtisticTargetLuma(calculatePerceptualLuma(r, g, b));
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  const handleSelectExternalColor = useCallback(
    (hex: string) => {
      const rgb = hexToRgb(hex) || [30, 30, 30];
      const luma = calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
      setArtisticTargetLuma(luma);
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  // Triangle vertex generator
  const getTriangleVertices = useCallback((width: number, height: number): TriangleVertices => {
    const padding = 6;
    return {
      hueVertex: { x: width / 2, y: padding },                       // Top apex: Pure Hue (S=1, V=1)
      whiteVertex: { x: padding, y: height - padding },             // Bottom-left: Pure White (S=0, V=1)
      blackVertex: { x: width - padding, y: height - padding },     // Bottom-right: Pure Black (V=0)
    };
  }, []);

  // 1. Draw Classic Outer Hue Ring (with optional harmony chords)
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
    const handleDist = (outerRadius + innerRadius) / 2;

    ctx.clearRect(0, 0, size, size);

    // Draw full 360° Hue Ring
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

    // Draw Harmony Chords on Classic Hue Ring
    if (harmonyType !== "none") {
      const chords = calculateHarmonyAngles(currentHue, harmonyType, "rgb");
      const activeAngleRad = (currentHue * Math.PI) / 180;

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;

      for (const chord of chords) {
        const chordAngleRad = (chord.angleDeg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(
          center + Math.cos(activeAngleRad) * handleDist,
          center + Math.sin(activeAngleRad) * handleDist
        );
        ctx.lineTo(
          center + Math.cos(chordAngleRad) * handleDist,
          center + Math.sin(chordAngleRad) * handleDist
        );
        ctx.stroke();

        // Draw chord indicator blip
        ctx.beginPath();
        ctx.arc(
          center + Math.cos(chordAngleRad) * handleDist,
          center + Math.sin(chordAngleRad) * handleDist,
          4,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active Hue Handle
    const handleAngle = (currentHue * Math.PI) / 180;
    const handleX = center + Math.cos(handleAngle) * handleDist;
    const handleY = center + Math.sin(handleAngle) * handleDist;

    ctx.beginPath();
    ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, tab, currentHue, harmonyType]);

  // 2. Draw Classic Inner Saturation-Value Surface (Barycentric Triangle or Square)
  useEffect(() => {
    if (!isOpen || tab !== "classic") return;
    const canvas = innerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (innerShape === "triangle") {
      const vertices = getTriangleVertices(width, height);
      const imgData = ctx.createImageData(width, height);
      const data32 = new Uint32Array(imgData.data.buffer);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [wH, wW, wB] = calculateBarycentricWeights({ x, y }, vertices);
          if (wH >= 0 && wW >= 0 && wB >= 0) {
            const v = Math.max(0, Math.min(1, wH + wW));
            const s = v > 1e-6 ? Math.max(0, Math.min(1, wH / v)) : 0;
            const [r, g, b] = hsvToRgb(currentHue, s, v);
            data32[y * width + x] = (255 << 24) | (b << 16) | (g << 8) | r;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Outline triangle boundary
      ctx.beginPath();
      ctx.moveTo(vertices.hueVertex.x, vertices.hueVertex.y);
      ctx.lineTo(vertices.whiteVertex.x, vertices.whiteVertex.y);
      ctx.lineTo(vertices.blackVertex.x, vertices.blackVertex.y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Handle blip position via pure barycentric mapping
      const handlePos = saturationValueToPoint(currentSaturation, currentValue, vertices);
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = currentValue > 0.5 && currentSaturation < 0.6 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else {
      // Square Procreate-style picker
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
    }
  }, [
    isOpen,
    tab,
    innerShape,
    currentHue,
    currentSaturation,
    currentValue,
    activeColor,
    getTriangleVertices,
  ]);

  // 3. Draw Krita-Style Isoluminant HSY' Wheel (Guaranteed Constant Perceived Value)
  useEffect(() => {
    if (!isOpen || tab !== "artistic") return;
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = 14;

    ctx.clearRect(0, 0, size, size);

    if (wheelConfig.isContinuous) {
      // Continuous Smooth Isoluminant HSY' Gradient
      const imgData = ctx.createImageData(size, size);
      const data32 = new Uint32Array(imgData.data.buffer);

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - center;
          const dy = y - center;
          const dist = Math.hypot(dx, dy);

          if (dist <= outerRadius) {
            let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
            if (angleDeg < 0) angleDeg += 360;

            const sat = Math.max(0, Math.min(1, dist / outerRadius));
            const rgbHue = rybHueToRgbHue(angleDeg);
            const [r, g, b] = hsyToRgb(rgbHue, sat, artisticTargetLuma);

            data32[y * size + x] = (255 << 24) | (b << 16) | (g << 8) | r;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else {
      // Discrete Swatch Sectors & Concentric Rings (Isoluminant HSY')
      const sectors = wheelConfig.hueSectors;
      const rings = wheelConfig.saturationRings;
      const sectorSpanRad = (Math.PI * 2) / sectors;

      for (let s = 0; s < sectors; s++) {
        const centerSectorAngle = (s + 0.5) * (360 / sectors);
        const rgbHue = rybHueToRgbHue(centerSectorAngle);
        const startAngle = s * sectorSpanRad - Math.PI / 2;
        const endAngle = (s + 1) * sectorSpanRad - Math.PI / 2;

        for (let r = 0; r < rings; r++) {
          const satRatio = (r + 1) / rings;
          const rInner = innerRadius + (r / rings) * (outerRadius - innerRadius);
          const rOuter = innerRadius + ((r + 1) / rings) * (outerRadius - innerRadius);

          // Guaranteed identical perceived lightness across all hues & saturations!
          const [red, green, blue] = hsyToRgb(rgbHue, satRatio, artisticTargetLuma);

          ctx.beginPath();
          ctx.arc(center, center, rOuter, startAngle, endAngle);
          ctx.arc(center, center, rInner, endAngle, startAngle, true);
          ctx.closePath();
          ctx.fillStyle = `rgb(${red},${green},${blue})`;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.2)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Discrete Active Cell Highlight
      if (lastSat >= 0.15) {
        const { sectorIndex } = quantizeRybHue(artisticRybAngle, sectors);
        const { ringIndex } = quantizeSaturation(lastSat, rings);

        if (ringIndex >= 0) {
          const rInner = innerRadius + (ringIndex / rings) * (outerRadius - innerRadius);
          const rOuter = innerRadius + ((ringIndex + 1) / rings) * (outerRadius - innerRadius);
          const startAngle = sectorIndex * sectorSpanRad - Math.PI / 2;
          const endAngle = (sectorIndex + 1) * sectorSpanRad - Math.PI / 2;

          ctx.beginPath();
          ctx.arc(center, center, rOuter, startAngle, endAngle);
          ctx.arc(center, center, rInner, endAngle, startAngle, true);
          ctx.closePath();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Center Neutral Gray Core (photometric luminance of target value)
    const grayByte = Math.round(artisticTargetLuma * 255);
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${grayByte},${grayByte},${grayByte})`;
    ctx.fill();
    ctx.strokeStyle = lastSat < 0.15 ? "#ffffff" : "rgba(0,0,0,0.3)";
    ctx.lineWidth = lastSat < 0.15 ? 2.5 : 1;
    ctx.stroke();

    // Harmonic Chord Overlay (on Artistic RYB Wheel)
    if (harmonyType !== "none") {
      const chords = calculateHarmonyAngles(artisticRybAngle, harmonyType, "ryb");
      const activeAngleRad = (artisticRybAngle * Math.PI) / 180 - Math.PI / 2;

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;

      for (const chord of chords) {
        const chordAngleRad = (chord.angleDeg * Math.PI) / 180 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(
          center + Math.cos(activeAngleRad) * outerRadius,
          center + Math.sin(activeAngleRad) * outerRadius
        );
        ctx.lineTo(
          center + Math.cos(chordAngleRad) * outerRadius,
          center + Math.sin(chordAngleRad) * outerRadius
        );
        ctx.stroke();

        // Draw chord blip on perimeter
        ctx.beginPath();
        ctx.arc(
          center + Math.cos(chordAngleRad) * (outerRadius - 4),
          center + Math.sin(chordAngleRad) * (outerRadius - 4),
          3.5,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active Selection Blip (in continuous mode)
    if (wheelConfig.isContinuous) {
      const blipAngleRad = (artisticRybAngle * Math.PI) / 180 - Math.PI / 2;
      const blipDist = innerRadius + lastSat * (outerRadius - innerRadius);
      const blipX = center + Math.cos(blipAngleRad) * blipDist;
      const blipY = center + Math.sin(blipAngleRad) * blipDist;

      ctx.beginPath();
      ctx.arc(blipX, blipY, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = artisticTargetLuma > 0.6 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }, [
    isOpen,
    tab,
    artisticRybAngle,
    lastSat,
    artisticTargetLuma,
    harmonyType,
    activeColor,
    wheelConfig,
  ]);

  // Robust Pointer Handlers with Pointer Capture
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (innerShape === "triangle") {
      const vertices = getTriangleVertices(canvas.width, canvas.height);
      const [s, v] = pointToSaturationValue({ x, y }, vertices);
      commitHsv(currentHue, s, v);
    } else {
      const s = Math.max(0, Math.min(1, x / canvas.width));
      const v = Math.max(0, Math.min(1, 1 - y / canvas.height));
      commitHsv(currentHue, s, v);
    }
  };

  // Wheel interaction: computes color strictly at artisticTargetLuma WITHOUT modifying target luma!
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
    const satRatio = Math.max(0, Math.min(1, dist / maxRadius));

    if (wheelConfig.isContinuous) {
      setLastRybAngle(Math.round(angleDeg));
      setLastSat(satRatio);
      const rgbHue = rybHueToRgbHue(angleDeg);
      const [r, g, b] = hsyToRgb(rgbHue, satRatio, artisticTargetLuma);
      onSelectColor(rgbToHex(r, g, b));
    } else {
      const { quantizedAngle } = quantizeRybHue(angleDeg, wheelConfig.hueSectors);
      const { quantizedSat, isCenterGray } = quantizeSaturation(satRatio, wheelConfig.saturationRings);

      setLastRybAngle(Math.round(quantizedAngle));
      setLastSat(isCenterGray ? 0.0 : quantizedSat);

      if (isCenterGray) {
        const grayByte = Math.round(artisticTargetLuma * 255);
        onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
      } else {
        const rgbHue = rybHueToRgbHue(quantizedAngle);
        const [r, g, b] = hsyToRgb(rgbHue, quantizedSat, artisticTargetLuma);
        onSelectColor(rgbToHex(r, g, b));
      }
    }
  };

  // Value Ladder interaction: sets a new target perceived luma and updates color
  const handleArtisticValueStepSelect = (targetVal: number) => {
    const clampedVal = Math.max(0.0, Math.min(1.0, targetVal));
    setArtisticTargetLuma(clampedVal);

    if (lastSat < 0.15) {
      const grayByte = Math.round(clampedVal * 255);
      onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
    } else {
      const rgbHue = rybHueToRgbHue(artisticRybAngle);
      const [r, g, b] = hsyToRgb(rgbHue, lastSat, clampedVal);
      onSelectColor(rgbToHex(r, g, b));
    }
  };

  const handleValueLadderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = valueLadderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    // Top is White (1.0), bottom is Black (0.0)
    const valNormalized = 1.0 - relativeY / rect.height;

    if (wheelConfig.isContinuous) {
      handleArtisticValueStepSelect(valNormalized);
    } else {
      const { quantizedValue } = quantizeValue(valNormalized, wheelConfig.valueSteps);
      handleArtisticValueStepSelect(quantizedValue);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Color Picker"
      className="fixed right-4 top-16 z-40 w-94 p-4 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 shadow-2xl select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-3"
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

      {/* Harmony Selector (Available in BOTH Classic and Artistic modes) */}
      <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
          <Palette className="w-3.5 h-3.5 text-amber-400" />
          <span>Harmony:</span>
        </div>
        <select
          value={harmonyType}
          onChange={(e) => setHarmonyType(e.target.value as HarmonyType)}
          aria-label="Color Harmony Scheme"
          className="bg-zinc-800 text-zinc-200 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700 focus:outline-none focus:border-amber-400 cursor-pointer"
        >
          {HARMONY_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Krita Discrete Settings Drawer (in Artistic Mode) */}
      {tab === "artistic" && (
        <div className="flex flex-col gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowConfigDrawer((prev) => !prev)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 hover:text-white"
            >
              <Settings2 className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {wheelConfig.isContinuous
                  ? "Mode: Continuous (∞)"
                  : `Discrete: ${wheelConfig.hueSectors} Hues • ${wheelConfig.saturationRings} Rings • ${wheelConfig.valueSteps} Values`}
              </span>
              {showConfigDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={() =>
                setWheelConfig((prev) => ({ ...prev, isContinuous: !prev.isContinuous }))
              }
              title={wheelConfig.isContinuous ? "Switch to Discrete Swatches" : "Switch to Continuous Gradient"}
              className={`p-1 rounded-md border text-[10px] flex items-center gap-1 transition-colors ${
                wheelConfig.isContinuous
                  ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white"
              }`}
            >
              <InfinityIcon className="w-3 h-3" />
              <span>{wheelConfig.isContinuous ? "Continuous" : "Discrete"}</span>
            </button>
          </div>

          {showConfigDrawer && !wheelConfig.isContinuous && (
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 animate-in fade-in duration-100">
              {/* Hue Sectors Slider */}
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Hue Sectors (Steps):</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="6"
                    max="36"
                    step="2"
                    value={wheelConfig.hueSectors}
                    onChange={(e) =>
                      setWheelConfig((prev) => ({ ...prev, hueSectors: Number(e.target.value) }))
                    }
                    className="w-24 h-1.5 bg-zinc-700 rounded-lg accent-amber-400 cursor-pointer"
                  />
                  <span className="font-mono text-zinc-200 w-5 text-right">{wheelConfig.hueSectors}</span>
                </div>
              </div>

              {/* Saturation Rings Slider */}
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Saturation Rings:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="2"
                    max="10"
                    step="1"
                    value={wheelConfig.saturationRings}
                    onChange={(e) =>
                      setWheelConfig((prev) => ({ ...prev, saturationRings: Number(e.target.value) }))
                    }
                    className="w-24 h-1.5 bg-zinc-700 rounded-lg accent-amber-400 cursor-pointer"
                  />
                  <span className="font-mono text-zinc-200 w-5 text-right">{wheelConfig.saturationRings}</span>
                </div>
              </div>

              {/* Value Steps Slider */}
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Value / Tone Steps:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="4"
                    max="20"
                    step="1"
                    value={wheelConfig.valueSteps}
                    onChange={(e) =>
                      setWheelConfig((prev) => ({ ...prev, valueSteps: Number(e.target.value) }))
                    }
                    className="w-24 h-1.5 bg-zinc-700 rounded-lg accent-amber-400 cursor-pointer"
                  />
                  <span className="font-mono text-zinc-200 w-5 text-right">{wheelConfig.valueSteps}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Interactive Surface */}
      <div className="flex justify-center items-center py-1">
        {tab === "artistic" ? (
          /* Krita Isoluminant RYB Wheel + Companion Vertical Value Bar */
          <div className="flex items-center gap-4 w-full justify-center">
            {/* RYB Wheel Canvas with Pointer Capture */}
            <div className="relative w-54 h-54 flex items-center justify-center">
              <canvas
                ref={artisticWheelCanvasRef}
                width={216}
                height={216}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsDraggingArtisticWheel(true);
                  handleArtisticWheelPointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingArtisticWheel) {
                    handleArtisticWheelPointer(e);
                  }
                }}
                onPointerUp={(e) => {
                  setIsDraggingArtisticWheel(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingArtisticWheel(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="w-full h-full cursor-crosshair rounded-full touch-none shadow-xl select-none"
              />
            </div>

            {/* Companion Vertical Value Bar: Pure CSS Linear Gradient (White at Top, Black at Bottom) */}
            <div className="flex flex-col items-center gap-1.5 h-54 justify-center">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                Val
              </span>

              <div
                ref={valueLadderRef}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsDraggingValueLadder(true);
                  handleValueLadderPointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingValueLadder) {
                    handleValueLadderPointer(e);
                  }
                }}
                onPointerUp={(e) => {
                  setIsDraggingValueLadder(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingValueLadder(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="relative h-44 w-6 rounded-md border border-zinc-700 cursor-pointer touch-none overflow-hidden shadow-sm"
                style={{
                  background: "linear-gradient(to bottom, #ffffff 0%, #000000 100%)",
                }}
              >
                {/* Discrete Step Notches in Discrete Mode */}
                {!wheelConfig.isContinuous && (
                  <div className="absolute inset-y-0 right-0 w-2 flex flex-col justify-between pointer-events-none py-1">
                    {generateDiscreteValueSteps(wheelConfig.valueSteps).map((_, idx) => (
                      <div key={idx} className="w-1.5 h-0.5 bg-zinc-500 rounded-full ml-auto" />
                    ))}
                  </div>
                )}

                {/* Active Value Indicator Line with Glow */}
                <div
                  className="absolute left-0 right-0 h-1.5 bg-amber-400 border border-black shadow-[0_0_8px_rgba(251,191,36,0.8)] -translate-y-1/2 rounded-full pointer-events-none z-10"
                  style={{ top: `${(1.0 - artisticTargetLuma) * 100}%` }}
                />
              </div>

              <span className="text-[10px] font-mono text-zinc-400">
                {Math.round(artisticTargetLuma * 100)}%
              </span>
            </div>
          </div>
        ) : (
          /* Classic HSV Ring with Inner Triangle/Square (with Pointer Capture) */
          <div className="relative w-52 h-52 flex items-center justify-center">
            {/* Outer Hue Ring Canvas */}
            <canvas
              ref={hueCanvasRef}
              width={208}
              height={208}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setIsDraggingHue(true);
                handleHuePointer(e);
              }}
              onPointerMove={(e) => {
                if (isDraggingHue) {
                  handleHuePointer(e);
                }
              }}
              onPointerUp={(e) => {
                setIsDraggingHue(false);
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerCancel={(e) => {
                setIsDraggingHue(false);
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              className="absolute inset-0 cursor-crosshair rounded-full touch-none select-none"
            />

            {/* Inner Saturation-Value Surface */}
            <div className="w-28 h-28 relative">
              <canvas
                ref={innerCanvasRef}
                width={112}
                height={112}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsDraggingInner(true);
                  handleInnerPointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingInner) {
                    handleInnerPointer(e);
                  }
                }}
                onPointerUp={(e) => {
                  setIsDraggingInner(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingInner(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="w-full h-full rounded-md cursor-crosshair touch-none shadow-md select-none"
              />

              <button
                type="button"
                onClick={() => setInnerShape((prev) => (prev === "square" ? "triangle" : "square"))}
                title={`Switch to ${innerShape === "square" ? "Triangle" : "Square"} color mode`}
                className="absolute -top-6 right-0 p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {innerShape === "square" ? <Triangle className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Harmonic Swatch Palette Strip (Available in both Classic and Artistic modes) */}
      {harmonyType !== "none" && (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium px-0.5">
            <span>Harmonic Palette ({harmonyType})</span>
            <span className="text-[9px] text-zinc-300">Click swatch to select</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {generateHarmonySwatches(
              tab === "artistic" ? artisticRybAngle : currentHue,
              harmonyType,
              tab === "artistic" ? "ryb" : "rgb",
              tab === "artistic" ? lastSat : currentSaturation,
              tab === "artistic" ? artisticTargetLuma : currentValue,
              tab === "artistic"
            ).map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (tab === "artistic") {
                    onSelectColor(item.hex);
                  } else {
                    const chords = calculateHarmonyAngles(currentHue, harmonyType, "rgb");
                    const targetAngle = idx === 0 ? currentHue : chords[idx - 1]?.angleDeg ?? currentHue;
                    commitHsv(targetAngle, currentSaturation, currentValue);
                  }
                }}
                title={`${item.label}: ${item.hex}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/80 hover:border-zinc-500 transition-all hover:scale-105 shrink-0"
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs shrink-0"
                  style={{ backgroundColor: item.hex }}
                />
                <span className="text-[10px] font-mono text-zinc-300">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Direct Hex & Swatch Comparison */}
      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center rounded-xl overflow-hidden border border-zinc-700/80 shrink-0 shadow-xs">
          <button
            type="button"
            title="Revert to initial color"
            onClick={() => handleSelectExternalColor(initialColor)}
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
                  handleSelectExternalColor("#" + val);
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
              onClick={() => handleSelectExternalColor(color)}
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
