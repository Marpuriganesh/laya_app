import type { WindowSyncMessage } from "@/types/window";

export const WINDOW_SYNC_CHANNEL_NAME = "sketch_studio_window_sync";

export interface WindowSyncChannelInstance {
  postMessage: (message: WindowSyncMessage) => void;
  close: () => void;
}

/**
 * Creates a two-way synchronization channel between the main application window
 * and detached tool windows. Uses the standard BroadcastChannel API supported by
 * both modern browsers (PWA) and Tauri Webview windows.
 *
 * @param onMessage Callback invoked whenever a sync message is received from a peer window.
 * @param customChannel Optional custom BroadcastChannel-compatible object (for headless tests or custom transports).
 */
export function createWindowSyncChannel(
  onMessage: (message: WindowSyncMessage) => void,
  customChannel?: {
    postMessage: (data: unknown) => void;
    close: () => void;
    onmessage: ((event: MessageEvent) => void) | null;
    addEventListener?: (type: string, listener: (event: MessageEvent) => void) => void;
    removeEventListener?: (type: string, listener: (event: MessageEvent) => void) => void;
  }
): WindowSyncChannelInstance {
  const channel =
    customChannel ??
    (typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(WINDOW_SYNC_CHANNEL_NAME)
      : null);

  if (!channel) {
    return {
      postMessage: () => {},
      close: () => {},
    };
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.data && typeof event.data === "object" && "type" in event.data) {
      onMessage(event.data as WindowSyncMessage);
    }
  };

  if (channel.addEventListener) {
    channel.addEventListener("message", handleMessage);
  } else {
    channel.onmessage = handleMessage;
  }

  return {
    postMessage: (message: WindowSyncMessage) => {
      try {
        channel.postMessage(message);
      } catch (error) {
        console.warn("Failed to broadcast window sync message:", error);
      }
    },
    close: () => {
      try {
        if (channel.removeEventListener) {
          channel.removeEventListener("message", handleMessage);
        }
        channel.close();
      } catch (error) {
        console.warn("Failed to close window sync channel:", error);
      }
    },
  };
}
