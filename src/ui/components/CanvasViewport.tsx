import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FC,
  type PointerEvent,
} from "react";
import type { DocumentConfiguration } from "@/types/document";
import type { ActiveTool, CanvasTransform, SoftProofMode } from "@/types/ui";
import { getCssFilterForSoftProof } from "@/engine/color/soft_proofing";
import {
  calculateFocalZoom,
  calculateFitToScreen,
  calculateTwoFingerTransform,
  type TwoFingerGestureState,
  type Point2D,
} from "@/engine/math/canvas_transform";

interface CanvasViewportProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  softProofMode: SoftProofMode;
  onTransformChange: (transform: CanvasTransform) => void;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Interaction States
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Refs for high-frequency tracking without stale closures
  const transformRef = useRef<CanvasTransform>(transform);
  const isPanningRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    isPanningRef.current = isPanning;
  }, [isPanning]);

  useEffect(() => {
    isSpaceDownRef.current = isSpaceDown;
  }, [isSpaceDown]);

  // Multi-Touch tracking for two-finger gestures (pinch-to-zoom and pan)
  const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const gestureStateRef = useRef<TwoFingerGestureState | null>(null);

  // Fit document into viewport
  const fitToScreen = useCallback(
    (paddingRatio = 0.85) => {
      const container = containerRef.current;
      if (!container) return;
      const { clientWidth, clientHeight } = container;
      const fitTransform = calculateFitToScreen(clientWidth, clientHeight, doc.width, doc.height, paddingRatio);
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
    onTransformChange({ scale: targetScale, panX, panY });
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
      const nextTransform = calculateFocalZoom(transformRef.current, centerX, centerY, targetScale);
      onTransformChange(nextTransform);
    },
    [onTransformChange]
  );

  // Initialize Canvas background on document size or color change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = doc.width;
    canvas.height = doc.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (doc.backgroundColor === "transparent") {
      ctx.clearRect(0, 0, doc.width, doc.height);
    } else {
      ctx.fillStyle = doc.backgroundColor;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }
  }, [doc.width, doc.height, doc.backgroundColor]);

  // Center canvas on initial mount or when document dimension changes
  useEffect(() => {
    fitToScreen(0.85);
  }, [doc.id, doc.width, doc.height, fitToScreen]);

  // Listen for window resize to optionally update fit if centered
  useEffect(() => {
    const handleResize = () => {
      // Auto-fit on window resize if desired
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard navigation shortcuts: Spacebar pan & Cmd/Ctrl + 0/1/+/-
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if typing in an input or textarea
      const targetTag = (document.activeElement?.tagName || "").toUpperCase();
      if (targetTag === "INPUT" || targetTag === "TEXTAREA") {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpaceDown(true);
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
      }
    };

    const handleWindowBlur = () => {
      setIsSpaceDown(false);
      setIsPanning(false);
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
  }, [fitToScreen, zoomTo100, zoomByFactor]);

  // Native non-passive Wheel / Trackpad listener for butter-smooth 120fps zoom & pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: globalThis.WheelEvent) => {
      // Stop native page pinch-zoom and horizontal back-swipe
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Trackpad pinch-to-zoom or Ctrl/Alt + Mouse Wheel
        // Symmetrical exponential zoom factor
        const zoomDelta = -e.deltaY * (e.ctrlKey ? 0.008 : 0.002);
        const zoomFactor = Math.exp(zoomDelta);
        const targetScale = transformRef.current.scale * zoomFactor;

        const nextTransform = calculateFocalZoom(transformRef.current, mouseX, mouseY, targetScale);
        onTransformChange(nextTransform);
      } else {
        // Trackpad 2-finger pan / Mouse wheel scroll
        onTransformChange({
          scale: transformRef.current.scale,
          panX: transformRef.current.panX - e.deltaX,
          panY: transformRef.current.panY - e.deltaY,
        });
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [onTransformChange]);

  // Convert viewport client coordinates to canvas pixel space
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

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

  // --- Pointer Event Handlers (Canvas & Container) ---

  const startPanning = (clientX: number, clientY: number, pointerId: number, targetElement: HTMLElement | HTMLCanvasElement) => {
    setIsPanning(true);
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

  // Click on background matte (outside document paper) to pan
  const handleContainerPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Only handle if clicked directly on the container backdrop
    if (e.target !== containerRef.current) return;

    // Track active pointer
    activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (e.button === 0 || e.button === 1) {
      startPanning(e.clientX, e.clientY, e.pointerId, e.currentTarget);
    }
  };

  // Canvas pointer down
  const handleCanvasPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    // Track pointer for multi-touch gestures
    activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Multi-touch pinch check (2 fingers on screen)
    if (activePointersRef.current.size === 2) {
      // Abort any in-progress drawing immediately so finger doesn't draw streaks
      setIsDrawing(false);
      lastPointRef.current = null;

      const pointers = Array.from(activePointersRef.current.values());
      const p1 = getContainerCoordinates(pointers[0].clientX, pointers[0].clientY);
      const p2 = getContainerCoordinates(pointers[1].clientX, pointers[1].clientY);

      gestureStateRef.current = {
        initialDistance: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        initialScale: transformRef.current.scale,
        initialCentroid: { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 },
        initialPan: { x: transformRef.current.panX, y: transformRef.current.panY },
      };
      return;
    }

    // Pan via Middle Click (button 1), Spacebar hold, or Alt key
    if (e.button === 1 || e.buttons === 4 || isSpaceDownRef.current || e.altKey) {
      startPanning(e.clientX, e.clientY, e.pointerId, e.currentTarget);
      return;
    }

    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    setIsDrawing(true);

    const point = getCanvasCoordinates(e.clientX, e.clientY);
    lastPointRef.current = point;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const effectiveRadius = Math.max(1, (brushSize * pressure) / 2);

    ctx.save();
    if (activeTool === "eraser") {
      ctx.globalCompositeOperation = doc.backgroundColor === "transparent" ? "destination-out" : "source-over";
      ctx.fillStyle = doc.backgroundColor === "transparent" ? "rgba(0,0,0,1)" : doc.backgroundColor;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = brushOpacity;
      ctx.fillStyle = activeColor;
    }

    ctx.beginPath();
    ctx.arc(point.x, point.y, effectiveRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement | HTMLCanvasElement>) => {
    // Update active pointer position
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    // 1. Two-Finger Pinch-to-Zoom & Pan Gesture
    if (activePointersRef.current.size === 2 && gestureStateRef.current) {
      const pointers = Array.from(activePointersRef.current.values());
      const p1 = getContainerCoordinates(pointers[0].clientX, pointers[0].clientY);
      const p2 = getContainerCoordinates(pointers[1].clientX, pointers[1].clientY);

      const nextTransform = calculateTwoFingerTransform(gestureStateRef.current, p1, p2);
      onTransformChange(nextTransform);
      return;
    }

    // 2. Viewport Panning
    if (isPanningRef.current) {
      onTransformChange({
        scale: transformRef.current.scale,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y,
      });
      return;
    }

    // 3. Drawing
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPointRef.current) return;

    const currentPoint = getCanvasCoordinates(e.clientX, e.clientY);
    const prevPoint = lastPointRef.current;
    const pressure = e.pressure > 0 ? e.pressure : 0.6;
    const effectiveRadius = Math.max(1, (brushSize * pressure) / 2);

    ctx.save();
    if (activeTool === "eraser") {
      ctx.globalCompositeOperation = doc.backgroundColor === "transparent" ? "destination-out" : "source-over";
      ctx.strokeStyle = doc.backgroundColor === "transparent" ? "rgba(0,0,0,1)" : doc.backgroundColor;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = brushOpacity;
      ctx.strokeStyle = activeColor;
    }

    ctx.lineWidth = effectiveRadius * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(prevPoint.x, prevPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    ctx.restore();

    lastPointRef.current = currentPoint;
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement | HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      gestureStateRef.current = null;
    }

    if (isPanningRef.current) {
      setIsPanning(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      return;
    }

    if (isDrawing) {
      setIsDrawing(false);
      lastPointRef.current = null;
      try {
        if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    }
  };

  // Cursor styling based on active mode
  const getContainerCursorClass = () => {
    if (isPanning) return "cursor-grabbing";
    if (isSpaceDown) return "cursor-grab";
    return "";
  };

  const getCanvasCursorClass = () => {
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
      className={`flex-1 w-full h-full relative overflow-hidden bg-[#121214] select-none touch-none ${getContainerCursorClass()}`}
    >
      {/* Pan & Zoom Container — zero CSS transition lag for instant 1:1 hardware feel */}
      <div
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.scale})`,
        }}
      >
        {/* Document Artboard Paper Surface */}
        <div
          className="relative rounded-sm shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-zinc-800/80 overflow-hidden"
          style={{
            width: doc.width,
            height: doc.height,
            backgroundColor: doc.backgroundColor === "transparent" ? "#ffffff" : doc.backgroundColor,
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
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`block touch-none ${getCanvasCursorClass()}`}
            style={{ width: doc.width, height: doc.height }}
          />
        </div>
      </div>
    </main>
  );
};
