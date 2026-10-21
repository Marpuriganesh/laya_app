import { useEffect, useCallback } from "react";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import type { PopoverType } from "@/types/ui";

export interface QueryableElement {
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface QueryableDocument {
  querySelectorAll(
    selector: string
  ): NodeListOf<Element> | QueryableElement[] | Iterable<QueryableElement>;
}

/**
 * Collects screen bounding rectangles for all active interactive UI elements
 * (elements marked with [data-native-ui], [role="dialog"], or [data-state="open"]).
 */
export function collectNativeUiRects(
  rootDocument?: QueryableDocument | null
): Array<[number, number, number, number]> {
  const doc =
    rootDocument ??
    (typeof document !== "undefined"
      ? (document as unknown as QueryableDocument)
      : null);
  if (!doc) return [];

  const selector = '[data-native-ui], [role="dialog"], [data-state="open"]';
  const elements = doc.querySelectorAll(selector);
  const rects: Array<[number, number, number, number]> = [];

  Array.from(elements).forEach((el: unknown) => {
    const queryable = el as QueryableElement;
    if (typeof queryable.getBoundingClientRect === "function") {
      const rect = queryable.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rects.push([rect.left, rect.top, rect.width, rect.height]);
      }
    }
  });

  return rects;
}

/**
 * React hook that coordinates synchronization of interactive UI element bounding boxes
 * with the native macOS AppKit event monitor.
 * Ensures clicks on toolbars, sidebar rails, floating zoom pills, popovers, and dialogs
 * pass directly to WKWebView instead of triggering drawing strokes in the native engine.
 */
export function useNativeUiRectsSync(activePopover: PopoverType): void {
  const isTauriApp =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const syncUiRects = useCallback(() => {
    if (!isTauriApp) return;
    const rects = collectNativeUiRects();
    globalRustBrushBridge.setUiBlockingRects(rects);
  }, [isTauriApp]);

  useEffect(() => {
    // Immediate sync and follow-up syncs after animations/layout settle
    syncUiRects();
    const timer1 = setTimeout(syncUiRects, 30);
    const timer2 = setTimeout(syncUiRects, 180);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [activePopover, syncUiRects]);

  useEffect(() => {
    if (!isTauriApp || typeof window === "undefined") return;

    let rafId: number | null = null;
    const debouncedSync = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        syncUiRects();
        rafId = null;
      });
    };

    const handlePointerRelease = () => {
      syncUiRects();
      // Sync again after panel drag release finishes settling
      setTimeout(syncUiRects, 35);
    };

    window.addEventListener("resize", debouncedSync);
    window.addEventListener("pointerup", handlePointerRelease, { capture: true });
    window.addEventListener("pointercancel", handlePointerRelease, { capture: true });

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && document?.body) {
      observer = new MutationObserver(() => {
        debouncedSync();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "data-state", "hidden"],
      });
    }

    // Initial sync on mount
    syncUiRects();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", debouncedSync);
      window.removeEventListener("pointerup", handlePointerRelease, { capture: true });
      window.removeEventListener("pointercancel", handlePointerRelease, { capture: true });
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isTauriApp, syncUiRects]);
}
