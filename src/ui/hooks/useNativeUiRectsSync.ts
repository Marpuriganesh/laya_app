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

export const NATIVE_UI_SELECTOR =
  '[data-native-ui], [role="dialog"], [role="menu"], [role="listbox"], [role="combobox"], [role="alertdialog"], [data-state="open"], dialog, .native-ui-block, .floating-panel';

/**
 * Collects screen bounding rectangles for all active interactive UI elements
 * (elements marked with [data-native-ui], [role="dialog"], [role="menu"], etc.).
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

  const elements = doc.querySelectorAll(NATIVE_UI_SELECTOR);
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
 * Programmatically forces an immediate synchronization of UI blocking rectangles
 * with the native desktop overlay (useful when opening menus, popovers, or toggling modals).
 */
export function triggerNativeUiRectsSync(): void {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const rects = collectNativeUiRects();
    globalRustBrushBridge.setUiBlockingRects(rects);
  }
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
    const immediateAndDebouncedSync = () => {
      syncUiRects();
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
      setTimeout(syncUiRects, 120);
    };

    // Continuous rAF synchronization while dragging or resizing a window/slider (buttons pressed)
    const handlePointerMove = (e: globalThis.PointerEvent) => {
      if (e.buttons !== 0) {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            syncUiRects();
            rafId = null;
          });
        }
      }
    };

    window.addEventListener("resize", immediateAndDebouncedSync);
    window.addEventListener("native-ui-sync", syncUiRects);
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: true });
    window.addEventListener("pointerup", handlePointerRelease, { capture: true });
    window.addEventListener("pointercancel", handlePointerRelease, { capture: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && document?.body) {
      resizeObserver = new ResizeObserver(() => {
        immediateAndDebouncedSync();
      });
      resizeObserver.observe(document.body);
      const elements = document.querySelectorAll(NATIVE_UI_SELECTOR);
      elements.forEach((el) => resizeObserver?.observe(el));
    }

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && document?.body) {
      observer = new MutationObserver((mutations) => {
        immediateAndDebouncedSync();
        // If new UI panels are mounted, attach ResizeObserver to them
        if (resizeObserver) {
          for (const m of mutations) {
            for (let i = 0; i < m.addedNodes.length; i++) {
              const node = m.addedNodes[i];
              if (node instanceof Element) {
                if (node.matches?.(NATIVE_UI_SELECTOR)) {
                  resizeObserver.observe(node);
                }
                const subElements = node.querySelectorAll?.(NATIVE_UI_SELECTOR);
                subElements?.forEach((sub) => resizeObserver?.observe(sub));
              }
            }
          }
        }
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
      window.removeEventListener("resize", immediateAndDebouncedSync);
      window.removeEventListener("native-ui-sync", syncUiRects);
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerRelease, { capture: true });
      window.removeEventListener("pointercancel", handlePointerRelease, { capture: true });
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, [isTauriApp, syncUiRects]);
}
