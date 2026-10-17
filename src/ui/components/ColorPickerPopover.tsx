import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent, type MouseEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Circle,
  Square,
  Triangle,
  SwatchBook,
  RotateCcw,
  Infinity as InfinityIcon,
  SlidersHorizontal,
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
type ClassicPointerTarget = "hue" | "shape" | null;

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

  // In circle mode: false = Classic Disc Picker (Default), true = Artistic RYB Wheel
  const [isArtisticWheel, setIsArtisticWheel] = useState(false);

  // Artistic harmonies & discrete configuration
  const [harmonyType, setHarmonyType] = useState<HarmonyType>("none");
  const [wheelConfig, setWheelConfig] = useState<DiscreteWheelConfig>(DEFAULT_DISCRETE_WHEEL_CONFIG);
  const [isArtisticSettingsOpen, setIsArtisticSettingsOpen] = useState(false);

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

  // --- Canonical Independent State (Single Source of Truth) ---
  // Classic HSV dimensions
  const [hue, setHue] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    return s > 0.03 && v > 0.05 ? h : 0;
  });

  const [saturation, setSaturation] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    const [, s] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    return s;
  });

  const [value, setValue] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    const [, , v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    return v;
  });

  // Artistic RYB dimensions
  const [artisticAngle, setArtisticAngle] = useState<number>(() => rgbHueToRybHue(hue));
  const [artisticSat, setArtisticSat] = useState<number>(0.75);
  const [artisticLuma, setArtisticLuma] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [128, 128, 128];
    return calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
  });

  // Canvas refs
  const artisticWheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const classicCanvasRef = useRef<HTMLCanvasElement>(null);

  // Slider refs
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const satSliderRef = useRef<HTMLDivElement>(null);
  const valueSliderRef = useRef<HTMLDivElement>(null);
  const artisticLadderRef = useRef<HTMLDivElement>(null);

  // Dragging states
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [classicPointerTarget, setClassicPointerTarget] = useState<ClassicPointerTarget>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState<string | null>(null);

  // External Color Selection (Hex Input or Revert)
  const handleSelectExternalColor = useCallback(
    (hex: string) => {
      const rgb = hexToRgb(hex) || [255, 255, 255];
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      setValue(v);
      if (s > 0.02) {
        setSaturation(s);
      }
      if (s > 0.02 && v > 0.02) {
        setHue(h);
        setArtisticAngle(rgbHueToRybHue(h));
        setArtisticSat(s);
      }
      const luma = calculatePerceptualLuma(rgb[0], rgb[1], rgb[2]);
      setArtisticLuma(luma);
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  // Mode switcher handler with bi-directional preservation
  const handleToggleArtisticWheel = useCallback(() => {
    setIsArtisticWheel((prev) => {
      const next = !prev;
      if (next) {
        // Classic -> Artistic: map HSV hue and saturation into RYB
        setArtisticAngle(rgbHueToRybHue(hue));
        setArtisticSat(saturation > 0.05 ? saturation : 0.75);
        const [r, g, b] = hsvToRgb(hue, saturation, value);
        setArtisticLuma(calculatePerceptualLuma(r, g, b));
      } else {
        // Artistic -> Classic: map RYB angle into HSV hue
        setHue(rybHueToRgbHue(artisticAngle));
        setSaturation(artisticSat);
      }
      return next;
    });
  }, [hue, saturation, value, artisticAngle, artisticSat]);

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
            const [r, g, b] = hsyToRgb(rgbHue, sat, artisticLuma);

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
          // Centroid saturation ratio for the cell
          const satRatio = (r + 0.5) / rings;
          const rInner = innerRadius + (r / rings) * (outerRadius - innerRadius);
          const rOuter = innerRadius + ((r + 1) / rings) * (outerRadius - innerRadius);

          const [red, green, blue] = hsyToRgb(rgbHue, satRatio, artisticLuma);

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
    const grayByte = Math.round(artisticLuma * 255);
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${grayByte},${grayByte},${grayByte})`;
    ctx.fill();
    ctx.strokeStyle = artisticSat < 0.15 ? "#ffffff" : "rgba(0,0,0,0.3)";
    ctx.lineWidth = artisticSat < 0.15 ? 2.5 : 1;
    ctx.stroke();

    // Harmonic Chord Overlay
    if (harmonyType !== "none") {
      const chords = calculateHarmonyAngles(artisticAngle, harmonyType, "ryb");
      const activeAngleRad = (artisticAngle * Math.PI) / 180 - Math.PI / 2;

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

    // Active Selection Blip - Strictly Centroid-Snapped in Discrete Mode
    let blipX: number;
    let blipY: number;

    if (wheelConfig.isContinuous) {
      const blipAngleRad = (artisticAngle * Math.PI) / 180 - Math.PI / 2;
      const blipDist = innerRadius + artisticSat * (outerRadius - innerRadius);
      blipX = center + Math.cos(blipAngleRad) * blipDist;
      blipY = center + Math.sin(blipAngleRad) * blipDist;
    } else {
      if (artisticSat <= 0.01) {
        // Centered directly in the neutral core
        blipX = center;
        blipY = center;
      } else {
        const blipAngleRad = (artisticAngle * Math.PI) / 180 - Math.PI / 2;
        // artisticSat is (ringIndex + 0.5) / rings (exact centroid)
        const blipDist = innerRadius + artisticSat * (outerRadius - innerRadius);
        blipX = center + Math.cos(blipAngleRad) * blipDist;
        blipY = center + Math.sin(blipAngleRad) * blipDist;
      }
    }

    ctx.beginPath();
    ctx.arc(blipX, blipY, 6, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = artisticLuma > 0.6 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [
    isOpen,
    shapeMode,
    isArtisticWheel,
    artisticAngle,
    artisticSat,
    artisticLuma,
    harmonyType,
    activeColor,
    wheelConfig,
  ]);

  // 2. Draw Classic Selector with Outer Hue Wheel (Common to Circle, Square, and Triangle)
  useEffect(() => {
    if (!isOpen || (shapeMode === "circle" && isArtisticWheel)) return;
    const canvas = classicCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = 113;
    const innerRadius = 92;
    const shapeRadius = 82;

    ctx.clearRect(0, 0, size, size);

    // 1. Draw Outer 360° Hue Ring (identical across Circle, Square, and Triangle)
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 0.5) * Math.PI) / 180;
      const endAngle = ((angle + 1.5) * Math.PI) / 180;
      const [r, g, b] = hsvToRgb(angle, 1, 1);

      ctx.beginPath();
      ctx.arc(center, center, outerRadius, startAngle, endAngle);
      ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
    }

    // Outer & inner ring border strokes
    ctx.beginPath();
    ctx.arc(center, center, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Draw Hue Reticle Handle on Outer Ring
    const hueAngleRad = (hue * Math.PI) / 180;
    const ringMidDist = (outerRadius + innerRadius) / 2;
    const hueBlipX = center + Math.cos(hueAngleRad) * ringMidDist;
    const hueBlipY = center + Math.sin(hueAngleRad) * ringMidDist;
    const [pureR, pureG, pureB] = hsvToRgb(hue, 1, 1);

    ctx.beginPath();
    ctx.arc(hueBlipX, hueBlipY, 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pureR},${pureG},${pureB})`;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    // 3. Draw Inner Shape according to shapeMode
    if (shapeMode === "circle") {
      // Procreate-style Circular Disc (radius 82)
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, shapeRadius, 0, Math.PI * 2);
      ctx.clip();

      const horizGrad = ctx.createLinearGradient(center - shapeRadius, 0, center + shapeRadius, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
      ctx.fillStyle = horizGrad;
      ctx.fillRect(center - shapeRadius, center - shapeRadius, shapeRadius * 2, shapeRadius * 2);

      const vertGrad = ctx.createLinearGradient(0, center - shapeRadius, 0, center + shapeRadius);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");
      ctx.fillStyle = vertGrad;
      ctx.fillRect(center - shapeRadius, center - shapeRadius, shapeRadius * 2, shapeRadius * 2);

      ctx.restore();

      ctx.beginPath();
      ctx.arc(center, center, shapeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Disc Reticle
      let satValX = (saturation - 0.5) * (shapeRadius * 2);
      let satValY = -(value - 0.5) * (shapeRadius * 2);
      const svDist = Math.hypot(satValX, satValY);
      if (svDist > shapeRadius) {
        satValX = (satValX / svDist) * shapeRadius;
        satValY = (satValY / svDist) * shapeRadius;
      }
      const discBlipX = center + satValX;
      const discBlipY = center + satValY;

      ctx.beginPath();
      ctx.arc(discBlipX, discBlipY, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = value > 0.6 && saturation < 0.6 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else if (shapeMode === "square") {
      // Inscribed Square (116x116px centered at center, corner distance 82px)
      const sqHalf = 58;
      const sqLeft = center - sqHalf;
      const sqTop = center - sqHalf;
      const sqSize = sqHalf * 2;

      // Draw horizontal + vertical gradients
      const horizGrad = ctx.createLinearGradient(sqLeft, 0, sqLeft + sqSize, 0);
      horizGrad.addColorStop(0, "#ffffff");
      horizGrad.addColorStop(1, `rgb(${pureR},${pureG},${pureB})`);
      ctx.fillStyle = horizGrad;
      ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

      const vertGrad = ctx.createLinearGradient(0, sqTop, 0, sqTop + sqSize);
      vertGrad.addColorStop(0, "rgba(0,0,0,0)");
      vertGrad.addColorStop(1, "#000000");
      ctx.fillStyle = vertGrad;
      ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

      // Square border
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sqLeft, sqTop, sqSize, sqSize);

      // Square Handle
      const hx = sqLeft + saturation * sqSize;
      const hy = sqTop + (1 - value) * sqSize;

      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = value > 0.6 && saturation < 0.6 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    } else if (shapeMode === "triangle") {
      // Inscribed Equilateral Triangle (radius 82, centered at center)
      const vertices: TriangleVertices = {
        hueVertex: { x: center, y: center - shapeRadius },
        whiteVertex: { x: center - shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
        blackVertex: { x: center + shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
      };

      // Fill triangle with barycentric image data
      const imgData = ctx.createImageData(size, size);
      const data32 = new Uint32Array(imgData.data.buffer);

      for (let py = Math.floor(vertices.hueVertex.y); py <= Math.ceil(vertices.blackVertex.y); py++) {
        for (let px = Math.floor(vertices.whiteVertex.x); px <= Math.ceil(vertices.blackVertex.x); px++) {
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

      // Triangle border stroke
      ctx.beginPath();
      ctx.moveTo(vertices.hueVertex.x, vertices.hueVertex.y);
      ctx.lineTo(vertices.whiteVertex.x, vertices.whiteVertex.y);
      ctx.lineTo(vertices.blackVertex.x, vertices.blackVertex.y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Triangle Handle
      const handlePos = saturationValueToPoint(saturation, value, vertices);
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.strokeStyle = value > 0.6 && saturation < 0.6 ? "#000000" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }, [isOpen, shapeMode, isArtisticWheel, hue, saturation, value, activeColor]);

  // Pointer Handlers for Artistic Wheel (234x234px)
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

    const effectiveLuma = artisticLuma < 0.08 ? 0.5 : artisticLuma;
    if (artisticLuma < 0.08) {
      setArtisticLuma(0.5);
    }

    if (wheelConfig.isContinuous) {
      const roundedAngle = Math.round(angleDeg);
      setArtisticAngle(roundedAngle);
      setArtisticSat(satRatio);
      const rgbHue = rybHueToRgbHue(roundedAngle);
      const [r, g, b] = hsyToRgb(rgbHue, satRatio, effectiveLuma);
      onSelectColor(rgbToHex(r, g, b));
    } else {
      const { quantizedAngle } = quantizeRybHue(angleDeg, wheelConfig.hueSectors);
      const { quantizedSat, isCenterGray } = quantizeSaturation(satRatio, wheelConfig.saturationRings);

      if (isCenterGray) {
        setArtisticSat(0.0);
        const grayByte = Math.round(effectiveLuma * 255);
        onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
      } else {
        const roundedAngle = Math.round(quantizedAngle);
        setArtisticAngle(roundedAngle);
        setArtisticSat(quantizedSat);
        const rgbHue = rybHueToRgbHue(roundedAngle);
        const [r, g, b] = hsyToRgb(rgbHue, quantizedSat, effectiveLuma);
        onSelectColor(rgbToHex(r, g, b));
      }
    }
  };

  // Pointer Handlers for Classic Modes (Common Hue Wheel + Shape Interaction)
  const updateClassicHue = (x: number, y: number) => {
    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    const newHue = Math.round(angleDeg) % 360;
    setHue(newHue);
    const [r, g, b] = hsvToRgb(newHue, saturation, value);
    onSelectColor(rgbToHex(r, g, b));
  };

  const updateClassicShape = (
    canvasX: number,
    canvasY: number,
    relX: number,
    relY: number,
    dist: number
  ) => {
    const center = 117;
    const shapeRadius = 82;

    if (shapeMode === "circle") {
      // Procreate-style corner/edge snapping
      if (dist > 72 && relX < -35 && relY < -35) {
        // Pure White at Top-Left
        setSaturation(0);
        setValue(1);
        const [r, g, b] = hsvToRgb(hue, 0, 1);
        onSelectColor(rgbToHex(r, g, b));
        return;
      }
      if (dist > 72 && relY > 50) {
        // Pure Black at Bottom
        setValue(0);
        const [r, g, b] = hsvToRgb(hue, saturation, 0);
        onSelectColor(rgbToHex(r, g, b));
        return;
      }
      if (dist > 72 && relX > 35 && relY < -35) {
        // Pure Hue at Top-Right
        setSaturation(1);
        setValue(1);
        const [r, g, b] = hsvToRgb(hue, 1, 1);
        onSelectColor(rgbToHex(r, g, b));
        return;
      }

      const clampedX = Math.max(-shapeRadius, Math.min(shapeRadius, relX));
      const clampedY = Math.max(-shapeRadius, Math.min(shapeRadius, relY));

      const s = Math.max(0, Math.min(1, (clampedX + shapeRadius) / (shapeRadius * 2)));
      const v = Math.max(0, Math.min(1, 1 - (clampedY + shapeRadius) / (shapeRadius * 2)));

      setSaturation(s);
      setValue(v);
      const [r, g, b] = hsvToRgb(hue, s, v);
      onSelectColor(rgbToHex(r, g, b));
    } else if (shapeMode === "square") {
      const sqHalf = 58;
      const sqLeft = center - sqHalf;
      const sqTop = center - sqHalf;
      const sqSize = sqHalf * 2;

      const s = Math.max(0, Math.min(1, (canvasX - sqLeft) / sqSize));
      const v = Math.max(0, Math.min(1, 1 - (canvasY - sqTop) / sqSize));

      setSaturation(s);
      setValue(v);
      const [r, g, b] = hsvToRgb(hue, s, v);
      onSelectColor(rgbToHex(r, g, b));
    } else if (shapeMode === "triangle") {
      const vertices: TriangleVertices = {
        hueVertex: { x: center, y: center - shapeRadius },
        whiteVertex: { x: center - shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
        blackVertex: { x: center + shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
      };
      const [s, v] = pointToSaturationValue({ x: canvasX, y: canvasY }, vertices);
      setSaturation(s);
      setValue(v);
      const [r, g, b] = hsvToRgb(hue, s, v);
      onSelectColor(rgbToHex(r, g, b));
    }
  };

  const handleClassicPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingCanvas(true);

    const canvas = classicCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;
    const dist = Math.hypot(x, y);

    if (dist >= 87) {
      setClassicPointerTarget("hue");
      updateClassicHue(x, y);
    } else {
      setClassicPointerTarget("shape");
      updateClassicShape(e.clientX - rect.left, e.clientY - rect.top, x, y, dist);
    }
  };

  const handleClassicPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingCanvas) return;
    const canvas = classicCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;
    const dist = Math.hypot(x, y);

    if (classicPointerTarget === "hue") {
      updateClassicHue(x, y);
    } else if (classicPointerTarget === "shape") {
      updateClassicShape(e.clientX - rect.left, e.clientY - rect.top, x, y, dist);
    }
  };

  const handleClassicDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = classicCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - canvas.width / 2;
    const y = e.clientY - rect.top - canvas.height / 2;
    const dist = Math.hypot(x, y);

    if (dist < 87) {
      if (x < -20 && y < -20) {
        // Top-Left: Pure White
        setSaturation(0);
        setValue(1);
        const [r, g, b] = hsvToRgb(hue, 0, 1);
        onSelectColor(rgbToHex(r, g, b));
      } else if (y > 30) {
        // Bottom: Pure Black
        setValue(0);
        const [r, g, b] = hsvToRgb(hue, saturation, 0);
        onSelectColor(rgbToHex(r, g, b));
      } else if (x > 20 && y < -20) {
        // Top-Right: Pure Saturated Hue
        setSaturation(1);
        setValue(1);
        const [r, g, b] = hsvToRgb(hue, 1, 1);
        onSelectColor(rgbToHex(r, g, b));
      } else if (x < -20) {
        // Left: Mid Neutral Gray
        setSaturation(0);
        setValue(0.5);
        const [r, g, b] = hsvToRgb(hue, 0, 0.5);
        onSelectColor(rgbToHex(r, g, b));
      } else {
        // Center: 50% S, 50% V
        setSaturation(0.5);
        setValue(0.5);
        const [r, g, b] = hsvToRgb(hue, 0.5, 0.5);
        onSelectColor(rgbToHex(r, g, b));
      }
    }
  };

  // Dedicated Slider Pointer Interactions
  const handleHueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = hueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newHue = Math.round((x / rect.width) * 360) % 360;
    setHue(newHue);
    const [r, g, b] = hsvToRgb(newHue, saturation, value);
    onSelectColor(rgbToHex(r, g, b));
  };

  const handleSatSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = satSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newSat = Math.max(0, Math.min(1, x / rect.width));
    setSaturation(newSat);
    const [r, g, b] = hsvToRgb(hue, newSat, value);
    onSelectColor(rgbToHex(r, g, b));
  };

  const handleValueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = valueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newVal = Math.max(0, Math.min(1, x / rect.width));
    setValue(newVal);
    const [r, g, b] = hsvToRgb(hue, saturation, newVal);
    onSelectColor(rgbToHex(r, g, b));
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

    // ONLY updates artisticLuma - angle and saturation stay 100% intact!
    setArtisticLuma(targetVal);

    if (artisticSat <= 0.01) {
      const grayByte = Math.round(targetVal * 255);
      onSelectColor(rgbToHex(grayByte, grayByte, grayByte));
    } else {
      const rgbHue = rybHueToRgbHue(artisticAngle);
      const [r, g, b] = hsyToRgb(rgbHue, artisticSat, targetVal);
      onSelectColor(rgbToHex(r, g, b));
    }
  };

  // Color gradient endpoints for Saturation & Value sliders
  // We clamp preview value to >= 0.25 so the saturation track remains visible even at pure black
  const previewVal = Math.max(0.25, value);
  const [satStartR, satStartG, satStartB] = useMemo(
    () => hsvToRgb(hue, 0, previewVal),
    [hue, previewVal]
  );
  const [satEndR, satEndG, satEndB] = useMemo(
    () => hsvToRgb(hue, 1, previewVal),
    [hue, previewVal]
  );
  const [brightEndR, brightEndG, brightEndB] = useMemo(
    () => hsvToRgb(hue, Math.max(0.08, saturation), 1),
    [hue, saturation]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="color-picker-popover-panel"
          role="dialog"
          aria-label="Color Picker"
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="fixed right-4 top-16 z-50 w-[320px] h-[520px] rounded-2xl bg-[#18181B] border border-[#27272A] shadow-2xl flex flex-col overflow-hidden select-none"
        >
        {/* Layer 1: Top Bar (h: 46px) */}
        <div className="h-[46px] px-4.5 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-zinc-400 tracking-wide">
            {shapeMode === "circle"
              ? isArtisticWheel
                ? "Artistic Wheel (RYB)"
                : "Disc Picker (Classic)"
              : shapeMode === "square"
              ? "Square Wheel (Classic)"
              : "Triangle Wheel (Classic)"}
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
              title="Square Wheel Mode"
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
              title="Triangle Wheel Mode"
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
                onClick={handleToggleArtisticWheel}
                title={isArtisticWheel ? "Switch to Classic Disc Picker" : "Switch to Artistic RYB Wheel"}
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
        <div className="h-[354px] flex flex-col justify-between items-center py-2 px-4 overflow-hidden">
          {/* Surface Container (234x234px) */}
          <div className="relative w-[234px] h-[234px] flex items-center justify-center">
            {shapeMode === "circle" && isArtisticWheel ? (
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
              /* Classic Modes (Circle Disc, Square, Triangle): Outer Hue Wheel + Inner Shape */
              <canvas
                ref={classicCanvasRef}
                width={234}
                height={234}
                onPointerDown={handleClassicPointerDown}
                onPointerMove={handleClassicPointerMove}
                onPointerUp={(e) => {
                  setIsDraggingCanvas(false);
                  setClassicPointerTarget(null);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onPointerCancel={(e) => {
                  setIsDraggingCanvas(false);
                  setClassicPointerTarget(null);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                onDoubleClick={handleClassicDoubleClick}
                className="w-full h-full cursor-crosshair rounded-full touch-none select-none"
              />
            )}

            {/* Artistic Discrete Levels Drawer / Overlay Card */}
            <AnimatePresence>
              {isArtisticSettingsOpen && shapeMode === "circle" && isArtisticWheel && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 6 }}
                  transition={{ type: "spring", duration: 0.2, bounce: 0 }}
                  className="absolute inset-0 bg-[#18181B]/95 backdrop-blur-md rounded-2xl border border-zinc-700/60 p-3 z-30 flex flex-col justify-between shadow-2xl text-zinc-200"
                >
                  {/* Drawer Header */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                      <span>Artistic Grid Levels</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsArtisticSettingsOpen(false)}
                      className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors"
                      aria-label="Close discrete settings"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Drawer Level Sliders */}
                  <div className="flex flex-col gap-2 py-0.5">
                    {/* Hue Sectors */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Hue Sectors</span>
                        <span className="text-amber-400 font-semibold">{wheelConfig.hueSectors}</span>
                      </div>
                      <input
                        type="range"
                        min="6"
                        max="36"
                        step="2"
                        value={wheelConfig.hueSectors}
                        onChange={(e) =>
                          setWheelConfig((prev) => ({ ...prev, hueSectors: Number(e.target.value) }))
                        }
                        className="w-full accent-amber-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Saturation Rings */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Saturation Rings</span>
                        <span className="text-amber-400 font-semibold">{wheelConfig.saturationRings}</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="10"
                        step="1"
                        value={wheelConfig.saturationRings}
                        onChange={(e) =>
                          setWheelConfig((prev) => ({ ...prev, saturationRings: Number(e.target.value) }))
                        }
                        className="w-full accent-amber-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Value Steps */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Value Steps</span>
                        <span className="text-amber-400 font-semibold">{wheelConfig.valueSteps}</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="20"
                        step="1"
                        value={wheelConfig.valueSteps}
                        onChange={(e) =>
                          setWheelConfig((prev) => ({ ...prev, valueSteps: Number(e.target.value) }))
                        }
                        className="w-full accent-amber-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Drawer Presets Footer */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[9px]">
                    <span className="text-zinc-500 font-medium">Presets:</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setWheelConfig((prev) => ({ ...prev, hueSectors: 12, saturationRings: 4, valueSteps: 8 }))
                        }
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                      >
                        12/4/8
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setWheelConfig((prev) => ({ ...prev, hueSectors: 24, saturationRings: 6, valueSteps: 12 }))
                        }
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                      >
                        24/6/12
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setWheelConfig((prev) => ({ ...prev, hueSectors: 6, saturationRings: 2, valueSteps: 5 }))
                        }
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                      >
                        6/2/5
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Contextual Sliders Band (h: 92px, w: 288px) */}
          <div className="w-[288px] h-[92px] rounded-xl bg-[#252527]/50 border border-white/5 px-3 py-2 flex flex-col justify-between shrink-0">
            {shapeMode === "circle" && isArtisticWheel ? (
              /* Artistic Controls: Tone Ladder + Harmony Pills + Level Settings */
              <>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 leading-none">
                  <span>Tone Value</span>
                  <span>{Math.round(artisticLuma * 100)}%</span>
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
                    style={{ left: `${Math.max(0, Math.min(100, artisticLuma * 100))}%` }}
                  />
                </div>

                {/* Sub-row: Harmonies, Discrete/Continuous Toggle, and Grid Settings Drawer */}
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

                  <div className="flex items-center gap-1">
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
                      <span>{wheelConfig.isContinuous ? "Cont" : "Disc"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsArtisticSettingsOpen((prev) => !prev)}
                      title="Configure Discrete Grid Levels"
                      className={`p-1 rounded transition-colors ${
                        isArtisticSettingsOpen
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                          : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                      }`}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Classic Modes (Circle Disc, Square, Triangle): 3 Dedicated Fine Sliders (H, S, V) */
              <>
                {/* 1. Hue Slider */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 leading-none">
                    <span>Hue</span>
                    <span>{hue}°</span>
                  </div>
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
                    className="relative w-full h-2 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                    style={{
                      background:
                        "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                    }}
                  >
                    <div
                      className="absolute top-1/2 w-3.5 h-3.5 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${(hue / 360) * 100}%` }}
                    />
                  </div>
                </div>

                {/* 2. Saturation Slider */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 leading-none">
                    <span>Saturation</span>
                    <span>{Math.round(saturation * 100)}%</span>
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
                    className="relative w-full h-2 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                    style={{
                      background: `linear-gradient(to right, rgb(${satStartR},${satStartG},${satStartB}) 0%, rgb(${satEndR},${satEndG},${satEndB}) 100%)`,
                    }}
                  >
                    <div
                      className="absolute top-1/2 w-3.5 h-3.5 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${saturation * 100}%` }}
                    />
                  </div>
                </div>

                {/* 3. Brightness / Value Slider */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 leading-none">
                    <span>Brightness</span>
                    <span>{Math.round(value * 100)}%</span>
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
                    className="relative w-full h-2 rounded-full cursor-pointer touch-none shadow-inner border border-white/10"
                    style={{
                      background: `linear-gradient(to right, #000000 0%, rgb(${brightEndR},${brightEndG},${brightEndB}) 100%)`,
                    }}
                  >
                    <div
                      className="absolute top-1/2 w-3.5 h-3.5 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${value * 100}%` }}
                    />
                  </div>
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
    )}
    </AnimatePresence>
  );
};
