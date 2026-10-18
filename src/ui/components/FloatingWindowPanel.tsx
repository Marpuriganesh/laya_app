import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type FC,
} from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, ArrowDownToLine, GripHorizontal } from "lucide-react";
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
 * Reusable, accessible Floating Window Panel with fluid dragging,
 * soft magnetic edge resistance, navbar collision barrier, double-click reset,
 * and Tier-2 Multi-Monitor pop-out portal support.
 */
export const FloatingWindowPanel: FC<FloatingWindowPanelProps> = ({
  title,
  icon,
  isOpen,
  onClose,
  width = 320,
  height = 520,
  initialOffset = { x: 0, y: 0 },
  anchorClassName = "fixed right-4 top-16",
  zIndex = 40,
  allowPopout = true,
  headerActions,
  children,
}) => {
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const externalWindowRef = useRef<Window | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const {
    headerProps,
    windowStyle,
    resetPosition,
  } = useDraggableWindow({
    initialOffset,
    windowWidth: width,
    windowHeight: height,
    margin: 16,
    magneticBand: 24,
    snapDistance: 45,
  });

  // Handle Tear-Off Popout Window (Tier 2 Multi-Monitor support)
  const handleTogglePopout = () => {
    if (isPoppedOut && externalWindowRef.current) {
      externalWindowRef.current.close();
      return;
    }

    const popupWindow = window.open(
      "",
      `popout_${title.replace(/\s+/g, "_")}`,
      `width=${width},height=${typeof height === "function" ? height() : height},menubar=no,toolbar=no,location=no,status=no`
    );

    if (!popupWindow) {
      console.warn("Popout window was blocked by browser popup blocker.");
      return;
    }

    // Set page title and dark theme
    popupWindow.document.title = `${title} — Digital Studio`;
    popupWindow.document.body.className = "bg-zinc-950 text-zinc-100 font-sans select-none m-0 p-3 overflow-hidden";

    // Copy application stylesheets into external window
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((styleElement) => {
      popupWindow.document.head.appendChild(styleElement.cloneNode(true));
    });

    // Create container inside external window
    const container = popupWindow.document.createElement("div");
    container.className = "h-full w-full flex flex-col rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden";
    popupWindow.document.body.appendChild(container);

    setPortalContainer(container);
    externalWindowRef.current = popupWindow;
    setIsPoppedOut(true);

    // Watch for external window close
    const checkTimer = window.setInterval(() => {
      if (popupWindow.closed) {
        window.clearInterval(checkTimer);
        setIsPoppedOut(false);
        setPortalContainer(null);
        externalWindowRef.current = null;
        resetPosition();
      }
    }, 500);
  };

  // Clean up external window on unmount or when closed
  useEffect(() => {
    return () => {
      if (externalWindowRef.current && !externalWindowRef.current.closed) {
        externalWindowRef.current.close();
      }
    };
  }, []);

  if (!isOpen) return null;

  // If detached to secondary monitor via React Portal
  if (isPoppedOut && portalContainer) {
    return (
      <>
        {/* Placeholder in main window with Dock button */}
        <div
          className={`${anchorClassName} rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-2xl p-4 flex flex-col items-center justify-center text-center gap-3 backdrop-blur-md animate-in fade-in`}
          style={{ width: `${width}px`, zIndex, ...windowStyle }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            {icon}
            <span>{title} (Detached)</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Panel is open on secondary display.
          </p>
          <button
            type="button"
            onClick={handleTogglePopout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Dock Back Here</span>
          </button>
        </div>

        {/* Portal into secondary native monitor window */}
        {createPortal(
          <div className="h-full flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950/40 select-none">
              <div className="flex items-center gap-2">
                {icon}
                <span className="text-xs font-semibold text-zinc-200">{title}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleTogglePopout}
                  title="Dock back to main canvas"
                  aria-label="Dock back"
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </div>,
          portalContainer
        )}
      </>
    );
  }

  // Standard in-canvas floating window
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

          {/* Tear-off Pop-out to Secondary Monitor (Tier 2) */}
          {allowPopout && (
            <button
              type="button"
              onClick={handleTogglePopout}
              title="Pop out to separate window (Secondary Monitor)"
              aria-label="Pop out to secondary monitor"
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

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
