import { type FC } from "react";
import { Layers, Brush, SlidersHorizontal, Shapes, Sliders } from "lucide-react";
import type { DetachablePanelId } from "@/types/window";
import { DETACHABLE_PANEL_CONFIGS } from "@/types/window";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { useDetachedWindowSync } from "@/ui/hooks/useDetachedWindowSync";
import { DetachedWindowLayout } from "@/ui/components/DetachedWindowLayout";
import { ColorPickerPopover } from "@/ui/components/ColorPickerPopover";
import { LayersPanelContent } from "@/ui/components/LayersPanelContent";
import { GamutMaskPanelContent } from "@/ui/components/GamutMaskPanelContent";
import { DiscreteGridPanelContent } from "@/ui/components/DiscreteGridPanelContent";
import { BrushStudioContent } from "@/ui/components/BrushSettingsPopover";
import { BrushLibraryContent } from "@/ui/components/BrushLibraryContent";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";

export interface DetachedWindowRootProps {
  panelId: DetachablePanelId;
}

export const DetachedWindowRoot: FC<DetachedWindowRootProps> = ({ panelId }) => {
  const { activeColor, setActiveColor } = useDocumentStore();
  const { dockToMainWindow, closeDetachedWindow } = useDetachedWindowSync({
    role: "detached",
    panelId,
  });

  const config = DETACHABLE_PANEL_CONFIGS[panelId];

  if (panelId === "color") {
    return (
      <ColorPickerPopover
        isOpen={true}
        activeColor={activeColor}
        onClose={closeDetachedWindow}
        onSelectColor={setActiveColor}
        isDetached={true}
        onDock={dockToMainWindow}
      />
    );
  }

  if (panelId === "colorGamut") {
    return (
      <DetachedWindowLayout
        title="Gamut Mask"
        defaultWidth={config?.defaultWidth}
        defaultHeight={config?.defaultHeight}
        icon={<Shapes className="w-4 h-4 text-blue-400" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <GamutMaskPanelContent />
      </DetachedWindowLayout>
    );
  }

  if (panelId === "colorGrid") {
    return (
      <DetachedWindowLayout
        title="Discrete Grid Levels"
        defaultWidth={config?.defaultWidth}
        defaultHeight={config?.defaultHeight}
        icon={<Sliders className="w-4 h-4 text-blue-400" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <DiscreteGridPanelContent />
      </DetachedWindowLayout>
    );
  }

  if (panelId === "layers") {
    return (
      <DetachedWindowLayout
        title="Layers"
        defaultWidth={config?.defaultWidth}
        defaultHeight={config?.defaultHeight}
        icon={<Layers className="w-4 h-4 text-zinc-300" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <LayersPanelContent />
      </DetachedWindowLayout>
    );
  }

  if (panelId === "brushLibrary") {
    return (
      <DetachedWindowLayout
        title="Brush Library"
        defaultWidth={config?.defaultWidth}
        defaultHeight={config?.defaultHeight}
        icon={<Brush className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <BrushLibraryContent
          onOpenSettings={() => {
            // Can open brush studio in detached mode
            const studioConfig = DETACHABLE_PANEL_CONFIGS.brushSettings;
            import("@/ui/window/window_manager").then(({ detachPanelWindow }) => {
              void detachPanelWindow(studioConfig);
            });
          }}
        />
      </DetachedWindowLayout>
    );
  }

  if (panelId === "brushSettings") {
    const activeBrush = globalDrawingEngine.getActiveBrush?.();
    const dynamicTitle = activeBrush ? `Brush Studio: ${activeBrush.displayName}` : (config?.title ?? "Brush Studio");

    return (
      <DetachedWindowLayout
        title={dynamicTitle}
        defaultWidth={config?.defaultWidth}
        defaultHeight={config?.defaultHeight}
        icon={<SlidersHorizontal className="w-4 h-4 text-blue-400" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <BrushStudioContent />
      </DetachedWindowLayout>
    );
  }

  return (
    <DetachedWindowLayout
      title="Tool Palette"
      defaultWidth={config?.defaultWidth}
      defaultHeight={config?.defaultHeight}
      onDock={dockToMainWindow}
      onClose={closeDetachedWindow}
    >
      <div className="p-6 flex flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400 h-full select-none">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Unknown Panel</p>
        <p className="text-xs text-zinc-500 mt-1">
          The requested panel identifier &quot;{panelId}&quot; could not be resolved.
        </p>
      </div>
    </DetachedWindowLayout>
  );
};
