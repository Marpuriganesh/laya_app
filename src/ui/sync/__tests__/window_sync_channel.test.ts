import { describe, it, expect, vi } from "vitest";
import { createWindowSyncChannel } from "../window_sync_channel";
import type { WindowSyncMessage } from "@/types/window";

describe("createWindowSyncChannel", () => {
  it("initializes and handles messages from peer channel", () => {
    let capturedListener: ((event: MessageEvent) => void) | undefined;
    const postMessageSpy = vi.fn();
    const closeSpy = vi.fn();

    const mockChannel = {
      postMessage: postMessageSpy,
      close: closeSpy,
      onmessage: null,
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
        capturedListener = listener;
      },
      removeEventListener: vi.fn(),
    };

    const onMessage = vi.fn();
    const instance = createWindowSyncChannel(onMessage, mockChannel);

    const testMessage: WindowSyncMessage = {
      type: "SET_ACTIVE_COLOR",
      color: "#ff5500",
    };

    instance.postMessage(testMessage);
    expect(postMessageSpy).toHaveBeenCalledWith(testMessage);

    // Simulate receiving message from peer
    if (typeof capturedListener === "function") {
      (capturedListener as (event: MessageEvent) => void)(new MessageEvent("message", { data: testMessage }));
    }
    expect(onMessage).toHaveBeenCalledWith(testMessage);

    instance.close();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("handles environment without BroadcastChannel gracefully", () => {
    // Pass null custom channel and simulate no global BroadcastChannel
    const originalBC = globalThis.BroadcastChannel;
    // @ts-expect-error test undefined
    delete globalThis.BroadcastChannel;

    const onMessage = vi.fn();
    const instance = createWindowSyncChannel(onMessage);

    expect(() => {
      instance.postMessage({ type: "REQUEST_STATE_SYNC" });
      instance.close();
    }).not.toThrow();

    globalThis.BroadcastChannel = originalBC;
  });

  it("ignores malformed messages missing a type property", () => {
    let capturedListener: ((event: MessageEvent) => void) | undefined;
    const mockChannel = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null,
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
        capturedListener = listener;
      },
    };

    const onMessage = vi.fn();
    createWindowSyncChannel(onMessage, mockChannel);

    if (typeof capturedListener === "function") {
      const listener = capturedListener as (event: MessageEvent) => void;
      listener(new MessageEvent("message", { data: "raw string" }));
      listener(new MessageEvent("message", { data: null }));
      listener(new MessageEvent("message", { data: { notType: 123 } }));
    }

    expect(onMessage).not.toHaveBeenCalled();
  });
});
