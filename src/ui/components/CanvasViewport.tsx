import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FC,
  type PointerEvent,
} from "react";
import { PenTool, FolderDown } from "lucide-react";
import type { DocumentConfiguration } from "@/types/document";
import type { ActiveTool, CanvasTransform, SoftProofMode } from "@/types/ui";
import { getCssFilterForSoftProof } from "@/engine/color/soft_proofing";
import {
  calculateFocalZoom,
  calculateFitToScreen,
  calculateTwoFingerTransform,
  snapRotationAngle,
  type TwoFingerGestureState,
  type Point2D,
} from "@/engine/math/canvas_transform";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import {
  normalizePointerEvent,
  normalizeCoalescedPointerEvents,
} from "@/input/pointer/pointer_event_normalizer";
import { hexToRgb } from "@/engine/color/color_conversions";
import type { StrokePoint } from "@/types/stroke";

interface CanvasViewportProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  softProofMode: SoftProofMode;
  onTransformChange: (transform: CanvasTransform) => void;
  stylusOnlyMode?: boolean;
  onStylusOnlyModeChange?: (enabled: boolean) => void;
}

export const CanvasViewport: FC<CanvasViewportProps> = ({
  document: doc,
  activeTool,
  activeColor,
  brushSize,
  brushOpacity,
  transform,
  softProofMode,
  onTransformChange,
  stylusOnlyMode: initialStylusOnlyMode,
  onStylusOnlyModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Palm Rejection & Stylus-Only Mode (defaults to true for touch/pen ergonomics)
  const [stylusOnlyMode, setStylusOnlyMode] = useState<boolean>(initialStylusOnlyMode ?? true);
  const stylusOnlyModeRef = useRef<boolean>(stylusOnlyMode);

  useEffect(() => {
    stylusOnlyModeRef.current = stylusOnlyMode;
  }, [stylusOnlyMode]);

  useEffect(() => {
    if (initialStylusOnlyMode !== undefined) {
      setStylusOnlyMode(initialStylusOnlyMode);
    }
  }, [initialStylusOnlyMode]);

  // Interaction States
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isRKeyDown, setIsRKeyDown] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Refs for high-frequency tracking without stale closures
  const transformRef = useRef<CanvasTransform>(transform);
  const isPanningRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const isRKeyDownRef = useRef(false);
  const isRotatingRef = useRef(false);
  const rotateStartAngleRef = useRef(0);
  const rotateInitialAngleRef = useRef(0);
  const isDrawingRef = useRef(false);
  const drawingPointerIdRef = useRef<number | null>(null);
  const drawingPointerTypeRef = useRef<string | null>(null);
  const lastStrokePointRef = useRef<StrokePoint | null>(null);

  // Multi-Touch tracking for two-finger gestures (pinch-to-zoom, pan, rotate)
  const activePointersRef = useRef<
    Map<number, { clientX: number; clientY: number; pointerType: string }>
  >(new Map());
  const gestureStateRef = useRef<TwoFingerGestureState | null>(null);

  // Direct DOM rAF transform tracking to eliminate 120Hz React re-render storms on iPad
  const rafIdRef = useRef<number | null>(null);
  const pendingDomTransformRef = useRef<CanvasTransform | null>(null);

  const applyTransformToDom = useCallback((newTransform: CanvasTransform) => {
    pendingDomTransformRef.current = newTransform;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (pendingDomTransformRef.current && wrapperRef.current) {
          const { panX, panY, scale, rotation } = pendingDomTransformRef.current;
          wrapperRef.current.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale}) rotate(${
            rotation ?? 0
          }deg)`;
        }
      });
    }
  }, []);

  const commitDomTransform = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (wrapperRef.current) {
      const { panX, panY, scale, rotation } = transformRef.current;
      wrapperRef.current.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale}) rotate(${
        rotation ?? 0
      }deg)`;
    }
    onTransformChange(transformRef.current);
  }, [onTransformChange]);

  useEffect(() => {
    transformRef.current = transform;
    if (
      wrapperRef.current &&
      !isPanningRef.current &&
      !isRotatingRef.current &&
      !gestureStateRef.current
    ) {
      const { panX, panY, scale, rotation } = transform;
      wrapperRef.current.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale}) rotate(${
        rotation ?? 0
      }deg)`;
    }
  }, [transform]);

  useEffect(() => {
    isPanningRef.current = isPanning;
  }, [isPanning]);

  useEffect(() => {
    isSpaceDownRef.current = isSpaceDown;
  }, [isSpaceDown]);

  useEffect(() => {
    isRKeyDownRef.current = isRKeyDown;
  }, [isRKeyDown]);

  // Fit document into viewport
  const fitToScreen = useCallback(
    (paddingRatio = 0.85) => {
      const container = containerRef.current;
      if (!container) return;
      const { clientWidth, clientHeight } = container;
      const fitTransform = calculateFitToScreen(
        clientWidth,
        clientHeight,
        doc.width,
        doc.height,
        paddingRatio
      );
      onTransformChange(fitTransform);
    },
    [doc.width, doc.height, onTransformChange]
  );

  // Zoom to 100% (1:1 pixel scale) centered
  const zoomTo100 = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { clientWidth, clientHeight } = container;
    const targetScale = 1.0;
    const panX = (clientWidth - doc.width * targetScale) * 0.5;
    const panY = (clientHeight - doc.height * targetScale) * 0.5;
    onTransformChange({ scale: targetScale, panX, panY, rotation: transformRef.current.rotation });
  }, [doc.width, doc.height, onTransformChange]);

  // Zoom by a multiplicative factor relative to container center
  const zoomByFactor = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const { clientWidth, clientHeight } = container;
      const centerX = clientWidth * 0.5;
      const centerY = clientHeight * 0.5;
      const targetScale = transformRef.current.scale * factor;
      const nextTransform = calculateFocalZoom(
        transformRef.current,
        centerX,
        centerY,
        targetScale
      );
      onTransformChange(nextTransform);
    },
    [onTransformChange]
  );

  // Mount Canvas to Drawing Engine & initialize background on document size or color change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = doc.width;
    canvas.height = doc.height;

    globalDrawingEngine.mountToCanvas(canvas);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (doc.backgroundColor === "transparent") {
        ctx.clearRect(0, 0, doc.width, doc.height);
      } else {
        ctx.fillStyle = doc.backgroundColor;
        ctx.fillRect(0, 0, doc.width, doc.height);
      }
    }

    return () => {
      globalDrawingEngine.unmount();
    };
  }, [doc.id, doc.width, doc.height, doc.backgroundColor]);

  // Synchronize brush parameters & active tool mode to drawing engine
  useEffect(() => {
    const rgb = hexToRgb(activeColor) ?? [0, 0, 0];
    globalDrawingEngine.setForegroundColor(rgb[0], rgb[1], rgb[2], 1.0);
    globalDrawingEngine.setBrushSize(brushSize);
    globalDrawingEngine.setBrushOpacity(brushOpacity);
    globalDrawingEngine.setBlendMode(activeTool === "eraser" ? "erase" : "normal");
  }, [activeColor, brushSize, brushOpacity, activeTool]);

  // Center canvas on initial mount or when document dimension changes
  useEffect(() => {
    fitToScreen(0.85);
  }, [doc.id, doc.width, doc.height, fitToScreen]);

  // Listen for window resize
  useEffect(() => {
    const handleResize = () => {
      // Auto-fit on window resize if desired
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard navigation shortcuts: Spacebar pan, R-key rotate, & Cmd/Ctrl + 0/1/+/-
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (document.activeElement?.tagName || "").toUpperCase();
      if (targetTag === "INPUT" || targetTag === "TEXTAREA") {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpaceDown(true);
      } else if (e.code === "KeyR" && !e.repeat) {
        setIsRKeyDown(true);
      }

      // Keyboard Zoom Shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "0") {
          e.preventDefault();
          fitToScreen();
        } else if (e.key === "1") {
          e.preventDefault();
          zoomTo100();
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomByFactor(1.25);
        } else if (e.key === "-") {
          e.preventDefault();
          zoomByFactor(0.8);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
      } else if (e.code === "KeyR") {
        setIsRKeyDown(false);
        if (isRotatingRef.current) {
          isRotatingRef.current = false;
          commitDomTransform();
        }
      }
    };

    const handleWindowBlur = () => {
      setIsSpaceDown(false);
      setIsRKeyDown(false);
      setIsPanning(false);
      isRotatingRef.current = false;
      activePointersRef.current.clear();
      gestureStateRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [fitToScreen, zoomTo100, zoomByFactor, commitDomTransform]);

  // Native non-passive Wheel / Trackpad listener for butter-smooth 120fps zoom & pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        const zoomDelta = -e.deltaY * (e.ctrlKey ? 0.008 : 0.002);
        const zoomFactor = Math.exp(zoomDelta);
        const targetScale = transformRef.current.scale * zoomFactor;

        const nextTransform = calculateFocalZoom(
          transformRef.current,
          mouseX,
          mouseY,
          targetScale
        );
        onTransformChange(nextTransform);
      } else {
        onTransformChange({
          scale: transformRef.current.scale,
          panX: transformRef.current.panX - e.deltaX,
          panY: transformRef.current.panY - e.deltaY,
          rotation: transformRef.current.rotation,
        });
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [onTransformChange]);

  // Computes screen-to-canvas coordinate unprojection accounting for container offset, zoom, and rotation
  const getEffectiveTransform = useCallback((): CanvasTransform => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    return {
      scale: transformRef.current.scale,
      panX: (containerRect?.left ?? 0) + transformRef.current.panX,
      panY: (containerRect?.top ?? 0) + transformRef.current.panY,
      rotation: transformRef.current.rotation ?? 0,
    };
  }, []);

  // Convert client viewport coordinates to container local coordinates
  const getContainerCoordinates = (clientX: number, clientY: number): Point2D => {
    const container = containerRef.current;
    if (!container) return { x: clientX, y: clientY };
    const rect = container.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  // --- Pointer Interaction Helpers ---

  const startPanning = (
    clientX: number,
    clientY: number,
    pointerId: number,
    targetElement: HTMLElement | HTMLCanvasElement
  ) => {
    setIsPanning(true);
    isPanningRef.current = true;
    setPanStart({
      x: clientX - transformRef.current.panX,
      y: clientY - transformRef.current.panY,
    });
    try {
      targetElement.setPointerCapture(pointerId);
    } catch {
      // Ignore
    }
  };

  const startRotating = (
    clientX: number,
    clientY: number,
    pointerId: number,
    targetElement: HTMLElement | HTMLCanvasElement
  ) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.width * 0.5;
    const centerY = rect.height * 0.5;
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    rotateStartAngleRef.current = Math.atan2(mouseY - centerY, mouseX - centerX);
    rotateInitialAngleRef.current = transformRef.current.rotation ?? 0;
    isRotatingRef.current = true;
    try {
      targetElement.setPointerCapture(pointerId);
    } catch {
      // Ignore
    }
  };

  // --- Pointer Event Handlers (Canvas & Container) ---

  const handleContainerPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== containerRef.current) return;

    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
    });

    if (e.button === 0 || e.button === 1) {
      if (isRKeyDownRef.current && e.pointerType === "mouse") {
        startRotating(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      } else {
        startPanning(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      }
    }
  };

  const handleCanvasPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
    });

    const activeTouches = Array.from(activePointersRef.current.entries()).filter(
      ([, p]) => p.pointerType === "touch"
    );

    // 1. Multi-Touch 2-Finger Gesture Check (Pinch-to-zoom, pan, and rotate)
    if (activeTouches.length === 2) {
      // Abort in-progress drawing immediately so finger doesn't draw streaks
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        drawingPointerIdRef.current = null;
        drawingPointerTypeRef.current = null;
        lastStrokePointRef.current = null;
        globalDrawingEngine.endStroke();
      }
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }

      const p1 = getContainerCoordinates(
        activeTouches[0][1].clientX,
        activeTouches[0][1].clientY
      );
      const p2 = getContainerCoordinates(
        activeTouches[1][1].clientX,
        activeTouches[1][1].clientY
      );

      gestureStateRef.current = {
        initialDistance: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        initialScale: transformRef.current.scale,
        initialCentroid: { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 },
        initialPan: { x: transformRef.current.panX, y: transformRef.current.panY },
        initialAngle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        initialRotation: transformRef.current.rotation ?? 0,
      };
      return;
    }

    // 2. Desktop Shortcut: 'R' key held + mouse drag to rotate canvas
    if (isRKeyDownRef.current && e.pointerType === "mouse") {
      startRotating(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      return;
    }

    // 3. Pan via Middle Click (button 1), Spacebar hold, or Alt key
    if (e.button === 1 || e.buttons === 4 || isSpaceDownRef.current || e.altKey) {
      startPanning(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      return;
    }

    // 4. Touch Pointer (Finger / Palm) Routing
    if (e.pointerType === "touch") {
      // PALM REJECTION: if pencil is actively drawing, ignore palm touches completely
      if (isDrawingRef.current && drawingPointerTypeRef.current === "pen") {
        return;
      }

      // When Stylus-Only mode is enabled: touch NEVER draws ink!
      if (stylusOnlyModeRef.current) {
        if (activeTouches.length === 1) {
          startPanning(e.clientX, e.clientY, e.pointerId, e.currentTarget);
        }
        return;
      }
    }

    // 5. Drawing Initiation (Apple Pencil or Left Click Mouse / Finger when Stylus-Only is OFF)
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    isDrawingRef.current = true;
    drawingPointerIdRef.current = e.pointerId;
    drawingPointerTypeRef.current = e.pointerType;

    const effectiveTransform = getEffectiveTransform();
    const strokePoint = normalizePointerEvent(e.nativeEvent, effectiveTransform);
    lastStrokePointRef.current = strokePoint;
    globalDrawingEngine.beginStroke(strokePoint);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement | HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      });
    }

    // 1. Two-Finger Pinch-to-Zoom, Pan, and Rotate Gesture
    const activeTouches = Array.from(activePointersRef.current.entries()).filter(
      ([, p]) => p.pointerType === "touch"
    );

    if (activeTouches.length >= 2 && gestureStateRef.current) {
      const p1 = getContainerCoordinates(
        activeTouches[0][1].clientX,
        activeTouches[0][1].clientY
      );
      const p2 = getContainerCoordinates(
        activeTouches[1][1].clientX,
        activeTouches[1][1].clientY
      );

      const nextTransform = calculateTwoFingerTransform(gestureStateRef.current, p1, p2);
      transformRef.current = nextTransform;
      applyTransformToDom(nextTransform);
      return;
    }

    // 2. Desktop 'R' Key Rotation
    if (isRotatingRef.current) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.width * 0.5;
        const centerY = rect.height * 0.5;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
        let deltaAngle = currentAngle - rotateStartAngleRef.current;
        while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

        const deltaDegrees = (deltaAngle * 180) / Math.PI;
        const rawRotation = rotateInitialAngleRef.current + deltaDegrees;
        const snappedRotation = snapRotationAngle(rawRotation);

        const nextTransform: CanvasTransform = {
          ...transformRef.current,
          rotation: snappedRotation,
        };
        transformRef.current = nextTransform;
        applyTransformToDom(nextTransform);
      }
      return;
    }

    // 3. Viewport Panning
    if (isPanningRef.current) {
      const nextTransform: CanvasTransform = {
        ...transformRef.current,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y,
      };
      transformRef.current = nextTransform;
      applyTransformToDom(nextTransform);
      return;
    }

    // 4. Drawing via High-Speed Telemetry Pipeline
    if (!isDrawingRef.current) return;
    if (e.pointerId !== drawingPointerIdRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const effectiveTransform = getEffectiveTransform();
    const points = normalizeCoalescedPointerEvents(
      e.nativeEvent,
      effectiveTransform,
      lastStrokePointRef.current
    );

    for (const point of points) {
      if (lastStrokePointRef.current) {
        const deltaX = point.canvasX - lastStrokePointRef.current.canvasX;
        const deltaY = point.canvasY - lastStrokePointRef.current.canvasY;
        if (deltaX * deltaX + deltaY * deltaY < 0.25) {
          continue;
        }
      }
      globalDrawingEngine.extendStroke(point);
      lastStrokePointRef.current = point;
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement | HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    const activeTouches = Array.from(activePointersRef.current.values()).filter(
      (p) => p.pointerType === "touch"
    );

    if (activeTouches.length < 2 && gestureStateRef.current) {
      gestureStateRef.current = null;
      commitDomTransform();
    }

    if (isRotatingRef.current) {
      isRotatingRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      commitDomTransform();
      return;
    }

    if (isPanningRef.current) {
      setIsPanning(false);
      isPanningRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      commitDomTransform();
      return;
    }

    if (isDrawingRef.current && e.pointerId === drawingPointerIdRef.current) {
      isDrawingRef.current = false;
      drawingPointerIdRef.current = null;
      drawingPointerTypeRef.current = null;
      lastStrokePointRef.current = null;
      globalDrawingEngine.endStroke();
      try {
        if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    }
  };

  // --- Drag & Drop (.bundle and .kpp import) ---

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".bundle") || lowerName.endsWith(".zip")) {
        try {
          const buffer = await file.arrayBuffer();
          const imported = await globalDrawingEngine.loadKritaBundle(buffer, file.name);
          if (imported.length > 0) {
            globalDrawingEngine.setActiveBrush(imported[0]);
          }
        } catch (err) {
          console.error("Failed to load dropped bundle:", err);
        }
      } else if (lowerName.endsWith(".kpp") || lowerName.endsWith(".png")) {
        try {
          const buffer = await file.arrayBuffer();
          const imported = await globalDrawingEngine.loadKritaPreset(buffer);
          globalDrawingEngine.setActiveBrush(imported);
        } catch (err) {
          console.error("Failed to load dropped preset:", err);
        }
      }
    }
  };

  // Cursor styling based on active mode
  const getContainerCursorClass = () => {
    if (isRotatingRef.current || isRKeyDown) return "cursor-grab";
    if (isPanning) return "cursor-grabbing";
    if (isSpaceDown) return "cursor-grab";
    return "";
  };

  const getCanvasCursorClass = () => {
    if (isRotatingRef.current || isRKeyDown) return "cursor-grab";
    if (isPanning) return "cursor-grabbing";
    if (isSpaceDown) return "cursor-grab";
    return "cursor-crosshair";
  };

  return (
    <main
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => fitToScreen()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 w-full h-full relative overflow-hidden bg-[#121214] select-none touch-none ${getContainerCursorClass()}`}
    >
      {/* Hidden SVG Filter definition for 100% mathematically exact sRGB isoluminant soft proofing */}
      <svg className="absolute w-0 h-0 pointer-events-none opacity-0 overflow-hidden" aria-hidden="true">
        <defs>
          <filter id="softproof-values-bw" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.2126 0.7152 0.0722 0 0
                      0.2126 0.7152 0.0722 0 0
                      0.2126 0.7152 0.0722 0 0
                      0      0      0      1 0"
            />
          </filter>
        </defs>
      </svg>
      {/* Drag & Drop Visual Overlay Feedback */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-sky-950/70 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-sky-400 rounded-lg pointer-events-none">
          <FolderDown className="w-12 h-12 text-sky-400 mb-3 animate-bounce" />
          <p className="text-base font-medium text-sky-100">Drop Krita .bundle or .kpp</p>
          <p className="text-xs text-sky-300/80 mt-1">Instant load and activate brush preset</p>
        </div>
      )}

      {/* Pan, Zoom, and Rotation Container — direct DOM rAF transform for 120fps hardware feel */}
      <div
        ref={wrapperRef}
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.scale}) rotate(${
            transform.rotation ?? 0
          }deg)`,
        }}
      >
        {/* Document Artboard Paper Surface — crisp lightweight sub-pixel border, no heavy 60px blur shadow */}
        <div
          className="relative rounded-sm border border-zinc-700/80 overflow-hidden"
          style={{
            width: doc.width,
            height: doc.height,
            backgroundColor:
              doc.backgroundColor === "transparent" ? "#ffffff" : doc.backgroundColor,
            filter: getCssFilterForSoftProof(softProofMode),
          }}
        >
          {/* Transparency checkerboard when transparent background */}
          {doc.backgroundColor === "transparent" && (
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)",
                backgroundSize: "20px 20px",
              }}
            />
          )}

          {/* Core Drawing Canvas */}
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={(e) => {
              e.stopPropagation();
              handlePointerMove(e);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              handlePointerUp(e);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              handlePointerUp(e);
            }}
            className={`block touch-none ${getCanvasCursorClass()}`}
            style={{ width: doc.width, height: doc.height, imageRendering: "auto" }}
          />
        </div>
      </div>

      {/* Palm Rejection (Stylus-Only Mode) Quick Toggle Indicator */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !stylusOnlyMode;
            setStylusOnlyMode(next);
            onStylusOnlyModeChange?.(next);
          }}
          aria-label={`Toggle Palm Rejection (Stylus Only Mode): currently ${
            stylusOnlyMode ? "ON" : "OFF"
          }`}
          title={`Palm Rejection (Stylus Only): ${
            stylusOnlyMode ? "ON (Pencil draws, finger pans)" : "OFF (Finger can draw)"
          }`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border backdrop-blur-md transition-colors ${
            stylusOnlyMode
              ? "bg-zinc-900/80 border-zinc-700/80 text-zinc-200 hover:bg-zinc-800"
              : "bg-zinc-900/40 border-zinc-800/40 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <PenTool className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Palm Rejection:</span>
          <span className={stylusOnlyMode ? "text-emerald-400 font-semibold" : "text-zinc-400"}>
            {stylusOnlyMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>
    </main>
  );
};
