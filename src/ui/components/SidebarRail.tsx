import { useState, useRef, useCallback, type FC } from "react";
import { motion } from "motion/react";
import { Undo2, Redo2, Pipette } from "lucide-react";
import {
  ratioToBrushSize,
  brushSizeToRatio,
  ratioToOpacity,
  opacityToRatio,
} from "./slider_utils";

interface SidebarRailProps {
  brushSize: number;
  brushOpacity: number;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onModifierClick?: () => void;
}

export const SidebarRail: FC<SidebarRailProps> = ({
  brushSize,
  brushOpacity,
  onBrushSizeChange,
  onBrushOpacityChange,
  onUndo,
  onRedo,
  onModifierClick,
}) => {
  const [showSizeTooltip, setShowSizeTooltip] = useState(false);
  const [showOpacityTooltip, setShowOpacityTooltip] = useState(false);
  const [isDraggingSize, setIsDraggingSize] = useState(false);
  const [isDraggingOpacity, setIsDraggingOpacity] = useState(false);

  const sizeTrackRef = useRef<HTMLDivElement>(null);
  const opacityTrackRef = useRef<HTMLDivElement>(null);

  const opacityPercentage = Math.round(brushOpacity * 100);

  // Perceptual quadratic ratio for brush size (0 to 1)
  const sizeRatio = brushSizeToRatio(brushSize);

  // Linear ratio for opacity (0 to 1)
  const opacityRatio = opacityToRatio(brushOpacity);

  const handleSizePointer = useCallback(
    (clientY: number) => {
      const track = sizeTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      // Invert Y so bottom is 0% (minimum) and top is 100% (maximum)
      const ratio = Math.max(0, Math.min(1, 1 - relativeY / rect.height));
      const newSize = ratioToBrushSize(ratio);
      onBrushSizeChange(newSize);
    },
    [onBrushSizeChange]
  );

  const handleOpacityPointer = useCallback(
    (clientY: number) => {
      const track = opacityTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const ratio = Math.max(0, Math.min(1, 1 - relativeY / rect.height));
      const newOpacity = ratioToOpacity(ratio);
      onBrushOpacityChange(newOpacity);
    },
    [onBrushOpacityChange]
  );

  return (
    <motion.aside
      aria-label="Brush dynamics and history rail"
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 25, stiffness: 220, delay: 0.15 }}
      className="fixed left-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-4 py-4 px-2.5 rounded-r-2xl bg-zinc-950/90 backdrop-blur-md border-r border-y border-zinc-800/80 shadow-2xl select-none"
    >
      {/* 1. Brush Size Vertical Capsule Slider (No circular thumb) */}
      <div className="relative flex flex-col items-center">
        {/* Floating Tooltip to the right */}
        {(showSizeTooltip || isDraggingSize) && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-zinc-900/95 border border-zinc-700/80 text-xs font-mono font-medium text-zinc-100 shadow-2xl whitespace-nowrap pointer-events-none z-30 animate-in fade-in zoom-in-95 duration-100">
            {brushSize} px
          </div>
        )}

        <div
          ref={sizeTrackRef}
          role="slider"
          aria-label="Brush Size"
          aria-valuenow={brushSize}
          aria-valuemin={1}
          aria-valuemax={300}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDraggingSize(true);
            handleSizePointer(e.clientY);
          }}
          onPointerMove={(e) => {
            if (isDraggingSize) {
              handleSizePointer(e.clientY);
            }
          }}
          onPointerUp={(e) => {
            setIsDraggingSize(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            setIsDraggingSize(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerEnter={() => setShowSizeTooltip(true)}
          onPointerLeave={() => {
            if (!isDraggingSize) setShowSizeTooltip(false);
          }}
          className="relative w-9 h-28 flex items-center justify-center cursor-pointer touch-none"
          title={`Brush Size: ${brushSize}px`}
        >
          {/* Visual Track Capsule (16px wide, 100px tall) */}
          <div className="w-4 h-full rounded-full bg-zinc-850 ring-1 ring-inset ring-white/10 relative overflow-hidden flex flex-col justify-end shadow-inner">
            {/* Active Level Fill rising from the bottom */}
            <div
              className={`w-full rounded-full ${
                isDraggingSize ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" : "bg-zinc-200"
              }`}
              style={{
                height: `${Math.max(6, sizeRatio * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Middle Modifier / Eyedropper Button */}
      <button
        type="button"
        onClick={onModifierClick}
        aria-label="Eyedropper / Modifier Button"
        title="Eyedropper / Modifier"
        className="w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-800/90 active:scale-95 border border-white/20 hover:border-white/50 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-all shadow-sm cursor-pointer group"
      >
        <Pipette className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* 3. Brush Opacity Vertical Capsule Slider (No circular thumb) */}
      <div className="relative flex flex-col items-center">
        {/* Floating Tooltip to the right */}
        {(showOpacityTooltip || isDraggingOpacity) && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-zinc-900/95 border border-zinc-700/80 text-xs font-mono font-medium text-zinc-100 shadow-2xl whitespace-nowrap pointer-events-none z-30 animate-in fade-in zoom-in-95 duration-100">
            {opacityPercentage}%
          </div>
        )}

        <div
          ref={opacityTrackRef}
          role="slider"
          aria-label="Brush Opacity"
          aria-valuenow={opacityPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDraggingOpacity(true);
            handleOpacityPointer(e.clientY);
          }}
          onPointerMove={(e) => {
            if (isDraggingOpacity) {
              handleOpacityPointer(e.clientY);
            }
          }}
          onPointerUp={(e) => {
            setIsDraggingOpacity(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            setIsDraggingOpacity(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerEnter={() => setShowOpacityTooltip(true)}
          onPointerLeave={() => {
            if (!isDraggingOpacity) setShowOpacityTooltip(false);
          }}
          className="relative w-9 h-28 flex items-center justify-center cursor-pointer touch-none"
          title={`Brush Opacity: ${opacityPercentage}%`}
        >
          {/* Visual Track Capsule (16px wide, 100px tall) */}
          <div className="w-4 h-full rounded-full bg-zinc-850 ring-1 ring-inset ring-white/10 relative overflow-hidden flex flex-col justify-end shadow-inner">
            {/* Active Level Fill rising from the bottom */}
            <div
              className={`w-full rounded-full ${
                isDraggingOpacity ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" : "bg-zinc-200"
              }`}
              style={{
                height: `${Math.max(6, opacityRatio * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Separator Line */}
      <div className="w-5 h-px bg-zinc-800/80 my-0.5" />

      {/* 4. Undo & Redo Quick Buttons */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 active:scale-95 transition-all"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 active:scale-95 transition-all"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>
    </motion.aside>
  );
};
