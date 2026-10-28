/**
 * Procreate-style Live Drawing Pad (Scratchpad POC)
 * Features:
 * 1. High-frequency 60/120fps live updating canonical stroke preview via requestAnimationFrame
 *    when brush settings change.
 * 2. High-precision hardware stylus pressure & tilt input matching the main canvas (coalesced events,
 *    Retina 2x/3x DPR backing, touch-action: none).
 * 3. Multi-theme support: Procreate Dark, Crisp Studio Light, and 50% Neutral Gray paper.
 * 4. Customizable stroke colors with quick artist presets and custom picker.
 * 5. Compact, bounded trajectories (Procreate S-Curve, Dynamic Whip & Flick, Undulating Ribbon, Pencil Hatching).
 * 6. Dual mode: Live Preview Mode vs Freehand Scribble Mode with instant reset.
 * 7. Native Cocoa AppKit overlay integration for Tauri desktop app on macOS.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  type FC,
  type PointerEvent,
} from "react";
import { Trash2, RotateCcw, Sun, Moon, Sparkles, PenTool } from "lucide-react";
import { WasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { generateCurveLookupTable256 } from "@/engine/math/dynamics_curve";
import {
  normalizePointerEvent,
  normalizeCoalescedPointerEvents,
} from "@/input/pointer/pointer_event_normalizer";
import type { BrushPreset, StrokeSmoothingConfig } from "@/types/brush";
import type { StrokePoint } from "@/types/stroke";
import type { CurvePoint } from "@/engine/math/dynamics_curve";
import {
  TRAJECTORY_OPTIONS,
  type TrajectoryType,
  getTrajectoryPoints,
} from "./ProcreateStrokeTrajectories";

export type PadTheme = "dark" | "light" | "neutral";

export interface ProcreateLiveDrawingPadProps {
  draftPreset: BrushPreset;
  draftSmoothing: StrokeSmoothingConfig;
  draftPressureCurve: CurvePoint[];
  className?: string;
  onPresetChangeRequest?: (preset: BrushPreset) => void;
}

const PRESET_COLORS: readonly {
  label: string;
  hex: string;
  rgb: [number, number, number];
}[] = [
  { label: "Titanium White", hex: "#ffffff", rgb: [255, 255, 255] },
  { label: "Carbon Black", hex: "#18181b", rgb: [24, 24, 27] },
  { label: "Sketching Blue", hex: "#2563eb", rgb: [37, 99, 235] },
  { label: "Vermilion Red", hex: "#dc2626", rgb: [220, 38, 38] },
  { label: "Raw Umber", hex: "#78350f", rgb: [120, 53, 15] },
  { label: "Graphite", hex: "#52525b", rgb: [82, 82, 91] },
];

export const ProcreateLiveDrawingPad: FC<ProcreateLiveDrawingPadProps> = ({
  draftPreset,
  draftSmoothing,
  draftPressureCurve,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<WasmBrushBridge | null>(null);

  // Pad sizing & state
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 520,
    height: 640,
  });
  const [isReady, setIsReady] = useState(false);

  // Theme & Color States
  const [padTheme, setPadTheme] = useState<PadTheme>("dark");
  const [activeColorHex, setActiveColorHex] = useState<string>("#ffffff");
  const [trajectoryType, setTrajectoryType] =
    useState<TrajectoryType>("s-curve");

  // Interaction Mode: "preview" (auto-updates canonical stroke) vs "freehand" (user scribbles)
  const [isFreehandMode, setIsFreehandMode] = useState<boolean>(false);
  const [hasUserDrawn, setHasUserDrawn] = useState<boolean>(false);

  // Input Tracking
  const isDrawingRef = useRef(false);
  const lastStrokePointRef = useRef<StrokePoint | null>(null);
  const pendingRafRef = useRef<number | null>(null);

  // Derive RGB from active hex
  const activeColorRgb = useMemo<[number, number, number]>(() => {
    const found = PRESET_COLORS.find(
      (c) => c.hex.toLowerCase() === activeColorHex.toLowerCase(),
    );
    if (found) return found.rgb;

    const clean = activeColorHex.replace("#", "");
    if (clean.length === 6) {
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
    return padTheme === "dark" ? [255, 255, 255] : [24, 24, 27];
  }, [activeColorHex, padTheme]);

  // Adjust default color when switching theme if using default contrast colors
  const handleThemeChange = (newTheme: PadTheme) => {
    setPadTheme(newTheme);
    if (newTheme === "dark" && activeColorHex === "#18181b") {
      setActiveColorHex("#ffffff");
    } else if (newTheme === "light" && activeColorHex === "#ffffff") {
      setActiveColorHex("#18181b");
    }
  };

  // Synchronizes full draft preset parameters, tip geometry, dynamics, and textures to Wasm bridge
  const syncBridgeConfig = useCallback(() => {
    if (!bridgeRef.current?.ready) return;
    const bridge = bridgeRef.current;
    const params = draftPreset.engineParameters;
    if (params.engineId !== "pixelbrush") return;

    const scatterAmp =
      typeof params.scatterAmplitude === "number" ? params.scatterAmplitude : 0;
    const hasScatter = Boolean(
      (params.scatterDynamics && params.scatterDynamics.isEnabled) ||
      scatterAmp > 0.01,
    );

    // 1. Base parameters
    bridge.setBrushConfig({
      diameter: Math.max(1, params.baseSizePx ?? 32),
      spacing: Math.max(0.01, params.spacingFraction ?? 0.08),
      softness: Math.max(0, Math.min(1, params.softness ?? 0.45)),
      color: [activeColorRgb[0], activeColorRgb[1], activeColorRgb[2], 255],
      opacity: Math.max(0, Math.min(1, params.baseOpacity ?? 1.0)),
      flow: Math.max(0, Math.min(1, params.baseFlow ?? 1.0)),
      sizeByPressure: params.sizeDynamics?.isEnabled ?? true,
      opacityByPressure: params.opacityDynamics?.isEnabled ?? false,
      isErase: false,
      antialias: true,
    });

    // 2. Pressure curve LUT
    if (draftPressureCurve && draftPressureCurve.length >= 2) {
      const pLut = generateCurveLookupTable256(draftPressureCurve);
      bridge.setPressureLut(pLut);
    }

    // 3. Dynamics Mapping
    const multiDyn = params.multiDynamics;
    if (multiDyn) {
      for (const [paramKey, pConfig] of Object.entries(multiDyn)) {
        if (!pConfig) continue;
        if (pConfig.calculationMode) {
          bridge.setDynamicsCalculationMode(paramKey, pConfig.calculationMode);
        }
        if (pConfig.sensors) {
          for (const [sensorKey, sVal] of Object.entries(pConfig.sensors)) {
            if (!sVal) continue;
            const lut =
              sVal.curvePoints && sVal.curvePoints.length >= 2
                ? generateCurveLookupTable256(
                    sVal.curvePoints.map((p) => ({
                      x: p.inputValue,
                      y: p.outputValue,
                    })),
                  )
                : new Float32Array(256);
            bridge.setDynamicsMapping(
              paramKey,
              sVal.isEnabled,
              sensorKey,
              sVal.minOutput ?? 0.0,
              sVal.maxOutput ?? 1.0,
              lut,
            );
          }
        }
      }
    } else {
      // Legacy dynamics
      const sizeDyn = params.sizeDynamics;
      if (sizeDyn && sizeDyn.isEnabled && sizeDyn.curvePoints.length >= 2) {
        const pts = sizeDyn.curvePoints.map((p) => ({
          x: p.inputValue,
          y: p.outputValue,
        }));
        const lut = generateCurveLookupTable256(pts);
        bridge.setDynamicsMapping(
          "size",
          true,
          sizeDyn.sensorInput,
          0.02,
          1.0,
          lut,
        );
      } else {
        bridge.setDynamicsMapping(
          "size",
          false,
          "pressure",
          0.0,
          1.0,
          new Float32Array(256),
        );
      }

      const opDyn = params.opacityDynamics;
      if (opDyn && opDyn.isEnabled && opDyn.curvePoints.length >= 2) {
        const pts = opDyn.curvePoints.map((p) => ({
          x: p.inputValue,
          y: p.outputValue,
        }));
        const lut = generateCurveLookupTable256(pts);
        bridge.setDynamicsMapping(
          "opacity",
          true,
          opDyn.sensorInput,
          0.05,
          1.0,
          lut,
        );
      } else {
        bridge.setDynamicsMapping(
          "opacity",
          false,
          "pressure",
          0.0,
          1.0,
          new Float32Array(256),
        );
      }

      if (hasScatter) {
        const lut = new Float32Array(256);
        for (let i = 0; i < 256; i++) lut[i] = 1.0;
        const maxOut = Math.max(scatterAmp, 0.6);
        bridge.setDynamicsMapping("jitter", true, "random", 0.0, maxOut, lut);
      } else {
        bridge.setDynamicsMapping(
          "jitter",
          false,
          "random",
          0.0,
          0.0,
          new Float32Array(256),
        );
      }
    }

    // 4. Tip geometry (Predefined stamp vs Auto ellipse)
    const tip = params.brushTip;
    if (
      tip &&
      tip.tipType === "predefined" &&
      tip.imageData &&
      tip.width > 0 &&
      tip.height > 0
    ) {
      const tipId = `pad-tip-${draftPreset.presetId}`;
      const maskBytes = new Uint8Array(
        tip.imageData.buffer,
        tip.imageData.byteOffset,
        tip.imageData.byteLength,
      );
      bridge.registerTipMask(
        tipId,
        "Pad Tip",
        tip.width,
        tip.height,
        maskBytes,
        true,
      );
      const angle = (tip as any).angleRadians ?? 0.0;
      bridge.setBrushPredefinedTip(tipId, 1.0, angle);
    } else {
      bridge.clearBrushPredefinedTip();
      const ar = tip?.tipType === "generated" ? (tip.aspectRatio ?? 1.0) : 1.0;
      const angle =
        tip?.tipType === "generated" ? (tip.angleRadians ?? 0.0) : 0.0;
      bridge.setBrushAutoTip(ar, angle);
    }

    // 5. Paper grain texture
    const tex = params.grainTexture;
    if (tex && tex.bytes && tex.bytes.length > 0) {
      const patBytes =
        tex.bytes instanceof Uint8Array ? tex.bytes : new Uint8Array(tex.bytes);
      bridge.registerPatternGrayscale(
        tex.patternId,
        tex.name,
        tex.width,
        tex.height,
        patBytes,
      );
      bridge.setBrushTextureResource(
        tex.patternId,
        tex.scale ?? 1.0,
        tex.mode ?? "multiply",
        tex.strength ?? 1.0,
        tex.invert ?? false,
        tex.brightness ?? 0.0,
        tex.contrast ?? 1.0,
        tex.byPressure ?? false,
      );
    } else {
      bridge.clearBrushTexture();
    }

    // 6. Stroke smoothing
    if (draftSmoothing.pullString) {
      bridge.setPullStringConfig(draftSmoothing.pullString);
    }
    if (draftSmoothing.movingAverage) {
      bridge.setMovingAverageConfig(draftSmoothing.movingAverage);
    }
  }, [draftPreset, draftSmoothing, draftPressureCurve, activeColorRgb]);

  // Clear canvas & Wasm buffer
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bridgeRef.current?.ready) {
      bridgeRef.current.clear(0, 0, 0, 0);
    }
    lastStrokePointRef.current = null;
    setHasUserDrawn(false);
  }, []);

  // Renders the canonical stroke (Procreate S-Curve, etc.) inside the pad
  const renderCanonicalStroke = useCallback(() => {
    const canvas = canvasRef.current;
    const bridge = bridgeRef.current;
    if (!canvas || !bridge || !bridge.ready) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous stroke
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bridge.clear(0, 0, 0, 0);

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = dimensions.width * dpr;
    const h = dimensions.height * dpr;

    // Get trajectory strokes
    const strokeList = getTrajectoryPoints(trajectoryType, w, h);

    for (const strokePoints of strokeList) {
      if (strokePoints.length === 0) continue;
      bridge.beginStroke(strokePoints[0], ctx);
      for (let i = 1; i < strokePoints.length; i++) {
        bridge.extendStroke(strokePoints[i], ctx);
      }
      bridge.finishStroke(ctx);
    }
  }, [dimensions, trajectoryType]);

  // Request Animation Frame Live Update: Re-renders the canonical stroke smoothly
  const scheduleLivePreviewUpdate = useCallback(() => {
    if (isFreehandMode || hasUserDrawn) return;
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
    }

    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      syncBridgeConfig();
      renderCanonicalStroke();
    });
  }, [isFreehandMode, hasUserDrawn, syncBridgeConfig, renderCanonicalStroke]);

  // Reset back to canonical live stroke preview
  const handleResetToCanonical = useCallback(() => {
    setIsFreehandMode(false);
    setHasUserDrawn(false);
    syncBridgeConfig();
    renderCanonicalStroke();
  }, [syncBridgeConfig, renderCanonicalStroke]);

  // ============================================================================
  // Lifecycle & Synchronization Effects
  // ============================================================================

  // Sync canvas size with container dimensions via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 80 && height > 80) {
          setDimensions({
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Initialize and resize isolated Wasm engine with devicePixelRatio scaling
  useEffect(() => {
    let active = true;
    const { width, height } = dimensions;
    if (width <= 0 || height <= 0) return;

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }

    let bridge = bridgeRef.current;
    if (!bridge) {
      bridge = new WasmBrushBridge();
      bridgeRef.current = bridge;
      void bridge.initialize(bufferWidth, bufferHeight).then((ready) => {
        if (ready && active) {
          bridge?.resizeCanvas(bufferWidth, bufferHeight, 0, 0, 0, 0);
          setIsReady(true);
          syncBridgeConfig();
          renderCanonicalStroke();
        }
      });
    } else if (bridge.ready) {
      bridge.resizeCanvas(bufferWidth, bufferHeight, 0, 0, 0, 0);
      syncBridgeConfig();
      if (!isFreehandMode && !hasUserDrawn) {
        renderCanonicalStroke();
      }
    }

    return () => {
      active = false;
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
      }
    };
  }, [
    dimensions,
    syncBridgeConfig,
    renderCanonicalStroke,
    isFreehandMode,
    hasUserDrawn,
  ]);

  // Live update trigger whenever draft brush settings change
  useEffect(() => {
    if (isReady) {
      scheduleLivePreviewUpdate();
    }
  }, [
    isReady,
    scheduleLivePreviewUpdate,
    draftPreset,
    draftSmoothing,
    draftPressureCurve,
  ]);

  // Ensure default canonical stroke is rendered immediately on ready
  useEffect(() => {
    if (isReady && !isFreehandMode && !hasUserDrawn) {
      syncBridgeConfig();
      renderCanonicalStroke();
    }
  }, [
    isReady,
    syncBridgeConfig,
    renderCanonicalStroke,
    isFreehandMode,
    hasUserDrawn,
  ]);

  // In Tauri standalone app on macOS, synchronize the native Cocoa AppKit artboard rect
  // so Cocoa intercepts the Apple Pencil / Wacom stylus with 120-240Hz hardware pressure and tilt!
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const isMac =
    typeof navigator !== "undefined" &&
    /macintosh|mac os x/i.test(navigator.userAgent);
  const isMacNativeOverlay = isTauri && isMac;

  useEffect(() => {
    if (!isMacNativeOverlay || !containerRef.current) return;
    const updateNativeOverlay = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      void globalRustBrushBridge.setModalOpen(false);
      void globalRustBrushBridge.updateArtboardRect(
        rect.left,
        rect.top,
        rect.width,
        rect.height,
      );
      void globalRustBrushBridge.setDocumentSize(
        Math.round(rect.width),
        Math.round(rect.height),
      );
    };

    updateNativeOverlay();
    const timer = setTimeout(updateNativeOverlay, 80);
    window.addEventListener("resize", updateNativeOverlay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateNativeOverlay);
      void globalRustBrushBridge.updateArtboardRect(0, 0, 0, 0);
    };
  }, [dimensions, isMacNativeOverlay]);

  // ============================================================================
  // Pointer Event Handling (Apple Pencil / Wacom Stylus with Coalescing & DPR)
  // ============================================================================

  const getCanvasTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { scale: 1, panX: 0, panY: 0, rotation: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return {
      scale: rect.width > 0 ? canvas.width / rect.width : dpr,
      panX: rect.left,
      panY: rect.top,
      rotation: 0,
    };
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    // Switch to freehand mode on first user interaction
    if (!isFreehandMode || !hasUserDrawn) {
      clearCanvas();
      setIsFreehandMode(true);
      setHasUserDrawn(true);
    }

    isDrawingRef.current = true;
    syncBridgeConfig();

    const transform = getCanvasTransform();
    const strokePoint = normalizePointerEvent(e.nativeEvent, transform);
    lastStrokePointRef.current = strokePoint;

    const ctx = canvas.getContext("2d");
    if (!ctx || !bridgeRef.current?.ready) return;

    bridgeRef.current.beginStroke(strokePoint, ctx);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const transform = getCanvasTransform();
    const points = normalizeCoalescedPointerEvents(
      e.nativeEvent,
      transform,
      lastStrokePointRef.current,
    );

    const ctx = canvas.getContext("2d");
    if (!ctx || !bridgeRef.current?.ready) return;

    if (points.length > 0) {
      bridgeRef.current.extendStrokeBatch(points, ctx);
      lastStrokePointRef.current = points[points.length - 1];
    } else {
      const singlePoint = normalizePointerEvent(
        e.nativeEvent,
        transform,
        lastStrokePointRef.current,
      );
      bridgeRef.current.extendStroke(singlePoint, ctx);
      lastStrokePointRef.current = singlePoint;
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const ctx = canvas?.getContext("2d");
    if (ctx && bridgeRef.current?.ready) {
      bridgeRef.current.finishStroke(ctx);
    }
    lastStrokePointRef.current = null;
  };

  // Styling theme tokens
  const themeStyles = {
    dark: {
      padBg: "bg-[#16161a]",
      canvasBg: "#16161a",
      gridColor: "rgba(255, 255, 255, 0.04)",
      border: "border-zinc-800",
      text: "text-zinc-300",
    },
    light: {
      padBg: "bg-[#f8fafc]",
      canvasBg: "#ffffff",
      gridColor: "rgba(0, 0, 0, 0.03)",
      border: "border-zinc-300",
      text: "text-zinc-700",
    },
    neutral: {
      padBg: "bg-[#3f3f46]",
      canvasBg: "#3f3f46",
      gridColor: "rgba(255, 255, 255, 0.05)",
      border: "border-zinc-600",
      text: "text-zinc-200",
    },
  }[padTheme];

  return (
    <div
      className={`relative flex flex-col h-full w-full select-none overflow-hidden ${themeStyles.padBg} ${className}`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/20 dark:border-white/5 bg-zinc-900/60 backdrop-blur-md z-10 shrink-0">
        {/* Left: Trajectory Selector & Mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/80 text-xs font-medium text-zinc-300 border border-zinc-700/60">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={trajectoryType}
              onChange={(e) => {
                setTrajectoryType(e.target.value as TrajectoryType);
                setIsFreehandMode(false);
                setHasUserDrawn(false);
              }}
              title="Select sample stroke trajectory"
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              {TRAJECTORY_OPTIONS.map((opt) => (
                <option
                  key={opt.id}
                  value={opt.id}
                  className="bg-zinc-800 text-zinc-100"
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Mode Indicator Pill */}
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
              isFreehandMode || hasUserDrawn
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isFreehandMode || hasUserDrawn
              ? "Freehand Scribble"
              : "Live Preview (Procreate)"}
          </span>
        </div>

        {/* Right: Colors, Theme, and Reset Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Swatches */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/80 border border-zinc-700/60">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setActiveColorHex(c.hex)}
                title={c.label}
                aria-label={`Select ${c.label}`}
                className={`w-4 h-4 rounded-full border transition-transform ${
                  activeColorHex.toLowerCase() === c.hex.toLowerCase()
                    ? "scale-125 border-blue-400 shadow-xs"
                    : "border-zinc-600 hover:scale-110"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <input
              type="color"
              value={activeColorHex}
              onChange={(e) => setActiveColorHex(e.target.value)}
              title="Custom stroke color"
              className="w-4 h-4 rounded-full bg-transparent border-0 cursor-pointer p-0 ml-1"
            />
          </div>

          <div className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Theme Toggles */}
          <div className="flex items-center bg-zinc-800/80 rounded-md p-0.5 border border-zinc-700/60">
            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              title="Procreate Dark Slate"
              className={`p-1 rounded text-xs transition-colors ${
                padTheme === "dark"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              title="Studio Crisp Light"
              className={`p-1 rounded text-xs transition-colors ${
                padTheme === "light"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange("neutral")}
              title="50% Neutral Grey"
              className={`p-1 rounded text-xs font-bold transition-colors ${
                padTheme === "neutral"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span className="text-[10px] px-1">50%</span>
            </button>
          </div>

          {/* Reset to Canonical Procreate Stroke */}
          <button
            type="button"
            onClick={handleResetToCanonical}
            title="Reset to Procreate Default Stroke"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Stroke</span>
          </button>

          {/* Clear Button */}
          <button
            type="button"
            onClick={clearCanvas}
            title="Clear Scratchpad Canvas"
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Drawing Area */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center p-4"
        style={{
          backgroundColor: themeStyles.canvasBg,
          backgroundImage: `radial-gradient(${themeStyles.gridColor} 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`block w-full h-full cursor-crosshair rounded-xl border ${themeStyles.border} shadow-inner`}
          style={{
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />

        {/* Ambient subtle hint when in preview mode */}
        {!isFreehandMode && !hasUserDrawn && (
          <div className="absolute bottom-6 right-6 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 text-zinc-400 text-xs">
            <PenTool className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>
              Draw with stylus to test pressure, or tweak sliders to see live
              updates
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
