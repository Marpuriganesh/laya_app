import { type FC } from "react";
import { Layers, Brush, SlidersHorizontal, Shapes, Sliders } from "lucide-react";
import type { DetachablePanelId } from "@/types/window";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { useDetachedWindowSync } from "@/ui/hooks/useDetachedWindowSync";
import { DetachedWindowLayout } from "@/ui/components/DetachedWindowLayout";
import { ColorPickerPopover } from "@/ui/components/ColorPickerPopover";
import { LayersPanelContent } from "@/ui/components/LayersPanelContent";
import { GamutMaskPanelContent } from "@/ui/components/GamutMaskPanelContent";
import { DiscreteGridPanelContent } from "@/ui/components/DiscreteGridPanelContent";

export interface DetachedWindowRootProps {
  panelId: DetachablePanelId;
}

export const DetachedWindowRoot: FC<DetachedWindowRootProps> = ({ panelId }) => {
  const { activeColor, setActiveColor } = useDocumentStore();
  const { dockToMainWindow, closeDetachedWindow } = useDetachedWindowSync({
    role: "detached",
    panelId,
  });

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
        icon={<Brush className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-zinc-500 dark:text-zinc-400 h-full select-none">
          <Brush className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-1" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Brush Library</p>
          <p className="text-xs text-zinc-500">
            Clean slate ready for Rust-powered preset library.
          </p>
        </div>
      </DetachedWindowLayout>
    );
  }

  if (panelId === "brushSettings") {
    return (
      <DetachedWindowLayout
        title="Brush Settings"
        icon={<SlidersHorizontal className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />}
        onDock={dockToMainWindow}
        onClose={closeDetachedWindow}
      >
        <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-zinc-500 dark:text-zinc-400 h-full select-none">
          <SlidersHorizontal className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mb-1" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Brush Settings</p>
          <p className="text-xs text-zinc-500">
            Clean slate ready for Rust brush dynamics & presets.
          </p>
        </div>
      </DetachedWindowLayout>
    );
  }

  return (
    <DetachedWindowLayout
      title="Tool Palette"
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
