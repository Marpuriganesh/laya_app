import { useState, type FC, type ReactNode } from "react";
import { Pin, PinOff, Minimize2, X, GripHorizontal } from "lucide-react";
import { toggleWindowAlwaysOnTop } from "@/ui/window/window_manager";
import { useWindowKeyShortcuts } from "@/ui/hooks/useWindowKeyShortcuts";

export interface DetachedWindowLayoutProps {
  title: string;
  icon?: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  onDock: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Procreate/Krita-styled window frame for detached tool palettes.
 * Features native window dragging via data-tauri-drag-region,
 * pin-on-top toggle, seamless re-attachment, and dark glass styling.
 */
export const DetachedWindowLayout: FC<DetachedWindowLayoutProps> = ({
  title,
  icon,
  defaultWidth,
  defaultHeight,
  onDock,
  onClose,
  children,
}) => {
  const [isPinned, setIsPinned] = useState(false);

  // Keyboard window shortcuts (Cmd+M to minimize, Cmd+W to close)
  useWindowKeyShortcuts({
    onClose,
    enableMinimize: true,
  });

  const handleTogglePin = async () => {
    const nextPinned = !isPinned;
    await toggleWindowAlwaysOnTop(nextPinned);
    setIsPinned(nextPinned);
  };

  const handleHeaderDoubleClick = async (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea")) return;

    // Tool palettes are constrained utility windows; double-click resets to default dimensions
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri && defaultWidth && defaultHeight) {
      try {
        const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setSize(new LogicalSize(defaultWidth, defaultHeight));
      } catch (err) {
        console.error("Failed to reset detached window size:", err);
      }
    }
  };

  return (
    <div className="h-screen w-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden rounded-xl border border-transparent select-none transition-colors duration-150">
      {/* Draggable Title Bar */}
      <header
        data-tauri-drag-region
        onDoubleClick={handleHeaderDoubleClick}
        className="h-11 px-3.5 bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between shrink-0 select-none cursor-grab active:cursor-grabbing"
        title="Double-click to reset size • Drag to move window across monitors"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          {icon}
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide">
            {title}
          </span>
        </div>

        {/* Window Control Buttons */}
        <div className="flex items-center gap-1">
          {/* Always On Top (Pin) */}
          <button
            type="button"
            onClick={handleTogglePin}
            title={isPinned ? "Unpin window (Always on top)" : "Pin window on top"}
            aria-label={isPinned ? "Unpin window" : "Pin window on top"}
            className={`p-1.5 rounded-md transition-colors ${
              isPinned
                ? "text-blue-500 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80"
            }`}
          >
            {isPinned ? (
              <PinOff className="w-3.5 h-3.5" />
            ) : (
              <Pin className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Dock / Re-attach to Main Canvas */}
          <button
            type="button"
            onClick={onDock}
            title="Dock back to main application window"
            aria-label="Dock back to main application window"
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Window */}
          <button
            type="button"
            onClick={onClose}
            title="Close detached palette"
            aria-label="Close detached palette"
            className="p-1.5 rounded-md text-zinc-500 hover:text-red-500 hover:bg-red-500/10 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Detached Palette Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white/95 dark:bg-zinc-900/95 flex flex-col transition-colors">
        {children}
      </main>
    </div>
  );
};
