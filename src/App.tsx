import { useCallback } from "react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { TopNavBar } from "@/ui/components/TopNavBar";
import { SidebarRail } from "@/ui/components/SidebarRail";
import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { NewCanvasModal } from "@/ui/components/NewCanvasModal";
import { ColorPickerPopover } from "@/ui/components/ColorPickerPopover";
import { BrushLibraryPopover } from "@/ui/components/BrushLibraryPopover";

export default function App() {
  const {
    document,
    activeTool,
    activeColor,
    brushSize,
    brushOpacity,
    transform,
    activePopover,
    setDocument,
    setActiveTool,
    setActiveColor,
    setBrushSize,
    setBrushOpacity,
    setTransform,
    setActivePopover,
    togglePopover,
    resetTransform,
  } = useDocumentStore();

  const handleClosePopover = useCallback(() => {
    setActivePopover("none");
  }, [setActivePopover]);

  return (
    <div className="dark flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans select-none">
      {/* Procreate-Style Top Navigation Bar */}
      <TopNavBar
        document={document}
        activeTool={activeTool}
        activeColor={activeColor}
        zoomScale={transform.scale}
        activePopover={activePopover}
        onSelectTool={setActiveTool}
        onTogglePopover={togglePopover}
        onResetZoom={resetTransform}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Procreate-Style Vertical Rail (Brush Size & Opacity) */}
        <SidebarRail
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          onBrushSizeChange={setBrushSize}
          onBrushOpacityChange={setBrushOpacity}
        />

        {/* Central Pan & Zoom Canvas Viewport */}
        <CanvasViewport
          document={document}
          activeTool={activeTool}
          activeColor={activeColor}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          transform={transform}
          onTransformChange={setTransform}
        />
      </div>

      {/* Floating Popovers & Dialogs */}
      <ColorPickerPopover
        isOpen={activePopover === "color"}
        activeColor={activeColor}
        onClose={handleClosePopover}
        onSelectColor={setActiveColor}
      />

      <BrushLibraryPopover
        isOpen={activePopover === "brushLibrary"}
        onClose={handleClosePopover}
      />

      <NewCanvasModal
        isOpen={activePopover === "newCanvas"}
        onClose={handleClosePopover}
        onCreateDocument={setDocument}
      />
    </div>
  );
}
