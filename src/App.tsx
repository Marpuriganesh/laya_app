import { useCallback } from "react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { TopNavBar } from "@/ui/components/TopNavBar";
import { SidebarRail } from "@/ui/components/SidebarRail";
import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { NewCanvasModal } from "@/ui/components/NewCanvasModal";
import { ColorPickerPopover } from "@/ui/components/ColorPickerPopover";
import { BrushLibraryPopover } from "@/ui/components/BrushLibraryPopover";
import { BrushSettingsPopover } from "@/ui/components/BrushSettingsPopover";
import { LayersPopover } from "@/ui/components/LayersPopover";

export default function App() {
  const {
    document,
    activeTool,
    activeColor,
    brushSize,
    brushOpacity,
    transform,
    activePopover,
    softProofMode,
    setDocument,
    setActiveTool,
    setActiveColor,
    setBrushSize,
    setBrushOpacity,
    setTransform,
    setActivePopover,
    togglePopover,
    setSoftProofMode,
  } = useDocumentStore();

  const handleClosePopover = useCallback(() => {
    setActivePopover("none");
  }, [setActivePopover]);

  const handleResetZoom = useCallback(() => {
    const scaleFactor = Math.min(
      (window.innerWidth * 0.85) / document.width,
      (window.innerHeight * 0.85) / document.height,
      1.0
    );
    const scale = Math.max(0.05, Math.min(scaleFactor, 2.0));
    const panX = (window.innerWidth - document.width * scale) / 2;
    const panY = (window.innerHeight - document.height * scale) / 2;
    setTransform({ scale, panX, panY });
  }, [document.width, document.height, setTransform]);

  return (
    <div className="dark flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans select-none">
      {/* Procreate-Style Top Navigation Bar */}
      <TopNavBar
        document={document}
        activeTool={activeTool}
        activeColor={activeColor}
        zoomScale={transform.scale}
        activePopover={activePopover}
        softProofMode={softProofMode}
        onSelectTool={setActiveTool}
        onTogglePopover={togglePopover}
        onResetZoom={handleResetZoom}
        onSelectSoftProofMode={setSoftProofMode}
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
          softProofMode={softProofMode}
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

      <LayersPopover
        isOpen={activePopover === "layers"}
        onClose={handleClosePopover}
      />

      <BrushLibraryPopover
        isOpen={activePopover === "brushLibrary"}
        onClose={handleClosePopover}
        onOpenSettings={() => setActivePopover("brushSettings")}
      />

      <BrushSettingsPopover
        isOpen={activePopover === "brushSettings"}
        onClose={handleClosePopover}
        activeColor={activeColor}
      />

      <NewCanvasModal
        isOpen={activePopover === "newCanvas"}
        onClose={handleClosePopover}
        onCreateDocument={setDocument}
      />
    </div>
  );
}
