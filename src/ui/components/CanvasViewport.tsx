import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type FC,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { DocumentConfiguration } from "@/types/document";
import type { ActiveTool, CanvasTransform } from "@/types/ui";

interface CanvasViewportProps {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  onTransformChange: (transform: CanvasTransform) => void;
}

export const CanvasViewport: FC<CanvasViewportProps> = ({
  document: doc,
  activeTool,
  activeColor,
  brushSize,
  brushOpacity,
  transform,
  onTransformChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize Canvas background whenever document dimensions or background change
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

  // Center canvas on initial mount or when document size changes
  useEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleFactor = Math.min(
      (clientWidth * 0.8) / doc.width,
      (clientHeight * 0.8) / doc.height,
      1.0
    );
    const initialPanX = (clientWidth - doc.width * scaleFactor) / 2;
    const initialPanY = (clientHeight - doc.height * scaleFactor) / 2;

    onTransformChange({
      scale: Math.max(0.1, Math.min(scaleFactor, 2.0)),
      panX: initialPanX,
      panY: initialPanY,
    });
  }, [doc.id, doc.width, doc.height, onTransformChange]);

  // Handle Zoom & Pan via Mouse Wheel / Trackpad
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Zooming
        const zoomDelta = -e.deltaY * 0.005;
        const newScale = Math.max(0.1, Math.min(10, transform.scale * (1 + zoomDelta)));

        // Zoom relative to mouse position
        const scaleRatio = newScale / transform.scale;
        const newPanX = mouseX - (mouseX - transform.panX) * scaleRatio;
        const newPanY = mouseY - (mouseY - transform.panY) * scaleRatio;

        onTransformChange({ scale: newScale, panX: newPanX, panY: newPanY });
      } else {
        // Panning
        onTransformChange({
          scale: transform.scale,
          panX: transform.panX - e.deltaX,
          panY: transform.panY - e.deltaY,
        });
      }
    },
    [transform, onTransformChange]
  );

  // Convert client viewport coordinates to canvas pixel coordinates
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  // Immediate Basic Interactive Drawing (Foundation for Step 2's full brush engine)
  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    // If middle click or space held, initiate pan instead of draw
    if (e.button === 1 || e.buttons === 4 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.panX, y: e.clientY - transform.panY });
      return;
    }

    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
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

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      onTransformChange({
        scale: transform.scale,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y,
      });
      return;
    }

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

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDrawing) {
      setIsDrawing(false);
      lastPointRef.current = null;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }
    }
  };

  return (
    <main
      ref={containerRef}
      onWheel={handleWheel}
      className="flex-1 w-full h-full relative overflow-hidden bg-[#121214] select-none touch-none"
    >
      {/* Pan & Zoom Container */}
      <div
        className="absolute origin-top-left will-change-transform transition-transform duration-75 ease-out"
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="block touch-none cursor-crosshair"
            style={{ width: doc.width, height: doc.height }}
          />
        </div>
      </div>
    </main>
  );
};
