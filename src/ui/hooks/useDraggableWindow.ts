import { useState, useRef, useEffect, useCallback, type PointerEvent, type MouseEvent, type CSSProperties } from "react";

/**
 * Pure boundary box descriptor for window positioning.
 */
export interface WindowBoundaries {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Calculates viewport boundary limits for floating windows.
 * Enforces strict top navbar barrier (minY = 0 keeps window >= navbarOffset).
 */
export function calculateWindowBoundaries(
  viewportWidth: number,
  viewportHeight: number,
  windowWidth: number,
  windowHeight: number,
  navbarOffset = 64,
  margin = 16
): WindowBoundaries {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const safeWindowWidth = Math.max(0, windowWidth);
  const safeWindowHeight = Math.max(0, windowHeight);

  // Popovers are anchored at right: (right-4 = 16px from right edge).
  // Translating X to the left requires negative values.
  const rawMinX = -(Math.max(0, safeViewportWidth - safeWindowWidth - margin * 2));
  const minX = rawMinX === 0 ? 0 : rawMinX;
  const maxX = 0;
  const minY = 0; // Strictly below navbar (64px from top, below 56px navbar)
  const maxY = Math.max(0, safeViewportHeight - navbarOffset - safeWindowHeight - margin);

  return { minX, maxX, minY, maxY };
}

/**
 * Calculates soft magnetic resistance near boundaries.
 * In a small band near the edges, movement is dampened by a resistance factor (default 0.4x)
 * so dragging feels tactile and fluid rather than hitting an abrupt hard wall.
 */
export function applyMagneticResistance(
  rawValue: number,
  minBound: number,
  maxBound: number,
  magneticBand = 24,
  resistanceFactor = 0.4
): number {
  let softValue = rawValue;

  // Near max bound (e.g. right edge X = 0)
  if (Math.abs(rawValue - maxBound) < magneticBand) {
    softValue = maxBound + (rawValue - maxBound) * resistanceFactor;
  }
  // Near min bound (e.g. left edge X = minX)
  else if (Math.abs(rawValue - minBound) < magneticBand) {
    softValue = minBound + (rawValue - minBound) * resistanceFactor;
  }

  return Math.max(minBound, Math.min(maxBound, softValue));
}

/**
 * Calculates snap targets on pointer release.
 * Prioritizes returning to the default home dock if within 1.5x snap distance,
 * otherwise softly snaps to screen edge margins (left, right, top navbar barrier, bottom).
 */
export function calculateSnappedPosition(
  currentX: number,
  currentY: number,
  homeX: number,
  homeY: number,
  boundaries: WindowBoundaries,
  snapDistance = 45
): { snappedX: number; snappedY: number } {
  let targetX = currentX;
  let targetY = currentY;

  // 1. Home snap: if near default position, softly glide to home dock
  const distanceToHome = Math.hypot(currentX - homeX, currentY - homeY);
  if (distanceToHome < snapDistance * 1.5) {
    return { snappedX: homeX, snappedY: homeY };
  }

  // 2. Right edge margin snap (x = maxX = 0)
  if (Math.abs(currentX - boundaries.maxX) < snapDistance) {
    targetX = boundaries.maxX;
  }
  // 3. Left edge margin snap (x = minX)
  else if (Math.abs(currentX - boundaries.minX) < snapDistance) {
    targetX = boundaries.minX;
  }

  // 4. Top margin snap (just below navbar, y = minY = 0)
  if (Math.abs(currentY - boundaries.minY) < snapDistance) {
    targetY = boundaries.minY;
  }
  // 5. Bottom margin snap (y = maxY)
  else if (Math.abs(currentY - boundaries.maxY) < snapDistance) {
    targetY = boundaries.maxY;
  }

  return { snappedX: targetX, snappedY: targetY };
}

export interface UseDraggableWindowOptions {
  /** Initial offset { x, y } relative to right-4 top-16 anchor. Defaults to { x: 0, y: 0 } */
  initialOffset?: { x: number; y: number };
  /** Width of the window in pixels */
  windowWidth: number;
  /** Height of the window in pixels, or a dynamic getter function */
  windowHeight: number | (() => number);
  /** Minimum Y offset in px. Defaults to 0 (keeps window >= 64px from top, below 56px navbar) */
  minY?: number;
  /** Viewport margin in px. Defaults to 16 */
  margin?: number;
  /** Distance in px to trigger soft magnetic drag damping. Defaults to 24 */
  magneticBand?: number;
  /** Snap attraction distance on pointer release. Defaults to 45 */
  snapDistance?: number;
}

export interface UseDraggableWindowResult {
  /** Current window translation offset */
  position: { x: number; y: number };
  /** True while the pointer is held and dragging */
  isDragging: boolean;
  /** Pointer and mouse handlers to attach to the window drag header */
  headerProps: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onDoubleClick: (event: MouseEvent<HTMLElement>) => void;
  };
  /** Pre-composed CSS transform and transition style for smooth motion */
  windowStyle: CSSProperties;
  /** Reset window position back to default initialOffset */
  resetPosition: () => void;
  /** Programmatic position setter */
  setPosition: (position: { x: number; y: number }) => void;
}

/**
 * Reusable React hook for floating windows with soft magnetic resistance,
 * navbar barrier collision avoidance, smooth release-to-snap, and multi-monitor resize recovery.
 */
export function useDraggableWindow(options: UseDraggableWindowOptions): UseDraggableWindowResult {
  const {
    initialOffset = { x: 0, y: 0 },
    windowWidth,
    windowHeight,
    margin = 16,
    magneticBand = 24,
    snapDistance = 45,
  } = options;

  const [position, setPosition] = useState<{ x: number; y: number }>(initialOffset);
  const [isDragging, setIsDragging] = useState(false);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, startX: 0, startY: 0 });

  const getEffectiveHeight = useCallback((): number => {
    return typeof windowHeight === "function" ? windowHeight() : windowHeight;
  }, [windowHeight]);

  // Compute live boundaries based on current viewport
  const getBoundaries = useCallback((): WindowBoundaries => {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 1080;
    return calculateWindowBoundaries(
      viewportWidth,
      viewportHeight,
      windowWidth,
      getEffectiveHeight(),
      64,
      margin
    );
  }, [windowWidth, getEffectiveHeight, margin]);

  // Multi-Monitor / Viewport Resize Auto-Recovery:
  // When window moves to a smaller screen or display resolution changes, clamp position smoothly.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const bounds = getBoundaries();
      setPosition((prevPosition) => {
        const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, prevPosition.x));
        const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, prevPosition.y));
        if (clampedX === prevPosition.x && clampedY === prevPosition.y) {
          return prevPosition;
        }
        return { x: clampedX, y: clampedY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getBoundaries]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // Ignore interactive controls inside header (buttons, inputs, selects)
    const targetElement = event.target as HTMLElement | null;
    if (targetElement?.closest("button, input, select, textarea, [data-drag-ignore='true']")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    setIsDragging(true);

    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
  }, [position]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!isDraggingRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.pointerX;
    const deltaY = event.clientY - dragStartRef.current.pointerY;

    const rawX = dragStartRef.current.startX + deltaX;
    const rawY = dragStartRef.current.startY + deltaY;

    const bounds = getBoundaries();

    const softX = applyMagneticResistance(rawX, bounds.minX, bounds.maxX, magneticBand, 0.4);
    const softY = applyMagneticResistance(rawY, bounds.minY, bounds.maxY, magneticBand, 0.4);

    setPosition({ x: softX, y: softY });
  }, [getBoundaries, magneticBand]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const bounds = getBoundaries();
    const snapped = calculateSnappedPosition(
      position.x,
      position.y,
      initialOffset.x,
      initialOffset.y,
      bounds,
      snapDistance
    );

    if (snapped.snappedX !== position.x || snapped.snappedY !== position.y) {
      setPosition({ x: snapped.snappedX, y: snapped.snappedY });
    }
  }, [position, initialOffset, getBoundaries, snapDistance]);

  const handlePointerCancel = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    // Reset to default dock on header double-click
    const targetElement = event.target as HTMLElement | null;
    if (targetElement?.closest("button, input, select, textarea")) {
      return;
    }
    setPosition(initialOffset);
  }, [initialOffset]);

  const resetPosition = useCallback(() => {
    setPosition(initialOffset);
  }, [initialOffset]);

  const windowStyle: CSSProperties = {
    translate: `${position.x}px ${position.y}px`,
    transition: isDragging ? "none" : "translate 0.36s cubic-bezier(0.16, 1, 0.3, 1)",
  };

  return {
    position,
    isDragging,
    headerProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onDoubleClick: handleDoubleClick,
    },
    windowStyle,
    resetPosition,
    setPosition,
  };
}
