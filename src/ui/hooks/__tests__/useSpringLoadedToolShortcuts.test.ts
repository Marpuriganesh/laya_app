import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateShortcutKeyDown,
  evaluateShortcutKeyUp,
  isEditableElement,
  TOOL_SHORTCUT_KEY_MAP,
  type KeyboardEventLike,
} from "../useSpringLoadedToolShortcuts";
import { SpringLoadedTracker } from "@/engine/shortcuts/spring_loaded_tracker";

describe("evaluateShortcutKeyDown & evaluateShortcutKeyUp", () => {
  let tracker: SpringLoadedTracker;

  beforeEach(() => {
    tracker = new SpringLoadedTracker(250);
  });

  it("maps correct keys to active tools", () => {
    expect(TOOL_SHORTCUT_KEY_MAP.z).toBe("zoom");
    expect(TOOL_SHORTCUT_KEY_MAP.b).toBe("brush");
    expect(TOOL_SHORTCUT_KEY_MAP.e).toBe("eraser");
    expect(TOOL_SHORTCUT_KEY_MAP.s).toBe("smudge");
    expect(TOOL_SHORTCUT_KEY_MAP.h).toBe("hand");
  });

  it("ignores keydown when Cmd or Ctrl or Alt is pressed", () => {
    const event: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: true, // Cmd+Z (Undo)
      altKey: false,
    };
    const result = evaluateShortcutKeyDown(event, tracker, "brush", 1000);
    expect(result.handled).toBe(false);
    expect(result.nextTool).toBeNull();
  });

  it("ignores keydown when target is an input or textarea element", () => {
    const inputMock = { tagName: "INPUT" } as unknown as HTMLElement;
    const event: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: inputMock,
    };
    const result = evaluateShortcutKeyDown(event, tracker, "brush", 1000);
    expect(result.handled).toBe(false);
    expect(result.nextTool).toBeNull();
  });

  it("handles tap (< 250ms): keydown switches to zoom, keyup keeps zoom", () => {
    const downEvent: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    const downResult = evaluateShortcutKeyDown(downEvent, tracker, "brush", 1000);
    expect(downResult.handled).toBe(true);
    expect(downResult.nextTool).toBe("zoom");

    const upEvent: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    const upResult = evaluateShortcutKeyUp(upEvent, tracker, 1100); // 100ms
    expect(upResult.handled).toBe(true);
    expect(upResult.nextTool).toBeNull(); // Keep zoom, no revert!
  });

  it("handles hold (>= 250ms): keydown switches to zoom, keyup reverts to brush", () => {
    const downEvent: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    const downResult = evaluateShortcutKeyDown(downEvent, tracker, "brush", 1000);
    expect(downResult.handled).toBe(true);
    expect(downResult.nextTool).toBe("zoom");

    const upEvent: KeyboardEventLike = {
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    const upResult = evaluateShortcutKeyUp(upEvent, tracker, 1500); // 500ms
    expect(upResult.handled).toBe(true);
    expect(upResult.nextTool).toBe("brush"); // Reverted to brush!
  });

  it("identifies editable elements correctly", () => {
    expect(isEditableElement(null)).toBe(false);
    expect(isEditableElement({ tagName: "DIV" } as unknown as HTMLElement)).toBe(false);
    expect(isEditableElement({ tagName: "INPUT" } as unknown as HTMLElement)).toBe(true);
    expect(isEditableElement({ tagName: "TEXTAREA" } as unknown as HTMLElement)).toBe(true);
    expect(isEditableElement({ tagName: "SELECT" } as unknown as HTMLElement)).toBe(true);
    expect(isEditableElement({ tagName: "DIV", isContentEditable: true } as unknown as HTMLElement)).toBe(true);
  });
});
