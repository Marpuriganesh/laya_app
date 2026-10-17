import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Circle,
  Square,
  Triangle,
  SwatchBook,
  RotateCcw,
  Infinity as InfinityIcon,
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

type ShapeMode = "circle" | "square" | "triangle";

const HARMONY_OPTIONS: { id: HarmonyType; label: string }[] = [
  { id: "none", label: "None" },
  { id: "complementary", label: "Comp" },
  { id: "split-complementary", label: "Split" },
  { id: "triadic", label: "Triad" },
  { id: "tetradic", label: "Tetrad" },
  { id: "analogous", label: "Analog" },
];

export const ColorPickerPopover: FC<ColorPickerPopoverProps> = ({
  isOpen,
  activeColor,
  onClose,
  onSelectColor,
}) => {
  // Shape mode: circle | square | triangle
  const [shapeMode, setShapeMode] = useState<ShapeMode>("circle");

  // In circle mode: toggles between Artistic RYB Wheel and Classic HSV Wheel
  const [isArtisticWheel, setIsArtisticWheel] = useState(true);

  // Artistic harmonies & discrete configuration
  const [harmonyType, setHarmonyType] = useState<HarmonyType>("none");
  const [wheelConfig, setWheelConfig] = useState<DiscreteWheelConfig>(DEFAULT_DISCRETE_WHEEL_CONFIG);

  // Initial color tracking for revert capability
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [initialColor, setInitialColor] = useState(activeColor);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setInitialColor(activeColor);
    }
  }

  // Hex input state
  const [prevActiveColorForHex, setPrevActiveColorForHex] = useState(activeColor);
  const [hexInput, setHexInput] = useState(activeColor.replace(/^#/, "").toUpperCase());

  if (activeColor !== prevActiveColorForHex) {
    setPrevActiveColorForHex(activeColor);
    setHexInput(activeColor.replace(/^#/, "").toUpperCase());
  }

  // Derive HSV from active color
  const [, rawSaturation, rawValue] = useMemo(() => {
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    return rgbToHsv(rgb[0], rgb[1], rgb[2]);
  }, [activeColor]);

  const currentSaturation = rawSaturation;
  const currentValue = rawValue;

  // Persist hue so when saturation is 0 (white, black, gray), hue is not lost
  const [persistedHue, setPersistedHue] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    return rgbToHsv(rgb[0], rgb[1], rgb[2])[0];
  });

  const currentHue = useMemo(() => {
    if (currentSaturation > 0.03) {
      const rgb = hexToRgb(activeColor) || [255, 255, 255];
      return rgbToHsv(rgb[0], rgb[1], rgb[2])[0];
    }
    return persistedHue;
  }, [activeColor, currentSaturation, persistedHue]);

  // Target perceptual luma for Krita isoluminant wheel
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

  // Canvas refs for the 234x234px center stage
  const artisticWheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const classicWheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const squareCanvasRef = useRef<HTMLCanvasElement>(null);
  const triangleCanvasRef = useRef<HTMLCanvasElement>(null);

  // Slider refs
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const valueSliderRef = useRef<HTMLDivElement>(null);
  const satSliderRef = useRef<HTMLDivElement>(null);
  const artisticLadderRef = useRef<HTMLDivElement>(null);

  // Dragging states
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState<string | null>(null);

  // Unified color commit for HSV
  const commitHsv = useCallback(
    (h: number, s: number, v: number) => {
      setPersistedHue(h);
      const [r, g, b] = hsvToRgb(h, s, v);
      const hex = rgbToHex(r, g, b);
      const luma = calculatePerceptualLuma(r, g, b);
      setArtisticTargetLuma(luma);
      setLastSat(s);
      if (s > 0.02) {
        setLastRybAngle(rgbHueToRybHue(h));
      }
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  const handleSelectExternalColor = useCallback(
    (hex: string) => {
      const rgb = hexToRgb(hex) || [255, 255, 255];
      const [h, s] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      setPersistedHue(h);
      const luma = calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
      setArtisticTargetLuma(luma);
      setLastSat(s);
      if (s > 0.02) {
        setLastRybAngle(rgbHueToRybHue(h));
      }
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  // Barycentric Triangle vertices for 234x234px canvas
  const getTriangleVertices = useCallback((size: number): TriangleVertices => {
    const pad = 12;
    return {
      hueVertex: { x: size / 2, y: pad },
      whiteVertex: { x: pad, y: size - pad },
      blackVertex: { x: size - pad, y: size - pad },
    };
  }, []);

  // 1. Draw Artistic RYB Isoluminant Wheel (234x234px)
  useEffect(() => {
    if (!isOpen || shapeMode !== "circle" || !isArtisticWheel) return;
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = 16;

    ctx.clearRect(0, 0, size, size);

    if (wheelConfig.isContinuous) {
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

          const [red, green, blue] = hsyToRgb(rgbHue, satRatio, artisticTargetLuma);

          ctx.beginPath();
          ctx.arc(center, center, rOuter, startAngle, endAngle);
          ctx.arc(center, center, rInner, endAngle, startAngle, true);
          ctx.closePath();
          ctx.fillStyle = `rgb(${red},${green},${blue})`;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Center Neutral Gray Core
    const grayByte = Math.round(artisticTargetLuma * 255);
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${grayByte},${grayByte},${grayByte})`;
    ctx.fill();
    ctx.strokeStyle = lastSat < 0.15 ? "#ffffff" : "rgba(0,0,0,0.3)";
    ctx.lineWidth = lastSat < 0.15 ? 2.5 : 1;
    ctx.stroke();

    // Harmonic Chord Overlay
    if (harmonyType !== "none") {
      const chords = calculateHarmonyAngles(artisticRybAngle, harmonyType, "ryb");
      const activeAngleRad = (artisticRybAngle * Math.PI) / 180 - Math.PI / 2;

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
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

    // Active Selection Blip
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
  }, [
    isOpen,
    shapeMode,
    isArtisticWheel,
    artisticRybAngle,
    lastSat,
    artisticTargetLuma,
    harmonyType,
    activeColor,
    wheelConfig,
  ]);

  // 2. Draw Classic HSV Wheel (234x234px)
  useEffect(() => {
    if (!isOpen || shapeMode !== "circle" || isArtisticWheel) return;
    const canvas = classicWheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 4;
    const ringWidth = 24;
    const innerRadius = outerRadius - ringWidth;

    ctx.clearRect(0, 0, size, size);

    // Outer Hue Ring
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

    // Inner Saturation Disc (Radial gradient white -> pure hue, shaded by value)
    const [r, g, b] = hsvToRgb(currentHue, 1, currentValue);
    const [wr, wg, wb] = hsvToRgb(0, 0, currentValue);
    const discGrad = ctx.createRadialGradient(center, center, 0, center, center, innerRadius - 4);
    discGrad.addColorStop(0, `rgb(${wr},${wg},${wb})`);
    discGrad.addColorStop(1, `rgb(${r},${g},${b})`);

    ctx.beginPath();
    ctx.arc(center, center, innerRadius - 4, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Hue Blip on Ring
    const hueAngleRad = (currentHue * Math.PI) / 180;
    const ringMidDist = (outerRadius + innerRadius) / 2;
    ctx.beginPath();
    ctx.arc(
      center + Math.cos(hueAngleRad) * ringMidDist,
      center + Math.sin(hueAngleRad) * ringMidDist,
      5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Saturation Blip inside Disc
    const satDist = currentSaturation * (innerRadius - 4);
    ctx.beginPath();
    ctx.arc(
      center + Math.cos(hueAngleRad) * satDist,
      center + Math.sin(hueAngleRad) * satDist,
      5,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = currentValue > 0.5 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, shapeMode, isArtisticWheel, currentHue, currentSaturation, currentValue, activeColor]);

  // 3. Draw Classic Square (234x234px)
  useEffect(() => {
    if (!isOpen || shapeMode !== "square") return;
    const canvas = squareCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Horizontal Gradient: White -> Pure Hue
    const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);
    const horizGrad = ctx.createLinearGradient(0, 0, width, 0);
    horizGrad.addColorStop(0, "#ffffff");
    horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
    ctx.fillStyle = horizGrad;
    ctx.fillRect(0, 0, width, height);

    // Vertical Gradient: Transparent -> Pure Black
    const vertGrad = ctx.createLinearGradient(0, 0, 0, height);
    vertGrad.addColorStop(0, "rgba(0,0,0,0)");
    vertGrad.addColorStop(1, "#000000");
    ctx.fillStyle = vertGrad;
    ctx.fillRect(0, 0, width, height);

    // Interactive Crosshair Handle
    const handleX = currentSaturation * width;
    const handleY = (1 - currentValue) * height;

    ctx.beginPath();
    ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = currentValue > 0.5 && currentSaturation < 0.5 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, shapeMode, currentHue, currentSaturation, currentValue, activeColor]);

  // 4. Draw Classic Barycentric Triangle (234x234px)
  useEffect(() => {
    if (!isOpen || shapeMode !== "triangle") return;
    const canvas = triangleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    const vertices = getTriangleVertices(size);
    const imgData = ctx.createImageData(size, size);
    const data32 = new Uint32Array(imgData.data.buffer);
    const [pureR, pureG, pureB] = hsvToRgb(currentHue, 1, 1);

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const [w0, w1, w2] = calculateBarycentricWeights({ x: px, y: py }, vertices);
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
          const r = Math.round(w0 * pureR + w1 * 255 + w2 * 0);
          const g = Math.round(w0 * pureG + w1 * 255 + w2 * 0);
          const b = Math.round(w0 * pureB + w1 * 255 + w2 * 0);
          data32[py * size + px] = (255 << 24) | (b << 16) | (g << 8) | r;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Outline Triangle Boundary
    ctx.beginPath();
    ctx.moveTo(vertices.hueVertex.x, vertices.hueVertex.y);
    ctx.lineTo(vertices.whiteVertex.x, vertices.whiteVertex.y);
    ctx.lineTo(vertices.blackVertex.x, vertices.blackVertex.y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Handle blip position via barycentric mapping
    const handlePos = saturationValueToPoint(currentSaturation, currentValue, vertices);
    ctx.beginPath();
    ctx.arc(handlePos.x, handlePos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = currentValue > 0.5 && currentSaturation < 0.6 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, shapeMode, currentHue, currentSaturation, currentValue, activeColor, getTriangleVertices]);

  // Pointer Handlers for 234x234px Canvas Surfaces
  const handleArtisticWheelPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    const outerRadius = canvas.width / 2 - 4;
    const dist = Math.hypot(x, y);
    const satRatio = Math.max(0.0, Math.min(1.0, dist / outerRadius));

    const effectiveLuma = artisticTargetLuma < 0.08 ? 0.5 : artisticTargetLuma;
    if (artisticTargetLuma < 0.08) {
      setArtisticTargetLuma(0.5);
    }

    if (wheelConfig.isContinuous) {
      setLastRybAngle(Math.round(angleDeg));
      setLastSat(satRatio);
      const rgbHue = rybHueToRgbHue(angleDeg);
      const [r, g, b] = hsyToRgb(rgbHue, satRatio, effectiveLuma);
      onSelectColor(rgbToHex(r, g, b));
    } else {
      const { quantizedAngle } = quantizeRybHue(angleDeg, wheelConfig.hueSectors);
      const { quantizedSat, isCenterGray } = quantizeSaturation(satRatio, wheelConfig.saturationRings);

      setLastRybAngle(Math.round(quantizedAngle));
      setLastSat(isCenterGray ? 0.0 : quantizedSat);

      if (isCenterGray) {
        const grayByte = Math.round(effectiveLuma * 255);
        onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
      } else {
        const rgbHue = rybHueToRgbHue(quantizedAngle);
        const [r, g, b] = hsyToRgb(rgbHue, quantizedSat, effectiveLuma);
        onSelectColor(rgbToHex(r, g, b));
      }
    }
  };

  const handleClassicWheelPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = classicWheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;

    const outerRadius = canvas.width / 2 - 4;
    const ringWidth = 24;
    const innerRadius = outerRadius - ringWidth;
    const dist = Math.hypot(x, y);

    if (dist >= innerRadius) {
      // Dragging Hue Ring
      const roundedHue = Math.round(angleDeg);
      const effectiveSat = currentSaturation < 0.05 ? 1.0 : currentSaturation;
      const effectiveVal = currentValue < 0.08 ? 1.0 : currentValue;
      commitHsv(roundedHue, effectiveSat, effectiveVal);
    } else {
      // Dragging Inner Saturation Disc
      const satRatio = Math.max(0, Math.min(1, dist / (innerRadius - 4)));
      commitHsv(currentHue, satRatio, currentValue);
    }
  };

  const handleSquarePointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = squareCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    const s = Math.max(0, Math.min(1, x / canvas.width));
    const v = Math.max(0, Math.min(1, 1 - y / canvas.height));
    commitHsv(currentHue, s, v);
  };

  const handleTrianglePointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = triangleCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const vertices = getTriangleVertices(canvas.width);
    const [s, v] = pointToSaturationValue({ x, y }, vertices);
    commitHsv(currentHue, s, v);
  };

  // Slider pointer interactions
  const handleHueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = hueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const hue = Math.round((x / rect.width) * 360) % 360;
    const effectiveSat = currentSaturation < 0.05 ? 1.0 : currentSaturation;
    const effectiveVal = currentValue < 0.08 ? 1.0 : currentValue;
    commitHsv(hue, effectiveSat, effectiveVal);
  };

  const handleValueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = valueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const v = Math.max(0, Math.min(1, x / rect.width));
    commitHsv(currentHue, currentSaturation, v);
  };

  const handleSatSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = satSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const s = Math.max(0, Math.min(1, x / rect.width));
    commitHsv(currentHue, s, currentValue);
  };

  const handleArtisticLadderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = artisticLadderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const valNormalized = Math.max(0, Math.min(1, x / rect.width));

    let targetVal = valNormalized;
    if (!wheelConfig.isContinuous) {
      const { quantizedValue } = quantizeValue(valNormalized, wheelConfig.valueSteps);
      targetVal = quantizedValue;
    }

    setArtisticTargetLuma(targetVal);
    if (lastSat < 0.08) {
      const grayByte = Math.round(targetVal * 255);
      onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
    } else {
      const rgbHue = rybHueToRgbHue(artisticRybAngle);
      const [r, g, b] = hsyToRgb(rgbHue, lastSat, targetVal);
      onSelectColor(rgbToHex(r, g, b));
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="Color Picker"
        initial={{ opacity: 0, scale: 0.95, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -6 }}
        transition={{ type: "spring", duration: 0.2, bounce: 0.05 }}
        className="fixed right-4 top-16 z-50 w-[320px] h-[520px] rounded-2xl bg-[#18181B] border border-[#27272A] shadow-2xl flex flex-col overflow-hidden select-none"
      >
        {/* Layer 1: Top Bar (h: 46px) */}
        <div className="h-[46px] px-4.5 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-zinc-400 tracking-wide">
            {shapeMode === "circle"
              ? isArtisticWheel
                ? "Artistic Wheel (RYB)"
                : "Classic Wheel (HSV)"
              : shapeMode === "square"
              ? "Classic Matrix (HSV)"
              : "Barycentric Triangle (HSV)"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close color picker"
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#605F5F] hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Layer 2: Mode & Contextual Switcher Bar (h: 49px) */}
        <div className="h-[49px] px-4.5 flex items-center justify-between border-t border-white/5 shrink-0">
          {/* Left Shape Selector Group */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShapeMode("circle")}
              title="Circle Wheel Mode"
              className="w-[22px] h-[22px] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Circle
                className={`w-4 h-4 transition-colors ${
                  shapeMode === "circle" ? "stroke-white" : "stroke-[#3F3F46] hover:stroke-zinc-300"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setShapeMode("square")}
              title="Square HSV Matrix Mode"
              className="w-[22px] h-[22px] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Square
                className={`w-4 h-4 transition-colors ${
                  shapeMode === "square" ? "stroke-white" : "stroke-[#3F3F46] hover:stroke-zinc-300"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setShapeMode("triangle")}
              title="Triangle Barycentric Mode"
              className="w-[22px] h-[22px] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Triangle
                className={`w-4 h-4 transition-colors ${
                  shapeMode === "triangle" ? "stroke-white" : "stroke-[#3F3F46] hover:stroke-zinc-300"
                }`}
              />
            </button>
          </div>

          {/* Right Contextual Switcher Button (Visible ONLY in Circle Mode) */}
          <AnimatePresence>
            {shapeMode === "circle" && (
              <motion.button
                key="circle-mode-toggle"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={() => setIsArtisticWheel((prev) => !prev)}
                title={isArtisticWheel ? "Switch to Classic HSV Wheel" : "Switch to Artistic RYB Wheel"}
                className="w-[22px] h-[22px] flex items-center justify-center cursor-pointer transition-colors"
              >
                <SwatchBook
                  className={`w-4.5 h-4.5 transition-colors ${
                    isArtisticWheel
                      ? "stroke-white fill-white/20"
                      : "stroke-[#3F3F46] hover:stroke-zinc-200"
                  }`}
                />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Layer 3: Center Stage (h: 354px) */}
        <div className="h-[354px] flex flex-col justify-between items-center py-3.5 px-4 overflow-hidden">
          {/* Surface Container (234x234px) */}
          <div className="relative w-[234px] h-[234px] flex items-center justify-center">
            {shapeMode === "circle" ? (
              isArtisticWheel ? (
                /* Artistic Isoluminant RYB Wheel */
                <canvas
                  ref={artisticWheelCanvasRef}
                  width={234}
                  height={234}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingCanvas(true);
                    handleArtisticWheelPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingCanvas) handleArtisticWheelPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingCanvas(false);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingCanvas(false);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="w-full h-full cursor-crosshair rounded-full touch-none select-none"
                />
              ) : (
                /* Classic HSV Wheel */
                <canvas
                  ref={classicWheelCanvasRef}
                  width={234}
                  height={234}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingCanvas(true);
                    handleClassicWheelPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingCanvas) handleClassicWheelPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingCanvas(false);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingCanvas(false);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="w-full h-full cursor-crosshair rounded-full touch-none select-none"
                />
              )
            ) : shapeMode === "square" ? (
              /* Classic HSV Saturation-Value Matrix */
              <canvas
                ref={squareCanvasRef}
                width={234}
                height={234}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsDraggingCanvas(true);
                  handleSquarePointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingCanvas) handleSquarePointer(e);
                }}
                onPointerUp={(e) => {
                  setIsDraggingCanvas(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingCanvas(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="w-full h-full cursor-crosshair rounded-xl touch-none shadow-md select-none border border-white/5"
              />
            ) : (
              /* Classic Barycentric Triangle */
              <canvas
                ref={triangleCanvasRef}
                width={234}
                height={234}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsDraggingCanvas(true);
                  handleTrianglePointer(e);
                }}
                onPointerMove={(e) => {
                  if (isDraggingCanvas) handleTrianglePointer(e);
                }}
                onPointerUp={(e) => {
                  setIsDraggingCanvas(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingCanvas(false);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="w-full h-full cursor-crosshair rounded-xl touch-none select-none border border-white/5"
              />
            )}
          </div>

          {/* Contextual Sliders & Controls Band (h: 74px, w: 288px) */}
          <div className="w-[288px] h-[74px] rounded-xl bg-[#252527]/50 border border-white/5 px-3 py-2 flex flex-col justify-center gap-1.5 shrink-0">
            {shapeMode === "circle" && isArtisticWheel ? (
              /* Artistic Controls: Tone Ladder + Harmony Pills */
              <>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Tone Value</span>
                  <span>{Math.round(artisticTargetLuma * 100)}%</span>
                </div>
                {/* Horizontal Value Ladder (0% Black -> 100% White) */}
                <div
                  ref={artisticLadderRef}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingSlider("ladder");
                    handleArtisticLadderPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingSlider === "ladder") handleArtisticLadderPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                  style={{
                    background: "linear-gradient(to right, #000000 0%, #ffffff 100%)",
                  }}
                >
                  {/* Discrete notches */}
                  {!wheelConfig.isContinuous && (
                    <div className="absolute inset-x-1 inset-y-0 flex justify-between pointer-events-none items-center">
                      {generateDiscreteValueSteps(wheelConfig.valueSteps).map((_, idx) => (
                        <div key={idx} className="w-0.5 h-1.5 bg-zinc-600 rounded-full" />
                      ))}
                    </div>
                  )}
                  {/* Active Handle Blip */}
                  <div
                    className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${Math.max(0, Math.min(100, artisticTargetLuma * 100))}%` }}
                  />
                </div>

                {/* Sub-row: Harmony and Continuous Toggles */}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1">
                    {HARMONY_OPTIONS.slice(0, 4).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setHarmonyType(opt.id)}
                        className={`px-1.5 py-0.5 text-[9px] rounded font-medium transition-colors ${
                          harmonyType === opt.id
                            ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                            : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setWheelConfig((prev) => ({ ...prev, isContinuous: !prev.isContinuous }))
                    }
                    title={wheelConfig.isContinuous ? "Switch to Discrete Steps" : "Switch to Continuous Wheel"}
                    className={`px-1.5 py-0.5 text-[9px] rounded font-medium transition-colors flex items-center gap-1 ${
                      wheelConfig.isContinuous
                        ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                        : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                    }`}
                  >
                    <InfinityIcon className="w-2.5 h-2.5" />
                    <span>{wheelConfig.isContinuous ? "Continuous" : "Discrete"}</span>
                  </button>
                </div>
              </>
            ) : shapeMode === "square" || shapeMode === "triangle" ? (
              /* Square & Triangle Controls: Rainbow Hue Slider + Value Slider */
              <>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Hue Spectrum</span>
                  <span>{currentHue}°</span>
                </div>
                {/* Rainbow Hue Track */}
                <div
                  ref={hueSliderRef}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingSlider("hue");
                    handleHueSliderPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingSlider === "hue") handleHueSliderPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                  style={{
                    background:
                      "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                  }}
                >
                  <div
                    className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${(currentHue / 360) * 100}%` }}
                  />
                </div>

                {/* Brightness / Value Slider */}
                <div
                  ref={valueSliderRef}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingSlider("val");
                    handleValueSliderPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingSlider === "val") handleValueSliderPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-inner border border-white/10 mt-0.5"
                  style={{
                    background: `linear-gradient(to right, #000000 0%, hsl(${currentHue}, 100%, 50%) 100%)`,
                  }}
                >
                  <div
                    className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${currentValue * 100}%` }}
                  />
                </div>
              </>
            ) : (
              /* Classic Circle Mode: Value + Saturation Sliders */
              <>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Brightness / Saturation</span>
                  <span>{Math.round(currentValue * 100)}%</span>
                </div>
                <div
                  ref={valueSliderRef}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingSlider("val");
                    handleValueSliderPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingSlider === "val") handleValueSliderPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                  style={{
                    background: `linear-gradient(to right, #000000 0%, hsl(${currentHue}, 100%, 50%) 100%)`,
                  }}
                >
                  <div
                    className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${currentValue * 100}%` }}
                  />
                </div>

                <div
                  ref={satSliderRef}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDraggingSlider("sat");
                    handleSatSliderPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (isDraggingSlider === "sat") handleSatSliderPointer(e);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={(e) => {
                    setIsDraggingSlider(null);
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  className="relative w-full h-3 rounded-full cursor-pointer touch-none shadow-inner border border-white/10 mt-0.5"
                  style={{
                    background: `linear-gradient(to right, #ffffff 0%, hsl(${currentHue}, 100%, 50%) 100%)`,
                  }}
                >
                  <div
                    className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${currentSaturation * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Layer 4: Bottom Swatch & Hex Bar (h: 70px) */}
        <div className="h-[70px] px-4.5 flex items-center justify-between border-t border-white/5 shrink-0">
          {/* Color Preview Swatch (41x41px, rounded-[7.1px]) */}
          <div className="flex items-center gap-2">
            <div
              title={`Active Color: ${activeColor}`}
              className="w-[41px] h-[41px] rounded-[7.1px] shadow-inner border border-white/10 flex items-center justify-center shrink-0 transition-all duration-75"
              style={{ backgroundColor: activeColor }}
            />
            {initialColor.toUpperCase() !== activeColor.toUpperCase() && (
              <button
                type="button"
                onClick={() => handleSelectExternalColor(initialColor)}
                title={`Revert to previous color (${initialColor})`}
                className="p-1 rounded-md text-[#605F5F] hover:text-white hover:bg-zinc-800/60 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Hex Input Badge (95x38px, rounded-[4.8px]) */}
          <div className="w-[95px] h-[38px] rounded-[4.8px] bg-[#252527]/50 border border-white/10 flex items-center px-2.5 focus-within:border-amber-400/80 transition-colors">
            <span className="text-[14px] font-mono text-zinc-500 mr-1 select-none">#</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
                setHexInput(val);
                if (val.length === 6 || val.length === 3) {
                  handleSelectExternalColor("#" + val);
                }
              }}
              onBlur={() => {
                setHexInput(activeColor.replace(/^#/, "").toUpperCase());
              }}
              className="w-full bg-transparent text-[16px] text-zinc-100 font-mono font-medium tracking-wider focus:outline-none uppercase"
              maxLength={6}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
