import type { ReactNode, FC } from "react";
import { X, GripHorizontal } from "lucide-react";
import { useDraggableWindow } from "@/ui/hooks/useDraggableWindow";

export interface FloatingWindowPanelProps {
  id?: string;
  title: string;
  icon?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  height?: number | (() => number);
  initialOffset?: { x: number; y: number };
  anchorClassName?: string;
  zIndex?: number;
  allowPopout?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}

/**
 * Reusable Floating Window Panel
 * Fluid dragging, soft magnetic edge boundaries, navbar collision barrier,
 * and double-click to reset position.
 */
export const FloatingWindowPanel: FC<FloatingWindowPanelProps> = ({
  title,
  icon,
  isOpen,
  onClose,
  width = 320,
  height = 480,
  initialOffset = { x: 0, y: 0 },
  anchorClassName = "fixed right-4 top-16",
  zIndex = 40,
  headerActions,
  children,
}) => {
  const { headerProps, windowStyle } = useDraggableWindow({
    initialOffset,
    windowWidth: width,
    windowHeight: height,
    margin: 16,
    magneticBand: 24,
    snapDistance: 45,
  });

  if (!isOpen) return null;

  return (
    <div
      className={`${anchorClassName} rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-100`}
      style={{
        width: `${width}px`,
        zIndex,
        ...windowStyle,
      }}
    >
      {/* Draggable Header */}
      <div
        {...headerProps}
        title="Drag to reposition • Double-click to reset"
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 cursor-grab active:cursor-grabbing bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors group"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
          {icon}
          <span className="text-xs font-semibold text-zinc-100">{title}</span>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1">
          {headerActions}

          {/* Close Window */}
          <button
            type="button"
            onClick={onClose}
            title="Close panel"
            aria-label={`Close ${title}`}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Panel Content Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
};
