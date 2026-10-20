import { useState, type FC, type ReactNode } from "react";
import { Pin, PinOff, Minimize2, X, GripHorizontal } from "lucide-react";
import { toggleWindowAlwaysOnTop } from "@/ui/window/window_manager";

export interface DetachedWindowLayoutProps {
  title: string;
  icon?: ReactNode;
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
  onDock,
  onClose,
  children,
}) => {
  const [isPinned, setIsPinned] = useState(false);

  const handleTogglePin = async () => {
    const nextPinned = !isPinned;
    await toggleWindowAlwaysOnTop(nextPinned);
    setIsPinned(nextPinned);
  };

  return (
    <div className="dark h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 shadow-2xl select-none">
      {/* Draggable Title Bar */}
      <header
        data-tauri-drag-region
        className="h-11 px-3.5 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between shrink-0 select-none cursor-grab active:cursor-grabbing backdrop-blur-md"
        title="Drag header to move window across monitors"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-500" />
          {icon}
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">
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
                ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
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
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Window */}
          <button
            type="button"
            onClick={onClose}
            title="Close detached palette"
            aria-label="Close detached palette"
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Detached Palette Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950 flex flex-col">
        {children}
      </main>
    </div>
  );
};
