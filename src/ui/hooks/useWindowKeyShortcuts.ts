import { useEffect } from "react";

export interface WindowKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  preventDefault: () => void;
}

export interface WindowKeyActionHandlers {
  onMinimize?: () => void;
  onClose?: () => void;
  enableMinimize?: boolean;
}

/**
 * Pure evaluation function for window keyboard shortcuts.
 * Returns true if an action was handled and prevented default.
 */
export function handleWindowKeyEvent(
  e: WindowKeyEventLike,
  handlers: WindowKeyActionHandlers
): boolean {
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (!isCmdOrCtrl) return false;

  const key = e.key.toLowerCase();

  // Cmd+M / Ctrl+M: Minimize
  if (handlers.enableMinimize !== false && key === "m") {
    e.preventDefault();
    handlers.onMinimize?.();
    return true;
  }

  // Cmd+W / Ctrl+W: Close / Dock
  if (handlers.onClose && key === "w") {
    e.preventDefault();
    handlers.onClose();
    return true;
  }

  return false;
}

export interface WindowKeyShortcutsOptions {
  onClose?: () => void;
  enableMinimize?: boolean;
}

/**
 * React hook handling cross-platform window management shortcuts:
 * - Cmd+M (macOS) / Ctrl+M (Windows/Linux): Minimize current window.
 * - Cmd+W (macOS) / Ctrl+W (Windows/Linux): Close / dock window (if onClose provided).
 */
export function useWindowKeyShortcuts(options: WindowKeyShortcutsOptions = {}): void {
  const { onClose, enableMinimize = true } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      handleWindowKeyEvent(e, {
        enableMinimize,
        onClose,
        onMinimize: async () => {
          const isTauri = "__TAURI_INTERNALS__" in window;
          if (isTauri) {
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              await getCurrentWindow().minimize();
            } catch (err) {
              console.error("Failed to minimize window:", err);
            }
          }
        },
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enableMinimize, onClose]);
}
