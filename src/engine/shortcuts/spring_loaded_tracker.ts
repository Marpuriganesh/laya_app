import type { ActiveTool } from "@/types/ui";

/**
 * State record representing an ongoing key press being tracked for hold vs tap determination.
 */
export interface ActiveKeyHold {
  readonly key: string;
  readonly targetTool: ActiveTool;
  readonly previousTool: ActiveTool;
  readonly pressedTimestamp: number;
}

export interface KeyDownResult {
  readonly nextTool: ActiveTool;
  readonly isTransient: boolean;
  readonly changed: boolean;
}

export interface KeyUpResult {
  readonly nextTool: ActiveTool;
  readonly wasTransientReverted: boolean;
  readonly changed: boolean;
}

/**
 * Pure state tracker managing spring-loaded (sticky/transient) keyboard shortcut tool activations.
 *
 * Rules:
 * 1. Short Tap (< thresholdMs): Commits permanent tool change.
 * 2. Long Hold (>= thresholdMs): Reverts back to previous tool when key is released.
 * 3. OS Key-Repeat: Subsequent repeat keydown events do not reset initial press timestamp.
 * 4. Window Blur / Cancel: Safely restores previous active tool.
 */
export class SpringLoadedTracker {
  private activeHold: ActiveKeyHold | null = null;
  private holdThresholdMs: number;

  constructor(holdThresholdMs = 250) {
    this.holdThresholdMs = Math.max(50, Math.min(2000, holdThresholdMs));
  }

  public get threshold(): number {
    return this.holdThresholdMs;
  }

  public setThreshold(ms: number): void {
    this.holdThresholdMs = Math.max(50, Math.min(2000, ms));
  }

  public get currentHold(): ActiveKeyHold | null {
    return this.activeHold;
  }

  /**
   * Processes a keydown event for a shortcut bound to a target tool.
   *
   * @param key Normalized key identifier (e.g. "z", "b", "e", "s", "h")
   * @param targetTool The tool associated with this key
   * @param currentTool The currently active tool before this keydown
   * @param timestamp Monotonic millisecond timestamp (e.g. performance.now())
   */
  public onKeyDown(
    key: string,
    targetTool: ActiveTool,
    currentTool: ActiveTool,
    timestamp: number
  ): KeyDownResult {
    const normalizedKey = key.toLowerCase();

    // Ignore OS key-repeat events while the key is already being held
    if (this.activeHold && this.activeHold.key === normalizedKey) {
      return {
        nextTool: this.activeHold.targetTool,
        isTransient: true,
        changed: false,
      };
    }

    // New key press: remember current tool and record start timestamp
    this.activeHold = {
      key: normalizedKey,
      targetTool,
      previousTool: currentTool,
      pressedTimestamp: timestamp,
    };

    return {
      nextTool: targetTool,
      isTransient: true,
      changed: targetTool !== currentTool,
    };
  }

  /**
   * Processes a keyup event for a released key.
   *
   * @param key Normalized key identifier
   * @param timestamp Monotonic millisecond timestamp
   */
  public onKeyUp(key: string, timestamp: number): KeyUpResult | null {
    if (!this.activeHold) return null;

    const normalizedKey = key.toLowerCase();
    if (this.activeHold.key !== normalizedKey) {
      return null;
    }

    const elapsed = Math.max(0, timestamp - this.activeHold.pressedTimestamp);
    const wasLongHold = elapsed >= this.holdThresholdMs;

    if (wasLongHold) {
      // Revert back to previous tool before hold started
      const previous = this.activeHold.previousTool;
      this.activeHold = null;
      return {
        nextTool: previous,
        wasTransientReverted: true,
        changed: true,
      };
    }

    // Short tap: keep target tool permanently
    const permanent = this.activeHold.targetTool;
    this.activeHold = null;
    return {
      nextTool: permanent,
      wasTransientReverted: false,
      changed: false,
    };
  }

  /**
   * Cleanly cancels any ongoing hold on window blur or escape.
   */
  public cancel(): { nextTool: ActiveTool; wasTransientReverted: boolean } | null {
    if (!this.activeHold) return null;

    const previous = this.activeHold.previousTool;
    this.activeHold = null;
    return {
      nextTool: previous,
      wasTransientReverted: true,
    };
  }
}
