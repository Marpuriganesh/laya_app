import { useState, useRef, useEffect, useCallback, useMemo, type FC, type PointerEvent, type MouseEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDraggableWindow } from "@/ui/hooks/useDraggableWindow";
import {
  X,
  Circle,
  Square,
  Triangle,
  SwatchBook,
  RotateCcw,
  Infinity as InfinityIcon,
  SlidersHorizontal,
  Shapes,
  GripVertical,
  Palette,
  ExternalLink,
  Minimize2,
  Pin,
  PinOff,
} from "lucide-react";
import {
  toggleWindowAlwaysOnTop,
  detachPanelWindow,
  focusDetachedWindow,
} from "@/ui/window/window_manager";
import { DETACHABLE_PANEL_CONFIGS } from "@/types/window";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import {
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "@/engine/color/color_conversions";
import {
  rybHueToRgbHue,
  rgbHueToRybHue,
} from "@/engine/color/ryb";
import { hsyToRgb, calculateLuma } from "@/engine/color/hsy";
import {
  calculateHarmonyAngles,
  calculateProcreateHarmonyItems,
  type HarmonyType,
} from "@/engine/color/harmonies";
import {
  getGamutMaskVertices,
  clampPointToGamutMask,
  isPointInPolygon,
  GAMUT_MASK_PRESETS,
  type GamutMaskType,
} from "@/engine/color/gamut_mask";
import {
  pointToSaturationValue,
  saturationValueToPoint,
  calculateBarycentricWeights,
  calculateEquilateralTriangleSignedDistance,
  type TriangleVertices,
} from "@/engine/color/barycentric_triangle";
import {
  quantizeRybHue,
  quantizeValue,
  generateDiscreteValueSteps,
} from "@/engine/color/discrete_wheel";

interface ColorPickerPopoverProps {
  isOpen: boolean;
  activeColor: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
  isDetached?: boolean;
  onDetach?: () => void;
  onDock?: () => void;
}

type ShapeMode = "circle" | "square" | "triangle";
type ClassicPointerTarget = "hue" | "shape" | null;

export const ColorPickerPopover: FC<ColorPickerPopoverProps> = ({
  isOpen,
  activeColor,
  onClose,
  onSelectColor,
  isDetached = false,
  onDetach,
  onDock,
}) => {
  const [isPinned, setIsPinned] = useState(false);

  const handleTogglePin = async () => {
    const nextPinned = !isPinned;
    await toggleWindowAlwaysOnTop(nextPinned);
    setIsPinned(nextPinned);
  };

  // Shape mode: circle | square | triangle
  const [shapeMode, setShapeMode] = useState<ShapeMode>("circle");

  // In circle mode: false = Classic Disc Picker (Default), true = Artistic RYB Wheel
  const [isArtisticWheel, setIsArtisticWheel] = useState(false);

  // Classic Procreate Harmonies (circle mode)
  const [classicHarmonyType, setClassicHarmonyType] = useState<HarmonyType>("none");

  // Artistic Gamut Mask & Discrete configuration
  const {
    gamutMask,
    setGamutMask,
    wheelConfig,
    setWheelConfig,
    detachedPanels,
    detachPanel,
  } = useDocumentStore();

  const isGamutMaskEnabled = gamutMask.enabled;
  const gamutMaskType = gamutMask.type;
  const gamutMaskRotation = gamutMask.rotation;
  const maskBoundaryOpacity = gamutMask.opacity;

  const setIsGamutMaskEnabled = useCallback(
    (enabled: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof enabled === "function" ? enabled(gamutMask.enabled) : enabled;
      setGamutMask({ enabled: next });
    },
    [gamutMask.enabled, setGamutMask]
  );

  const setGamutMaskType = useCallback(
    (type: GamutMaskType) => {
      setGamutMask({ type, enabled: true });
    },
    [setGamutMask]
  );

  const setGamutMaskRotation = useCallback(
    (rotation: number) => {
      setGamutMask({ rotation });
    },
    [setGamutMask]
  );

  const [isGamutDrawerOpen, setIsGamutDrawerOpen] = useState(false);
  const [isArtisticSettingsOpen, setIsArtisticSettingsOpen] = useState(false);

  const handleDetachGamut = useCallback(async () => {
    detachPanel("colorGamut");
    setIsGamutDrawerOpen(false);
    await detachPanelWindow(DETACHABLE_PANEL_CONFIGS.colorGamut);
  }, [detachPanel]);

  const handleDetachGrid = useCallback(async () => {
    detachPanel("colorGrid");
    setIsArtisticSettingsOpen(false);
    await detachPanelWindow(DETACHABLE_PANEL_CONFIGS.colorGrid);
  }, [detachPanel]);

  // 1. Draggable main popover position & physics
  const {
    headerProps: mainHeaderDragProps,
    windowStyle: mainPopoverWindowStyle,
  } = useDraggableWindow({
    initialOffset: { x: 0, y: 0 },
    windowWidth: 320,
    windowHeight: () => (shapeMode === "circle" && !isArtisticWheel && classicHarmonyType !== "none" ? 562 : 520),
    margin: 16,
    magneticBand: 24,
    snapDistance: 45,
  });

  // 2. Draggable Gamut Mask sub-window position & physics
  const {
    headerProps: gamutHeaderDragProps,
    windowStyle: gamutWindowStyle,
  } = useDraggableWindow({
    initialOffset: { x: -262, y: 40 },
    windowWidth: 250,
    windowHeight: 280,
    margin: 16,
    magneticBand: 24,
    snapDistance: 45,
  });

  // 3. Draggable Grid Levels sub-window position & physics
  const {
    headerProps: gridHeaderDragProps,
    windowStyle: gridWindowStyle,
  } = useDraggableWindow({
    initialOffset: { x: -262, y: 60 },
    windowWidth: 250,
    windowHeight: 260,
    margin: 16,
    magneticBand: 24,
    snapDistance: 45,
  });

  // Helper to cycle through classic harmonies
  const cycleClassicHarmony = useCallback(() => {
    const order: HarmonyType[] = [
      "none",
      "complementary",
      "split-complementary",
      "triadic",
      "tetradic",
      "analogous",
    ];
    const currentIndex = order.indexOf(classicHarmonyType);
    const nextIndex = (currentIndex + 1) % order.length;
    setClassicHarmonyType(order[nextIndex]);
  }, [classicHarmonyType]);

  // Track committed hex to distinguish internal interactions from external props
  const lastCommittedHexRef = useRef<string>(activeColor.toUpperCase());

  // Initial color tracking for revert capability
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [initialColor, setInitialColor] = useState(activeColor);

  // Hex input state
  const [hexInput, setHexInput] = useState(activeColor.replace(/^#/, "").toUpperCase());

  // --- Canonical Bidirectional State ---
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

  // Artistic RYB dimensions (strictly synchronized)
  const [artisticAngle, setArtisticAngle] = useState<number>(() => rgbHueToRybHue(hue));
  const [artisticSat, setArtisticSat] = useState<number>(() => saturation);
  const [artisticLuma, setArtisticLuma] = useState<number>(() => {
    const rgb = hexToRgb(activeColor) || [128, 128, 128];
    return calculateLuma(rgb[0], rgb[1], rgb[2]);
  });

  // Synchronize when popover opens
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setInitialColor(activeColor);
      lastCommittedHexRef.current = activeColor.toUpperCase();
      const rgb = hexToRgb(activeColor) || [255, 255, 255];
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      setValue(v);
      if (s > 0.02) {
        setSaturation(s);
        setArtisticSat(s);
      }
      if (s > 0.02 && v > 0.02) {
        setHue(h);
        setArtisticAngle(rgbHueToRybHue(h));
      }
      const luma = calculateLuma(rgb[0], rgb[1], rgb[2]);
      setArtisticLuma(luma);
      setHexInput(activeColor.replace(/^#/, "").toUpperCase());
    }
  }

  // Synchronize when external activeColor changes (e.g. from canvas or external swatches)
  if (activeColor.toUpperCase() !== lastCommittedHexRef.current) {
    lastCommittedHexRef.current = activeColor.toUpperCase();
    const rgb = hexToRgb(activeColor) || [255, 255, 255];
    const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    setValue(v);
    if (s > 0.02) {
      setSaturation(s);
      setArtisticSat(s);
    }
    if (s > 0.02 && v > 0.02) {
      setHue(h);
      setArtisticAngle(rgbHueToRybHue(h));
    }
    const luma = calculateLuma(rgb[0], rgb[1], rgb[2]);
    setArtisticLuma(luma);
    setHexInput(activeColor.replace(/^#/, "").toUpperCase());
  }

  // Canvas refs
  const artisticWheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const classicCanvasRef = useRef<HTMLCanvasElement>(null);
  const squareCanvasRef = useRef<HTMLCanvasElement>(null);

  // Slider refs
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const satSliderRef = useRef<HTMLDivElement>(null);
  const valueSliderRef = useRef<HTMLDivElement>(null);
  const artisticLadderRef = useRef<HTMLDivElement>(null);

  // Dragging states & synchronous refs
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [classicPointerTarget, setClassicPointerTarget] = useState<ClassicPointerTarget>(null);
  const classicPointerTargetRef = useRef<ClassicPointerTarget>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState<string | null>(null);
  const draggingSliderRef = useRef<string | null>(null);

  // --- Unified Live Synchronization Commit Handlers ---

  // 1. Commit from Classic HSV controls (Hue ring/slider, Disc, Square, Triangle, Sat/Val sliders)
  const commitClassicHsv = useCallback(
    (newHue: number, newSat: number, newVal: number) => {
      setHue(newHue);
      setSaturation(newSat);
      setValue(newVal);

      // Instantly synchronize the Artistic model
      const ryb = rgbHueToRybHue(newHue);
      setArtisticAngle(ryb);
      setArtisticSat(newSat);

      const [r, g, b] = hsvToRgb(newHue, newSat, newVal);
      const luma = calculateLuma(r, g, b);
      setArtisticLuma(luma);

      const hex = rgbToHex(r, g, b);
      lastCommittedHexRef.current = hex.toUpperCase();
      setHexInput(hex.replace(/^#/, "").toUpperCase());
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  // 2. Commit from Artistic Wheel (Sectors & Rings)
  const commitArtisticWheel = useCallback(
    (newRybAngle: number, newArtSat: number, isCenterGray: boolean) => {
      if (isCenterGray) {
        setArtisticSat(0.0);
        setSaturation(0.0);
        setValue(artisticLuma);

        const grayByte = Math.round(artisticLuma * 255);
        const hex = rgbToHex(grayByte, grayByte, grayByte);
        lastCommittedHexRef.current = hex.toUpperCase();
        setHexInput(hex.replace(/^#/, "").toUpperCase());
        onSelectColor(hex);
      } else {
        setArtisticAngle(newRybAngle);
        setArtisticSat(newArtSat);

        // Instantly synchronize the Classic model
        const rgbHue = rybHueToRgbHue(newRybAngle);
        setHue(rgbHue);
        setSaturation(newArtSat);

        const [r, g, b] = hsyToRgb(rgbHue, newArtSat, artisticLuma);
        const [, , v] = rgbToHsv(r, g, b);
        setValue(v);

        const hex = rgbToHex(r, g, b);
        lastCommittedHexRef.current = hex.toUpperCase();
        setHexInput(hex.replace(/^#/, "").toUpperCase());
        onSelectColor(hex);
      }
    },
    [artisticLuma, onSelectColor]
  );

  // 3. Commit from Artistic Tone Value Ladder
  const commitArtisticLuma = useCallback(
    (newLuma: number) => {
      // Angle and Saturation remain 100% untouched; blip does not move!
      setArtisticLuma(newLuma);

      if (artisticSat <= 0.01) {
        setValue(newLuma);
        const grayByte = Math.round(newLuma * 255);
        const hex = rgbToHex(grayByte, grayByte, grayByte);
        lastCommittedHexRef.current = hex.toUpperCase();
        setHexInput(hex.replace(/^#/, "").toUpperCase());
        onSelectColor(hex);
      } else {
        const rgbHue = rybHueToRgbHue(artisticAngle);
        const [r, g, b] = hsyToRgb(rgbHue, artisticSat, newLuma);
        const [, , v] = rgbToHsv(r, g, b);
        setValue(v);

        const hex = rgbToHex(r, g, b);
        lastCommittedHexRef.current = hex.toUpperCase();
        setHexInput(hex.replace(/^#/, "").toUpperCase());
        onSelectColor(hex);
      }
    },
    [artisticAngle, artisticSat, onSelectColor]
  );

  // 4. External Color Selection (Hex Input or Revert)
  const handleSelectExternalColor = useCallback(
    (hex: string) => {
      const rgb = hexToRgb(hex) || [255, 255, 255];
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      setValue(v);
      if (s > 0.02) {
        setSaturation(s);
        setArtisticSat(s);
      }
      if (s > 0.02 && v > 0.02) {
        setHue(h);
        setArtisticAngle(rgbHueToRybHue(h));
      }
      const luma = calculateLuma(rgb[0], rgb[1], rgb[2]);
      setArtisticLuma(luma);
      lastCommittedHexRef.current = hex.toUpperCase();
      setHexInput(hex.replace(/^#/, "").toUpperCase());
      onSelectColor(hex);
    },
    [onSelectColor]
  );

  // Helper to clamp artistic active color inside the gamut mask
  const clampActiveColorToMask = useCallback(
    (presetId: GamutMaskType, rotationDeg: number) => {
      const center = 117;
      const outerRadius = 113;
      const innerRadius = 16;
      const maskPoly = getGamutMaskVertices(presetId, rotationDeg, outerRadius, center);

      const blipAngleRad = (artisticAngle * Math.PI) / 180 - Math.PI / 2;
      const blipDist = innerRadius + artisticSat * (outerRadius - innerRadius);
      const currPt = {
        x: center + Math.cos(blipAngleRad) * blipDist,
        y: center + Math.sin(blipAngleRad) * blipDist,
      };

      if (!isPointInPolygon(currPt, maskPoly)) {
        const clamped = clampPointToGamutMask(currPt, maskPoly);
        const cx = clamped.x - center;
        const cy = clamped.y - center;
        let ang = (Math.atan2(cy, cx) * 180) / Math.PI + 90;
        if (ang < 0) ang += 360;
        const cdist = Math.hypot(cx, cy);
        const sat = Math.max(0, Math.min(1, (cdist - innerRadius) / (outerRadius - innerRadius)));
        commitArtisticWheel(Math.round(ang), sat, cdist <= innerRadius);
      }
    },
    [artisticAngle, artisticSat, commitArtisticWheel]
  );

  // Procreate harmony items memo
  const classicHarmonyItems = useMemo(
    () => calculateProcreateHarmonyItems(hue, saturation, value, classicHarmonyType),
    [hue, saturation, value, classicHarmonyType]
  );

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

    // Color Gamut Mask Overlay (James Gurney / Krita Atmospheric Palettes)
    if (isGamutMaskEnabled) {
      const maskVertices = getGamutMaskVertices(
        gamutMaskType,
        gamutMaskRotation,
        outerRadius,
        center
      );

      if (maskVertices.length >= 3) {
        ctx.save();
        // 1. Dark translucent scrim covering wheel area outside the mask aperture
        ctx.beginPath();
        ctx.arc(center, center, outerRadius, 0, Math.PI * 2);
        ctx.moveTo(maskVertices[0].x, maskVertices[0].y);
        for (let i = 1; i < maskVertices.length; i++) {
          ctx.lineTo(maskVertices[i].x, maskVertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(18, 18, 22, ${maskBoundaryOpacity})`;
        ctx.fill("evenodd");

        // 2. Crisp aperture boundary stroke
        ctx.beginPath();
        ctx.moveTo(maskVertices[0].x, maskVertices[0].y);
        for (let i = 1; i < maskVertices.length; i++) {
          ctx.lineTo(maskVertices[i].x, maskVertices[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. Apex rotation indicator (amber dot at vertex 0)
        ctx.beginPath();
        ctx.arc(maskVertices[0].x, maskVertices[0].y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Active Selection Blip - Centroid-Snapped in Discrete Mode
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
        const { quantizedAngle } = quantizeRybHue(artisticAngle, wheelConfig.hueSectors);
        const ringIndex = Math.min(
          wheelConfig.saturationRings - 1,
          Math.max(0, Math.floor(artisticSat * wheelConfig.saturationRings))
        );
        const quantizedSat = (ringIndex + 0.5) / wheelConfig.saturationRings;
        const blipAngleRad = (quantizedAngle * Math.PI) / 180 - Math.PI / 2;
        const blipDist = innerRadius + quantizedSat * (outerRadius - innerRadius);
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
    isGamutMaskEnabled,
    gamutMaskType,
    gamutMaskRotation,
    activeColor,
    wheelConfig,
  ]);

  // 2. Draw Classic Selector with Outer Hue Wheel (For Circle Disc and Triangle)
  useEffect(() => {
    if (!isOpen || (shapeMode === "circle" && isArtisticWheel) || shapeMode === "square") return;
    const canvas = classicCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = 113;
    const innerRadius = 92;
    const shapeRadius = 82;
    const [pureR, pureG, pureB] = hsvToRgb(hue, 1, 1);

    ctx.clearRect(0, 0, size, size);

    // 1. Draw Inner Shape according to shapeMode
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
    } else if (shapeMode === "triangle") {
      // Inscribed Equilateral Triangle (radius 82, centered at center)
      const vertices: TriangleVertices = {
        hueVertex: { x: center, y: center - shapeRadius },
        whiteVertex: { x: center - shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
        blackVertex: { x: center + shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
      };

      // Render barycentric pixels with analytical subpixel anti-aliasing
      const offscreen = document.createElement("canvas");
      offscreen.width = size;
      offscreen.height = size;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        const imgData = offCtx.createImageData(size, size);
        const data32 = new Uint32Array(imgData.data.buffer);

        const minY = Math.max(0, Math.floor(vertices.hueVertex.y) - 2);
        const maxY = Math.min(size - 1, Math.ceil(vertices.blackVertex.y) + 2);
        const minX = Math.max(0, Math.floor(vertices.whiteVertex.x) - 2);
        const maxX = Math.min(size - 1, Math.ceil(vertices.blackVertex.x) + 2);

        for (let py = minY; py <= maxY; py++) {
          for (let px = minX; px <= maxX; px++) {
            // Sample at pixel center (px + 0.5, py + 0.5)
            const distPixels = calculateEquilateralTriangleSignedDistance(
              { x: px + 0.5, y: py + 0.5 },
              vertices,
              shapeRadius
            );

            // Outside anti-aliasing transition band
            if (distPixels <= -0.5) continue;

            // Smooth linear subpixel area coverage
            const alpha = Math.max(0, Math.min(1, distPixels + 0.5));
            const aByte = Math.round(alpha * 255);
            if (aByte === 0) continue;

            const [w0, w1, w2] = calculateBarycentricWeights(
              { x: px + 0.5, y: py + 0.5 },
              vertices
            );
            const w0Clamped = Math.max(0, w0);
            const w1Clamped = Math.max(0, w1);
            const w2Clamped = Math.max(0, w2);
            const wSum = w0Clamped + w1Clamped + w2Clamped || 1;

            const r = Math.round((w0Clamped / wSum) * pureR + (w1Clamped / wSum) * 255);
            const g = Math.round((w0Clamped / wSum) * pureG + (w1Clamped / wSum) * 255);
            const b = Math.round((w0Clamped / wSum) * pureB + (w1Clamped / wSum) * 255);

            data32[py * size + px] = (aByte << 24) | (b << 16) | (g << 8) | r;
          }
        }
        offCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(offscreen, 0, 0);
      }

      // Triangle border stroke with anti-aliasing
      ctx.beginPath();
      ctx.moveTo(vertices.hueVertex.x, vertices.hueVertex.y);
      ctx.lineTo(vertices.whiteVertex.x, vertices.whiteVertex.y);
      ctx.lineTo(vertices.blackVertex.x, vertices.blackVertex.y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.2;
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

    // 2. Draw Outer 360° Hue Ring (guaranteed fully visible on both Circle and Triangle!)
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

    // 3. Procreate Harmony Companion Reticles for Circle Mode (No dotted lines!)
    const hueAngleRad = (hue * Math.PI) / 180;
    const ringMidDist = (outerRadius + innerRadius) / 2;
    const hueBlipX = center + Math.cos(hueAngleRad) * ringMidDist;
    const hueBlipY = center + Math.sin(hueAngleRad) * ringMidDist;

    if (shapeMode === "circle" && classicHarmonyType !== "none") {
      const chords = calculateHarmonyAngles(hue, classicHarmonyType, "rgb");

      // Companion Reticles on Hue Ring (clean, normal size, no ugly dotted lines!)
      for (const chord of chords) {
        const chordRad = (chord.rgbHueDeg * Math.PI) / 180;
        const [cr, cg, cb] = hsvToRgb(chord.rgbHueDeg, 1, 1);
        const cx = center + Math.cos(chordRad) * ringMidDist;
        const cy = center + Math.sin(chordRad) * ringMidDist;

        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.fill();
        ctx.stroke();
      }
    }

    // 4. Draw Primary Hue Reticle Handle on Outer Ring (Prominently Enlarged Selection Ring)
    ctx.beginPath();
    ctx.arc(hueBlipX, hueBlipY, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pureR},${pureG},${pureB})`;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.8;
    ctx.fill();
    ctx.stroke();

    // Inner subtle definition ring for crisp high-contrast visibility
    ctx.beginPath();
    ctx.arc(hueBlipX, hueBlipY, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [isOpen, shapeMode, isArtisticWheel, hue, saturation, value, activeColor, classicHarmonyType]);

  // 3. Draw Full Square Saturation-Value Matrix (234x234px)
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
    const [pureR, pureG, pureB] = hsvToRgb(hue, 1, 1);
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
    const handleX = saturation * width;
    const handleY = (1 - value) * height;

    ctx.beginPath();
    ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.strokeStyle = value > 0.5 && saturation < 0.5 ? "#000000" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [isOpen, shapeMode, hue, saturation, value, activeColor]);

  // Pointer Handlers for Artistic Wheel (234x234px)
  const handleArtisticWheelPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = artisticWheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawCanvasX = e.clientX - rect.left;
    const rawCanvasY = e.clientY - rect.top;
    const size = canvas.width;
    const center = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = 16;

    let targetCanvasX = rawCanvasX;
    let targetCanvasY = rawCanvasY;

    // Gamut Mask Clamping: User CANNOT select outside the mask!
    if (isGamutMaskEnabled) {
      const maskPoly = getGamutMaskVertices(gamutMaskType, gamutMaskRotation, outerRadius, center);
      const clamped = clampPointToGamutMask({ x: rawCanvasX, y: rawCanvasY }, maskPoly);
      targetCanvasX = clamped.x;
      targetCanvasY = clamped.y;
    }

    const x = targetCanvasX - center;
    const y = targetCanvasY - center;

    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    const dist = Math.hypot(x, y);

    if (dist <= innerRadius) {
      commitArtisticWheel(Math.round(angleDeg), 0.0, true);
      return;
    }

    const ringSpan = outerRadius - innerRadius;
    const satNormalized = Math.max(0.0, Math.min(1.0, (dist - innerRadius) / ringSpan));

    if (wheelConfig.isContinuous) {
      commitArtisticWheel(Math.round(angleDeg), satNormalized, false);
    } else {
      const { quantizedAngle } = quantizeRybHue(angleDeg, wheelConfig.hueSectors);
      const ringIndex = Math.min(
        wheelConfig.saturationRings - 1,
        Math.max(0, Math.floor(satNormalized * wheelConfig.saturationRings))
      );
      const quantizedSat = (ringIndex + 0.5) / wheelConfig.saturationRings;
      commitArtisticWheel(Math.round(quantizedAngle), quantizedSat, false);
    }
  };

  // Pointer Handlers for Classic Modes (Circle Disc & Triangle)
  const updateClassicHue = (x: number, y: number) => {
    let angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    const newHue = Math.round(angleDeg) % 360;
    commitClassicHsv(newHue, saturation, value);
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
        commitClassicHsv(hue, 0, 1);
        return;
      }
      if (dist > 72 && relY > 50) {
        // Pure Black at Bottom
        commitClassicHsv(hue, saturation, 0);
        return;
      }
      if (dist > 72 && relX > 35 && relY < -35) {
        // Pure Hue at Top-Right
        commitClassicHsv(hue, 1, 1);
        return;
      }

      const clampedX = Math.max(-shapeRadius, Math.min(shapeRadius, relX));
      const clampedY = Math.max(-shapeRadius, Math.min(shapeRadius, relY));

      const s = Math.max(0, Math.min(1, (clampedX + shapeRadius) / (shapeRadius * 2)));
      const v = Math.max(0, Math.min(1, 1 - (clampedY + shapeRadius) / (shapeRadius * 2)));
      commitClassicHsv(hue, s, v);
    } else if (shapeMode === "triangle") {
      const vertices: TriangleVertices = {
        hueVertex: { x: center, y: center - shapeRadius },
        whiteVertex: { x: center - shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
        blackVertex: { x: center + shapeRadius * (Math.sqrt(3) / 2), y: center + shapeRadius * 0.5 },
      };
      const [s, v] = pointToSaturationValue({ x: canvasX, y: canvasY }, vertices);
      commitClassicHsv(hue, s, v);
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

    const target = dist >= 87 ? "hue" : "shape";
    classicPointerTargetRef.current = target;
    setClassicPointerTarget(target);

    if (target === "hue") {
      if (shapeMode === "circle" && classicHarmonyType !== "none") {
        const chords = calculateHarmonyAngles(hue, classicHarmonyType, "rgb");
        const ringMidDist = 102.5;
        let clickedCompanion = false;
        for (const chord of chords) {
          const chordRad = (chord.rgbHueDeg * Math.PI) / 180;
          const cx = Math.cos(chordRad) * ringMidDist;
          const cy = Math.sin(chordRad) * ringMidDist;
          if (Math.hypot(x - cx, y - cy) <= 14) {
            commitClassicHsv(chord.rgbHueDeg, saturation, value);
            clickedCompanion = true;
            break;
          }
        }
        if (!clickedCompanion) {
          updateClassicHue(x, y);
        }
      } else {
        updateClassicHue(x, y);
      }
    } else {
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

    const target = classicPointerTargetRef.current || classicPointerTarget;
    if (target === "hue") {
      updateClassicHue(x, y);
    } else if (target === "shape") {
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
        commitClassicHsv(hue, 0, 1);
      } else if (y > 30) {
        // Bottom: Pure Black
        commitClassicHsv(hue, saturation, 0);
      } else if (x > 20 && y < -20) {
        // Top-Right: Pure Saturated Hue
        commitClassicHsv(hue, 1, 1);
      } else if (x < -20) {
        // Left: Mid Neutral Gray
        commitClassicHsv(hue, 0, 0.5);
      } else {
        // Center: 50% S, 50% V
        commitClassicHsv(hue, 0.5, 0.5);
      }
    }
  };

  // Pointer Handler for Full Square Matrix (234x234px)
  const handleSquarePointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = squareCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - rect.top));

    const s = Math.max(0, Math.min(1, x / canvas.width));
    const v = Math.max(0, Math.min(1, 1 - y / canvas.height));
    commitClassicHsv(hue, s, v);
  };

  // Dedicated Slider Pointer Interactions
  const handleHueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = hueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newHue = Math.round((x / rect.width) * 360) % 360;
    commitClassicHsv(newHue, saturation, value);
  };

  const handleSatSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = satSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newSat = Math.max(0, Math.min(1, x / rect.width));
    commitClassicHsv(hue, newSat, value);
  };

  const handleValueSliderPointer = (e: PointerEvent<HTMLDivElement>) => {
    const container = valueSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newVal = Math.max(0, Math.min(1, x / rect.width));
    commitClassicHsv(hue, saturation, newVal);
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

    commitArtisticLuma(targetVal);
  };

  // Color gradient endpoints for Saturation & Value sliders
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
        <>
          <motion.div
          key="color-picker-popover-panel"
          role="dialog"
          aria-label="Color Picker"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={isDetached ? undefined : mainPopoverWindowStyle}
          className={
            isDetached
              ? "h-screen w-screen bg-[#18181B] border border-zinc-800/80 rounded-2xl shadow-2xl flex flex-col overflow-y-auto overflow-x-hidden select-none"
              : "fixed right-4 top-16 z-50 w-[320px] min-h-[520px] h-auto rounded-2xl bg-[#18181B] border border-[#27272A] shadow-2xl flex flex-col overflow-hidden select-none"
          }
        >
          {/* Layer 1: Top Bar (h: 46px) - Draggable Handle */}
          <div
            {...(isDetached ? { "data-tauri-drag-region": "" } : mainHeaderDragProps)}
            className="h-[46px] px-4.5 flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing border-b border-white/5 select-none"
            title={isDetached ? "Drag header to move window across monitors" : "Drag header to move, double-click to reset position"}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <GripVertical className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 transition-colors" />
              <span className="text-xs font-medium text-zinc-400 tracking-wide">
                {shapeMode === "circle"
                  ? isArtisticWheel
                    ? "Artistic Wheel (RYB)"
                    : "Disc Picker (Classic)"
                  : shapeMode === "square"
                  ? "Square Matrix (HSV)"
                  : "Triangle Wheel (Classic)"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* If detached: Pin on top button */}
              {isDetached && (
                <button
                  type="button"
                  onClick={handleTogglePin}
                  title={isPinned ? "Unpin window" : "Pin window on top"}
                  aria-label={isPinned ? "Unpin window" : "Pin window on top"}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                    isPinned
                      ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                      : "text-[#605F5F] hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* If detached: Dock back button */}
              {isDetached && onDock && (
                <button
                  type="button"
                  onClick={onDock}
                  title="Dock back to main application window"
                  aria-label="Dock back to main application window"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[#605F5F] hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* If in-canvas floating popover: Detach button */}
              {!isDetached && onDetach && (
                <button
                  type="button"
                  onClick={onDetach}
                  title="Detach color picker into standalone window"
                  aria-label="Detach color picker into standalone window"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[#605F5F] hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close color picker"
                className="w-7 h-7 flex items-center justify-center rounded-md text-[#605F5F] hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
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
                title="Square Matrix Mode"
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

            {/* Right Contextual Controls Group (Visible in Circle Mode) */}
            <div className="flex items-center gap-2">
              {/* Color Harmony Cycle Icon Button (Only in Classic Circle Mode) */}
              {shapeMode === "circle" && !isArtisticWheel && (
                <button
                  type="button"
                  onClick={cycleClassicHarmony}
                  title={`Color Harmony: ${classicHarmonyType === "none" ? "Off" : classicHarmonyType} (Click to cycle)`}
                  aria-label="Cycle color harmony"
                  className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    classicHarmonyType !== "none"
                      ? "bg-blue-500/20 text-blue-300 border border-blue-400/40 shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                      : "text-[#605F5F] hover:text-zinc-200 hover:bg-zinc-800/60"
                  }`}
                >
                  <Palette className="w-4 h-4" />
                </button>
              )}

              {/* Contextual Switcher Button (Classic Disc vs Artistic RYB Wheel) */}
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
          </div>

          {/* Layer 3: Center Stage (h: 354px) */}
          <div className="h-[354px] flex flex-col justify-between items-center py-2 px-4 overflow-hidden">
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
                  /* Classic Circle: Outer Hue Ring + Procreate Disc */
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
                )
              ) : shapeMode === "square" ? (
                /* Classic Square: Full 234x234px HSV Matrix */
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
                /* Classic Triangle: Outer Hue Ring + Inscribed Triangle */
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
            </div>

            {/* Contextual Sliders Band (h: 92px, w: 288px) */}
            <div className="w-[288px] h-[92px] rounded-xl bg-[#252527]/50 border border-white/5 px-3 py-2 flex flex-col justify-between shrink-0">
              {shapeMode === "circle" && isArtisticWheel ? (
                /* Artistic Controls: Tone Ladder + Gamut Mask + Level Settings */
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
                      draggingSliderRef.current = "ladder";
                      setIsDraggingSlider("ladder");
                      handleArtisticLadderPointer(e);
                    }}
                    onPointerMove={(e) => {
                      if (draggingSliderRef.current === "ladder" || isDraggingSlider === "ladder") {
                        handleArtisticLadderPointer(e);
                      }
                    }}
                    onPointerUp={(e) => {
                      draggingSliderRef.current = null;
                      setIsDraggingSlider(null);
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onPointerCancel={(e) => {
                      draggingSliderRef.current = null;
                      setIsDraggingSlider(null);
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    className="relative w-full h-4 flex items-center cursor-pointer touch-none select-none"
                  >
                    {/* Visual Track Pill */}
                    <div
                      className="w-full h-3 rounded-full overflow-hidden ring-1 ring-inset ring-white/15 shadow-sm relative"
                      style={{
                        background: "linear-gradient(to right, #000000 0%, #ffffff 100%)",
                        backgroundRepeat: "no-repeat",
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
                    </div>
                    {/* Active Handle Blip */}
                    <div
                      className="absolute top-1/2 w-4 h-4 bg-white border border-zinc-900 shadow-md rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${Math.max(0, Math.min(100, artisticLuma * 100))}%` }}
                    />
                  </div>

                  {/* Sub-row: Gamut Mask, Discrete/Continuous Toggle, and Grid Settings Drawer */}
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !isGamutMaskEnabled;
                          setIsGamutMaskEnabled(next);
                          if (next) clampActiveColorToMask(gamutMaskType, gamutMaskRotation);
                        }}
                        className={`px-1.5 py-0.5 text-[9px] rounded font-medium transition-colors flex items-center gap-1 ${
                          isGamutMaskEnabled
                            ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                            : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                        }`}
                        title={isGamutMaskEnabled ? "Disable Gamut Mask" : "Enable Gamut Mask (James Gurney / Krita)"}
                      >
                        <Shapes className="w-2.5 h-2.5" />
                        <span>Mask {isGamutMaskEnabled ? "ON" : "OFF"}</span>
                      </button>

                      {isGamutMaskEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            if (detachedPanels.colorGamut) {
                              focusDetachedWindow("colorGamut");
                            } else {
                              setIsGamutDrawerOpen((prev) => !prev);
                            }
                          }}
                          className={`px-1.5 py-0.5 text-[9px] font-mono rounded font-medium transition-colors flex items-center justify-center relative ${
                            isGamutDrawerOpen || detachedPanels.colorGamut
                              ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                              : "text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/60"
                          }`}
                          title={
                            detachedPanels.colorGamut
                              ? "Gamut Mask (Detached - click to focus)"
                              : `Gamut Mask: ${gamutMaskType.replace("-", " ")} (${gamutMaskRotation}°) - Click to open sub-window`
                          }
                        >
                          <span>{gamutMaskRotation}°</span>
                          {detachedPanels.colorGamut && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute -top-0.5 -right-0.5 shadow-sm" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setWheelConfig({ isContinuous: !wheelConfig.isContinuous })
                        }
                        title={wheelConfig.isContinuous ? "Switch to Discrete Steps" : "Switch to Continuous Wheel"}
                        className={`px-1.5 py-0.5 text-[9px] rounded font-medium transition-colors flex items-center gap-1 ${
                          wheelConfig.isContinuous
                            ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                            : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                        }`}
                      >
                        <InfinityIcon className="w-2.5 h-2.5" />
                        <span>{wheelConfig.isContinuous ? "Cont" : "Disc"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (detachedPanels.colorGrid) {
                            focusDetachedWindow("colorGrid");
                          } else {
                            setIsArtisticSettingsOpen((prev) => !prev);
                          }
                        }}
                        title={
                          detachedPanels.colorGrid
                            ? "Discrete Grid Levels (Detached - click to focus)"
                            : "Configure Discrete Grid Levels"
                        }
                        className={`p-1 rounded transition-colors relative ${
                          isArtisticSettingsOpen || detachedPanels.colorGrid
                            ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                            : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40"
                        }`}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        {detachedPanels.colorGrid && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute -top-0.5 -right-0.5 shadow-sm" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Classic Modes (Circle, Square, Triangle): 3 Dedicated Fine Sliders (H, S, V) All The Time */
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
                        draggingSliderRef.current = "hue";
                        setIsDraggingSlider("hue");
                        handleHueSliderPointer(e);
                      }}
                      onPointerMove={(e) => {
                        if (draggingSliderRef.current === "hue" || isDraggingSlider === "hue") {
                          handleHueSliderPointer(e);
                        }
                      }}
                      onPointerUp={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      onPointerCancel={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      className="relative w-full h-3 flex items-center cursor-pointer touch-none select-none"
                    >
                      <div
                        className="w-full h-2 rounded-full overflow-hidden ring-1 ring-inset ring-white/15 shadow-sm"
                        style={{
                          background:
                            "linear-gradient(to right, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)",
                          backgroundRepeat: "no-repeat",
                        }}
                      />
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
                        draggingSliderRef.current = "sat";
                        setIsDraggingSlider("sat");
                        handleSatSliderPointer(e);
                      }}
                      onPointerMove={(e) => {
                        if (draggingSliderRef.current === "sat" || isDraggingSlider === "sat") {
                          handleSatSliderPointer(e);
                        }
                      }}
                      onPointerUp={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      onPointerCancel={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      className="relative w-full h-3 flex items-center cursor-pointer touch-none select-none"
                    >
                      <div
                        className="w-full h-2 rounded-full overflow-hidden ring-1 ring-inset ring-white/15 shadow-sm"
                        style={{
                          background: `linear-gradient(to right, rgb(${satStartR},${satStartG},${satStartB}) 0%, rgb(${satEndR},${satEndG},${satEndB}) 100%)`,
                          backgroundRepeat: "no-repeat",
                        }}
                      />
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
                        draggingSliderRef.current = "val";
                        setIsDraggingSlider("val");
                        handleValueSliderPointer(e);
                      }}
                      onPointerMove={(e) => {
                        if (draggingSliderRef.current === "val" || isDraggingSlider === "val") {
                          handleValueSliderPointer(e);
                        }
                      }}
                      onPointerUp={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      onPointerCancel={(e) => {
                        draggingSliderRef.current = null;
                        setIsDraggingSlider(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                      }}
                      className="relative w-full h-3 flex items-center cursor-pointer touch-none select-none"
                    >
                      <div
                        className="w-full h-2 rounded-full overflow-hidden ring-1 ring-inset ring-white/15 shadow-sm"
                        style={{
                          background: `linear-gradient(to right, #000000 0%, rgb(${brightEndR},${brightEndG},${brightEndB}) 100%)`,
                          backgroundRepeat: "no-repeat",
                        }}
                      />
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
            <div className="w-[95px] h-[38px] rounded-[4.8px] bg-[#252527]/50 border border-white/10 flex items-center px-2.5 focus-within:border-blue-400/80 transition-colors">
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

          {/* Layer 5: Dedicated Harmonic Quick-Pick Swatches Panel at Bottom */}
          <AnimatePresence>
            {shapeMode === "circle" && !isArtisticWheel && classicHarmonyType !== "none" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 40, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="overflow-hidden border-t border-white/10 bg-[#121214] px-4 flex items-center justify-between shrink-0"
              >
                <div className="flex items-center gap-1.5 w-full py-1">
                  {classicHarmonyItems.map((item) => {
                    const isSelected = item.hex.toUpperCase() === activeColor.toUpperCase();
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => commitClassicHsv(item.hue, item.saturation, item.value)}
                        className={`flex-1 h-6 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? "border-white shadow-md ring-1.5 ring-white scale-105"
                            : "border-white/15 hover:border-white/50"
                        }`}
                        style={{ backgroundColor: item.hex }}
                        title={`${item.label}: ${item.hex}`}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Floating Draggable Sub-Window 1: Gamut Mask */}
        {shapeMode === "circle" && isArtisticWheel && isGamutDrawerOpen && (
          <motion.div
            key="gamut-mask-subwindow"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={isDetached ? undefined : gamutWindowStyle}
            className={
              isDetached
                ? "absolute inset-x-3 top-20 z-[55] rounded-2xl bg-[#18181B] border border-blue-400/40 shadow-2xl p-3 text-zinc-200 select-none flex flex-col gap-2.5 backdrop-blur-md"
                : "fixed right-4 top-16 z-[55] w-[250px] rounded-2xl bg-[#18181B] border border-zinc-700/80 shadow-2xl p-3 text-zinc-200 select-none flex flex-col gap-2.5"
            }
          >
            {/* Draggable Header */}
            <div
              {...(isDetached ? {} : gamutHeaderDragProps)}
              className="flex items-center justify-between pb-2 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
              title={isDetached ? "Gamut Mask settings" : "Drag header to move sub-window, double-click to snap next to picker"}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                <GripVertical className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300" />
                <span>Color Gamut Mask</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = !isGamutMaskEnabled;
                    setIsGamutMaskEnabled(next);
                    if (next) clampActiveColorToMask(gamutMaskType, gamutMaskRotation);
                  }}
                  className={`px-1.5 py-0.5 text-[9px] rounded font-semibold transition-colors cursor-pointer ${
                    isGamutMaskEnabled
                      ? "bg-blue-500/25 text-blue-300 border border-blue-400/40"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {isGamutMaskEnabled ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={handleDetachGamut}
                  title="Detach Gamut Mask into standalone window"
                  aria-label="Detach Gamut Mask into standalone window"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsGamutDrawerOpen(false)}
                  className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                  aria-label="Close gamut mask settings"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Gamut Preset Select */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400 font-medium">Harmonic Mask Shape</span>
              <select
                value={gamutMaskType}
                onChange={(e) => {
                  const newType = e.target.value as GamutMaskType;
                  setGamutMaskType(newType);
                  if (!isGamutMaskEnabled) setIsGamutMaskEnabled(true);
                  clampActiveColorToMask(newType, gamutMaskRotation);
                }}
                className="w-full bg-zinc-800/90 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-medium focus:outline-none focus:border-blue-400/80 cursor-pointer"
              >
                {GAMUT_MASK_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id} className="bg-zinc-900 text-zinc-200">
                    {preset.name}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-zinc-400 italic">
                {GAMUT_MASK_PRESETS.find((p) => p.id === gamutMaskType)?.description}
              </span>
            </div>

            {/* Mask Rotation Slider */}
            <div className="flex flex-col gap-1 py-0.5 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span>Mask Rotation</span>
                <span className="text-blue-400 font-semibold">{gamutMaskRotation}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="355"
                step="5"
                value={gamutMaskRotation}
                onChange={(e) => {
                  const rot = Number(e.target.value);
                  setGamutMaskRotation(rot);
                  if (!isGamutMaskEnabled) setIsGamutMaskEnabled(true);
                  clampActiveColorToMask(gamutMaskType, rot);
                }}
                className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Quick Turn Buttons */}
            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[9px]">
              <span className="text-zinc-500 font-medium">Quick Turn:</span>
              <div className="flex gap-1">
                {[0, 90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => {
                      setGamutMaskRotation(deg);
                      if (!isGamutMaskEnabled) setIsGamutMaskEnabled(true);
                      clampActiveColorToMask(gamutMaskType, deg);
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Floating Draggable Sub-Window 2: Artistic Grid Levels */}
        {shapeMode === "circle" && isArtisticWheel && isArtisticSettingsOpen && (
          <motion.div
            key="artistic-grid-subwindow"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={isDetached ? undefined : gridWindowStyle}
            className={
              isDetached
                ? "absolute inset-x-3 top-20 z-[55] rounded-2xl bg-[#18181B] border border-blue-400/40 shadow-2xl p-3 text-zinc-200 select-none flex flex-col gap-2.5 backdrop-blur-md"
                : "fixed right-4 top-16 z-[55] w-[250px] rounded-2xl bg-[#18181B] border border-zinc-700/80 shadow-2xl p-3 text-zinc-200 select-none flex flex-col gap-2.5"
            }
          >
            {/* Draggable Header */}
            <div
              {...(isDetached ? {} : gridHeaderDragProps)}
              className="flex items-center justify-between pb-2 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
              title={isDetached ? "Discrete Grid levels" : "Drag header to move sub-window, double-click to snap next to picker"}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                <GripVertical className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300" />
                <span>Discrete Grid Levels</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleDetachGrid}
                  title="Detach Discrete Grid into standalone window"
                  aria-label="Detach Discrete Grid into standalone window"
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsArtisticSettingsOpen(false)}
                  className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                  aria-label="Close discrete settings"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Level Sliders */}
            <div className="flex flex-col gap-2">
              {/* Hue Sectors */}
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>Hue Sectors</span>
                  <span className="text-blue-400 font-semibold">{wheelConfig.hueSectors}</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="36"
                  step="2"
                  value={wheelConfig.hueSectors}
                  onChange={(e) =>
                    setWheelConfig({ hueSectors: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Saturation Rings */}
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>Saturation Rings</span>
                  <span className="text-blue-400 font-semibold">{wheelConfig.saturationRings}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={wheelConfig.saturationRings}
                  onChange={(e) =>
                    setWheelConfig({ saturationRings: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Value Steps */}
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>Value Steps</span>
                  <span className="text-blue-400 font-semibold">{wheelConfig.valueSteps}</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="20"
                  step="1"
                  value={wheelConfig.valueSteps}
                  onChange={(e) =>
                    setWheelConfig({ valueSteps: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[9px]">
              <span className="text-zinc-500 font-medium">Presets:</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setWheelConfig({ hueSectors: 12, saturationRings: 4, valueSteps: 8 })
                  }
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors cursor-pointer"
                >
                  12/4/8
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setWheelConfig({ hueSectors: 24, saturationRings: 6, valueSteps: 12 })
                  }
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors cursor-pointer"
                >
                  24/6/12
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setWheelConfig({ hueSectors: 6, saturationRings: 2, valueSteps: 5 })
                  }
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors cursor-pointer"
                >
                  6/2/5
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </>
    )}
  </AnimatePresence>
  );
};
