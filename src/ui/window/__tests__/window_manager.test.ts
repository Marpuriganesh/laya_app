import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTauriEnvironment,
  getDetachedWindowLabel,
  detachPanelWindow,
  closeCurrentWindow,
} from "../window_manager";
import type { DetachedWindowConfig } from "@/types/window";

describe("window_manager", () => {
  let fakeWindow: any;

  beforeEach(() => {
    fakeWindow = {
      open: vi.fn(),
      close: vi.fn(),
      screen: { availWidth: 1920, availHeight: 1080 },
    };
    (globalThis as any).window = fakeWindow;
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("identifies non-Tauri environment correctly", () => {
    expect(isTauriEnvironment()).toBe(false);
  });

  it("identifies Tauri environment when internals exist", () => {
    fakeWindow.__TAURI_INTERNALS__ = {};
    expect(isTauriEnvironment()).toBe(true);
  });

  it("generates correct detached window labels", () => {
    expect(getDetachedWindowLabel("color")).toBe("detached-color");
    expect(getDetachedWindowLabel("layers")).toBe("detached-layers");
  });

  it("falls back to window.open in browser environment", async () => {
    const focusSpy = vi.fn();
    fakeWindow.open = vi.fn().mockReturnValue({
      focus: focusSpy,
    });

    const config: DetachedWindowConfig = {
      panelId: "color",
      title: "Color Studio",
      defaultWidth: 320,
      defaultHeight: 500,
    };

    const result = await detachPanelWindow(config);
    expect(result).toBe(true);
    expect(fakeWindow.open).toHaveBeenCalledWith(
      "/?detached=color",
      "detached-color",
      expect.stringContaining("width=320")
    );
    expect(focusSpy).toHaveBeenCalled();
  });

  it("closes window safely in browser environment", async () => {
    await closeCurrentWindow();
    expect(fakeWindow.close).toHaveBeenCalled();
  });
});
