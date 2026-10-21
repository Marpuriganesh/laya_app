import { useEffect, useRef } from "react";
import type { ActiveTool } from "@/types/ui";
import { SpringLoadedTracker } from "@/engine/shortcuts/spring_loaded_tracker";
import { useDocumentStore } from "./useDocumentStore";

export const TOOL_SHORTCUT_KEY_MAP: Record<string, ActiveTool> = {
  z: "zoom",
  b: "brush",
  e: "eraser",
  s: "smudge",
  h: "hand",
};

export interface KeyboardEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target?: EventTarget | null;
  preventDefault?: () => void;
}

export function isEditableElement(target?: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as HTMLElement;
  const tagName = (element.tagName || "").toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return Boolean(element.isContentEditable);
}

/**
 * Pure evaluation function for spring-loaded tool shortcut keydown events.
 */
export function evaluateShortcutKeyDown(
  event: KeyboardEventLike,
  tracker: SpringLoadedTracker,
  currentTool: ActiveTool,
  timestamp: number
): { handled: boolean; nextTool: ActiveTool | null } {
  // Never intercept when modifiers are active (e.g. Ctrl+Z / Cmd+Z is Undo, not Zoom)
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { handled: false, nextTool: null };
  }

  // Never intercept when user is typing in a text field
  if (isEditableElement(event.target)) {
    return { handled: false, nextTool: null };
  }

  const key = event.key.toLowerCase();
  const targetTool = TOOL_SHORTCUT_KEY_MAP[key];
  if (!targetTool) {
    return { handled: false, nextTool: null };
  }

  event.preventDefault?.();
  const result = tracker.onKeyDown(key, targetTool, currentTool, timestamp);
  return {
    handled: true,
    nextTool: result.changed ? result.nextTool : null,
  };
}

/**
 * Pure evaluation function for spring-loaded tool shortcut keyup events.
 */
export function evaluateShortcutKeyUp(
  event: KeyboardEventLike,
  tracker: SpringLoadedTracker,
  timestamp: number
): { handled: boolean; nextTool: ActiveTool | null } {
  const key = event.key.toLowerCase();
  const result = tracker.onKeyUp(key, timestamp);
  if (!result) {
    return { handled: false, nextTool: null };
  }

  event.preventDefault?.();
  return {
    handled: true,
    nextTool: result.wasTransientReverted ? result.nextTool : null,
  };
}

/**
 * React hook that binds the spring-loaded shortcut engine to the browser window.
 *
 * Behaviors:
 * - Tap (< threshold, default 250ms): Permanently switches active tool.
 * - Hold (>= threshold): Temporarily switches active tool; reverts to previous tool on key release.
 */
export function useSpringLoadedToolShortcuts(): void {
  const { activeTool, setActiveTool, holdThresholdMs } = useDocumentStore();
  const trackerRef = useRef<SpringLoadedTracker | null>(null);
  const activeToolRef = useRef<ActiveTool>(activeTool);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  if (!trackerRef.current) {
    trackerRef.current = new SpringLoadedTracker(holdThresholdMs);
  }

  useEffect(() => {
    if (trackerRef.current) {
      trackerRef.current.setThreshold(holdThresholdMs);
    }
  }, [holdThresholdMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tracker = trackerRef.current!;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const { handled, nextTool } = evaluateShortcutKeyDown(
        e,
        tracker,
        activeToolRef.current,
        now
      );
      if (handled && nextTool) {
        setActiveTool(nextTool);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const now = performance.now();
      const { handled, nextTool } = evaluateShortcutKeyUp(e, tracker, now);
      if (handled && nextTool) {
        setActiveTool(nextTool);
      }
    };

    const handleBlur = () => {
      const result = tracker.cancel();
      if (result) {
        setActiveTool(result.nextTool);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [setActiveTool]);
}
