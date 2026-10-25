import { useEffect, useRef, useCallback } from "react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import {
  createWindowSyncChannel,
  type WindowSyncChannelInstance,
} from "@/ui/sync/window_sync_channel";
import type {
  DetachablePanelId,
  WindowSyncMessage,
  WindowSyncPayload,
} from "@/types/window";
import { closeCurrentWindow } from "@/ui/window/window_manager";

export interface UseDetachedWindowSyncOptions {
  role: "main" | "detached";
  panelId?: DetachablePanelId;
}

export interface UseDetachedWindowSyncReturn {
  dockToMainWindow: () => Promise<void>;
  closeDetachedWindow: () => Promise<void>;
}

/**
 * React hook that coordinates bi-directional real-time state synchronization
 * between the main canvas window and any detached tool windows.
 */
export function useDetachedWindowSync({
  role,
  panelId,
}: UseDetachedWindowSyncOptions): UseDetachedWindowSyncReturn {
  const channelRef = useRef<WindowSyncChannelInstance | null>(null);
  const isInternalUpdateRef = useRef<boolean>(false);

  const {
    activeColor,
    activeTool,
    brushSize,
    brushOpacity,
    layerStack,
    gamutMask,
    wheelConfig,
    activePresetId,
    setActiveColor,
    setActiveTool,
    setBrushSize,
    setBrushOpacity,
    setLayerStack,
    setGamutMask,
    setWheelConfig,
    setActivePresetId,
    dockPanel,
    setPanelDetached,
  } = useDocumentStore();

  // Helper to safely apply peer update to local store without echo broadcast
  const applyRemoteUpdate = useCallback(
    (updater: () => void) => {
      isInternalUpdateRef.current = true;
      try {
        updater();
      } finally {
        // Reset after tick to allow React re-renders to settle
        setTimeout(() => {
          isInternalUpdateRef.current = false;
        }, 0);
      }
    },
    []
  );

  useEffect(() => {
    const handleIncomingMessage = (message: WindowSyncMessage) => {
      switch (message.type) {
        case "REQUEST_STATE_SYNC": {
          if (role === "main" && channelRef.current) {
            const currentState = useDocumentStore.getState();
            const payload: WindowSyncPayload = {
              activeColor: currentState.activeColor,
              activeTool: currentState.activeTool,
              brushSize: currentState.brushSize,
              brushOpacity: currentState.brushOpacity,
              layerStack: currentState.layerStack,
              gamutMask: currentState.gamutMask,
              wheelConfig: currentState.wheelConfig,
              activePresetId: currentState.activePresetId,
              brushSoftness: globalDrawingEngine.getBrushSoftness?.() ?? 0.45,
              brushSpacing: (globalDrawingEngine.getBrushSpacing?.() ?? 0.08) * 100,
              brushFlow: (globalDrawingEngine.getBrushFlow?.() ?? 1.0) * 100,
              sizeDynamics: globalDrawingEngine.getSizeDynamicsEnabled?.() ?? true,
              opacityDynamics: globalDrawingEngine.getOpacityDynamicsEnabled?.() ?? false,
            };
            channelRef.current.postMessage({
              type: "STATE_SYNC",
              payload,
            });
          }
          break;
        }

        case "STATE_SYNC": {
          if (role === "detached") {
            applyRemoteUpdate(() => {
              setActiveColor(message.payload.activeColor);
              setActiveTool(message.payload.activeTool);
              setBrushSize(message.payload.brushSize);
              setBrushOpacity(message.payload.brushOpacity);
              setLayerStack(message.payload.layerStack);
              if (message.payload.gamutMask) {
                setGamutMask(message.payload.gamutMask);
              }
              if (message.payload.wheelConfig) {
                setWheelConfig(message.payload.wheelConfig);
              }
              if (message.payload.activePresetId) {
                setActivePresetId(message.payload.activePresetId);
                const loaded = globalDrawingEngine.getLoadedPresets?.() ?? [];
                const matching = loaded.find((p) => p.presetId === message.payload.activePresetId);
                if (matching) {
                  globalDrawingEngine.setActiveBrush(matching);
                }
              }
              if (typeof message.payload.brushSoftness === "number") {
                globalDrawingEngine.setBrushSoftness?.(message.payload.brushSoftness);
              }
              if (typeof message.payload.brushSpacing === "number") {
                globalDrawingEngine.setBrushSpacing?.(message.payload.brushSpacing / 100);
              }
              if (typeof message.payload.brushFlow === "number") {
                globalDrawingEngine.setBrushFlow?.(message.payload.brushFlow / 100);
              }
              if (typeof message.payload.sizeDynamics === "boolean") {
                globalDrawingEngine.setSizeDynamicsEnabled?.(message.payload.sizeDynamics);
              }
              if (typeof message.payload.opacityDynamics === "boolean") {
                globalDrawingEngine.setOpacityDynamicsEnabled?.(message.payload.opacityDynamics);
              }
            });
          }
          break;
        }

        case "PANEL_DETACHED": {
          if (role === "main") {
            setPanelDetached(message.panelId, true);
          }
          break;
        }

        case "PANEL_REATTACHED": {
          if (role === "main") {
            dockPanel(message.panelId);
          }
          break;
        }

        case "PANEL_CLOSED": {
          if (role === "main") {
            setPanelDetached(message.panelId, false);
          }
          break;
        }

        case "SET_ACTIVE_COLOR": {
          if (useDocumentStore.getState().activeColor !== message.color) {
            applyRemoteUpdate(() => {
              setActiveColor(message.color);
            });
          }
          break;
        }

        case "SET_ACTIVE_TOOL": {
          if (useDocumentStore.getState().activeTool !== message.tool) {
            applyRemoteUpdate(() => {
              setActiveTool(message.tool);
            });
          }
          break;
        }

        case "SET_BRUSH_SIZE": {
          if (useDocumentStore.getState().brushSize !== message.size) {
            applyRemoteUpdate(() => {
              setBrushSize(message.size);
            });
          }
          break;
        }

        case "SET_BRUSH_OPACITY": {
          if (useDocumentStore.getState().brushOpacity !== message.opacity) {
            applyRemoteUpdate(() => {
              setBrushOpacity(message.opacity);
            });
          }
          break;
        }

        case "SET_ACTIVE_PRESET": {
          if (useDocumentStore.getState().activePresetId !== message.presetId) {
            applyRemoteUpdate(() => {
              setActivePresetId(message.presetId);
              const loaded = globalDrawingEngine.getLoadedPresets?.() ?? [];
              const matching = loaded.find((p) => p.presetId === message.presetId);
              if (matching) {
                globalDrawingEngine.setActiveBrush(matching);
              }
            });
          }
          break;
        }

        case "SET_BRUSH_SETTINGS": {
          applyRemoteUpdate(() => {
            globalDrawingEngine.setBrushSoftness?.(message.softness);
            globalDrawingEngine.setBrushSpacing?.(message.spacing / 100);
            globalDrawingEngine.setBrushFlow?.(message.flow / 100);
            globalDrawingEngine.setSizeDynamicsEnabled?.(message.sizeDynamics);
            globalDrawingEngine.setOpacityDynamicsEnabled?.(message.opacityDynamics);
          });
          break;
        }

        case "SET_LAYER_STACK": {
          applyRemoteUpdate(() => {
            setLayerStack(message.layerStack);
          });
          break;
        }

        case "SET_GAMUT_MASK": {
          applyRemoteUpdate(() => {
            setGamutMask(message.gamutMask);
          });
          break;
        }

        case "SET_WHEEL_CONFIG": {
          applyRemoteUpdate(() => {
            setWheelConfig(message.wheelConfig);
          });
          break;
        }
      }
    };

    const channel = createWindowSyncChannel(handleIncomingMessage);
    channelRef.current = channel;

    if (role === "detached" && panelId) {
      // Announce presence and request initial state snapshot from main window
      channel.postMessage({ type: "PANEL_DETACHED", panelId });
      channel.postMessage({ type: "REQUEST_STATE_SYNC" });

      const handleBeforeUnload = () => {
        channel.postMessage({ type: "PANEL_CLOSED", panelId });
      };
      if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", handleBeforeUnload);
      }

      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("beforeunload", handleBeforeUnload);
        }
        channel.close();
      };
    }

    return () => {
      channel.close();
    };
  }, [
    role,
    panelId,
    applyRemoteUpdate,
    setActiveColor,
    setActiveTool,
    setBrushSize,
    setBrushOpacity,
    setLayerStack,
    setGamutMask,
    setWheelConfig,
    dockPanel,
    setPanelDetached,
  ]);

  // Broadcast state changes when modified locally
  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_ACTIVE_COLOR",
      color: activeColor,
    });
  }, [activeColor]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_ACTIVE_TOOL",
      tool: activeTool,
    });
  }, [activeTool]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_BRUSH_SIZE",
      size: brushSize,
    });
  }, [brushSize]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_BRUSH_OPACITY",
      opacity: brushOpacity,
    });
  }, [brushOpacity]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_ACTIVE_PRESET",
      presetId: activePresetId,
    });
  }, [activePresetId]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_LAYER_STACK",
      layerStack,
    });
  }, [layerStack]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_GAMUT_MASK",
      gamutMask,
    });
  }, [gamutMask]);

  useEffect(() => {
    if (isInternalUpdateRef.current || !channelRef.current) return;
    channelRef.current.postMessage({
      type: "SET_WHEEL_CONFIG",
      wheelConfig,
    });
  }, [wheelConfig]);

  const dockToMainWindow = useCallback(async () => {
    if (panelId && channelRef.current) {
      channelRef.current.postMessage({
        type: "PANEL_REATTACHED",
        panelId,
      });
    }
    await closeCurrentWindow();
  }, [panelId]);

  const closeDetachedWindow = useCallback(async () => {
    if (panelId && channelRef.current) {
      channelRef.current.postMessage({
        type: "PANEL_CLOSED",
        panelId,
      });
    }
    await closeCurrentWindow();
  }, [panelId]);

  return {
    dockToMainWindow,
    closeDetachedWindow,
  };
}
