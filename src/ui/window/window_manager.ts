import type { DetachedWindowConfig } from "@/types/window";

/**
 * Checks if the current environment is running within the Tauri desktop container.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Formats a unique window label for a given panel identifier.
 */
export function getDetachedWindowLabel(panelId: string): string {
  return `detached-${panelId}`;
}

/**
 * Detaches a panel into its own native Tauri window (when running on desktop)
 * or a detached browser popup window (when running as a static PWA).
 *
 * @param config Window dimensions, title, and panel identifier.
 * @returns Promise resolving to true if window was opened/focused successfully.
 */
export async function detachPanelWindow(config: DetachedWindowConfig): Promise<boolean> {
  const windowLabel = getDetachedWindowLabel(config.panelId);
  const targetUrl = `/?detached=${encodeURIComponent(config.panelId)}`;

  if (isTauriEnvironment()) {
    try {
      // First attempt: invoke our dedicated Tauri backend command
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("detach_panel", {
        label: windowLabel,
        title: config.title,
        panelId: config.panelId,
        width: config.defaultWidth,
        height: config.defaultHeight,
      });
      return true;
    } catch (invokeError) {
      console.warn("Backend detach_panel command failed, falling back to WebviewWindow API:", invokeError);
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existingWindow = await WebviewWindow.getByLabel(windowLabel);
        if (existingWindow) {
          await existingWindow.show();
          await existingWindow.unminimize();
          await existingWindow.setFocus();
          return true;
        }

        const newWindow = new WebviewWindow(windowLabel, {
          url: targetUrl,
          title: config.title,
          width: config.defaultWidth,
          height: config.defaultHeight,
          minWidth: config.minWidth ?? 240,
          minHeight: config.minHeight ?? 200,
          resizable: true,
          decorations: false,
          transparent: true,
          shadow: true,
          acceptFirstMouse: true,
        });

        await new Promise<void>((resolve, reject) => {
          newWindow.once("tauri://created", () => resolve());
          newWindow.once("tauri://error", (e) => reject(e));
        });
        return true;
      } catch (webviewError) {
        console.error("Failed to spawn Tauri detached window:", webviewError);
      }
    }
  }

  // Browser PWA Fallback: window.open popup
  if (typeof window !== "undefined") {
    const leftPosition = Math.max(0, (window.screen.availWidth - config.defaultWidth) / 2);
    const topPosition = Math.max(0, (window.screen.availHeight - config.defaultHeight) / 2);
    const windowFeatures = [
      `width=${config.defaultWidth}`,
      `height=${config.defaultHeight}`,
      `left=${leftPosition}`,
      `top=${topPosition}`,
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=no",
    ].join(",");

    const popup = window.open(targetUrl, windowLabel, windowFeatures);
    if (popup) {
      popup.focus();
      return true;
    }
  }

  return false;
}

/**
 * Brings an existing detached window to the front and focuses it.
 */
export async function focusDetachedWindow(panelId: string): Promise<boolean> {
  const windowLabel = getDetachedWindowLabel(panelId);

  if (isTauriEnvironment()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const targetWindow = await WebviewWindow.getByLabel(windowLabel);
      if (targetWindow) {
        await targetWindow.show();
        await targetWindow.unminimize();
        await targetWindow.setFocus();
        return true;
      }
    } catch (err) {
      console.warn("Failed to focus Tauri window:", err);
    }
  }

  return false;
}

/**
 * Toggles "Always on Top" for the current window.
 */
export async function toggleWindowAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_always_on_top", { alwaysOnTop });
      return true;
    } catch {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
        return true;
      } catch (err) {
        console.warn("Failed to toggle always-on-top:", err);
      }
    }
  }

  return false;
}

/**
 * Closes the current window (in Tauri or Browser popup).
 */
export async function closeCurrentWindow(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
      return;
    } catch (err) {
      console.warn("Failed to close Tauri window:", err);
    }
  }

  if (typeof window !== "undefined") {
    window.close();
  }
}
