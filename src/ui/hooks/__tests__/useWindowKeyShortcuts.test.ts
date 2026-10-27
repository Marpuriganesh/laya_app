import { describe, it, expect, vi } from "vitest";
import { handleWindowKeyEvent, type WindowKeyEventLike } from "../useWindowKeyShortcuts";

function createMockEvent(overrides: Partial<WindowKeyEventLike> = {}): WindowKeyEventLike {
  return {
    key: "m",
    metaKey: true,
    ctrlKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe("handleWindowKeyEvent", () => {
  it("triggers minimize on Cmd+M", () => {
    const onMinimize = vi.fn();
    const event = createMockEvent({ key: "m", metaKey: true });
    const handled = handleWindowKeyEvent(event, { onMinimize, enableMinimize: true });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("triggers minimize on Ctrl+M (Windows/Linux)", () => {
    const onMinimize = vi.fn();
    const event = createMockEvent({ key: "M", metaKey: false, ctrlKey: true });
    const handled = handleWindowKeyEvent(event, { onMinimize, enableMinimize: true });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("does not trigger minimize when enableMinimize is false", () => {
    const onMinimize = vi.fn();
    const event = createMockEvent({ key: "m", metaKey: true });
    const handled = handleWindowKeyEvent(event, { onMinimize, enableMinimize: false });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
  });

  it("triggers onClose on Cmd+W when onClose handler is provided", () => {
    const onClose = vi.fn();
    const event = createMockEvent({ key: "w", metaKey: true });
    const handled = handleWindowKeyEvent(event, { onClose });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onClose on Ctrl+W (Windows/Linux)", () => {
    const onClose = vi.fn();
    const event = createMockEvent({ key: "W", metaKey: false, ctrlKey: true });
    const handled = handleWindowKeyEvent(event, { onClose });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores key events without Cmd or Ctrl modifier", () => {
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    const event = createMockEvent({ key: "m", metaKey: false, ctrlKey: false });
    const handled = handleWindowKeyEvent(event, { onMinimize, onClose });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("triggers onToggleDebug on Cmd+Shift+D", () => {
    const onToggleDebug = vi.fn();
    const event = createMockEvent({ key: "d", metaKey: true, shiftKey: true });
    const handled = handleWindowKeyEvent(event, { onToggleDebug });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onToggleDebug).toHaveBeenCalledTimes(1);
  });

  it("triggers onToggleDebug on Ctrl+Shift+D (Windows/Linux)", () => {
    const onToggleDebug = vi.fn();
    const event = createMockEvent({ key: "D", metaKey: false, ctrlKey: true, shiftKey: true });
    const handled = handleWindowKeyEvent(event, { onToggleDebug });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onToggleDebug).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated keys even with Cmd modifier", () => {
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    const event = createMockEvent({ key: "z", metaKey: true });
    const handled = handleWindowKeyEvent(event, { onMinimize, onClose });

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
  });
});
