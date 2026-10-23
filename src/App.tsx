import { useCallback, useEffect } from "react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";
import { useDetachedWindowSync } from "@/ui/hooks/useDetachedWindowSync";
import { useWindowKeyShortcuts } from "@/ui/hooks/useWindowKeyShortcuts";
import { useSpringLoadedToolShortcuts } from "@/ui/hooks/useSpringLoadedToolShortcuts";
import { useNativeUiRectsSync } from "@/ui/hooks/useNativeUiRectsSync";
import { detachPanelWindow, focusDetachedWindow } from "@/ui/window/window_manager";
import { DETACHABLE_PANEL_CONFIGS, type DetachablePanelId } from "@/types/window";
import { TopNavBar } from "@/ui/components/TopNavBar";
import { SidebarRail } from "@/ui/components/SidebarRail";
import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { NewCanvasModal } from "@/ui/components/NewCanvasModal";
import { ColorPickerPopover } from "@/ui/components/ColorPickerPopover";
import { BrushLibraryPopover } from "@/ui/components/BrushLibraryPopover";
import { BrushSettingsPopover } from "@/ui/components/BrushSettingsPopover";
import { LayersPopover } from "@/ui/components/LayersPopover";
import { DetachedWindowRoot } from "@/ui/components/DetachedWindowRoot";
import { ThemeProvider, useTheme } from "@/ui/theme/ThemeProvider";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";

export default function App() {
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const detachedPanel = urlParams?.get("detached") as DetachablePanelId | null;

  return (
    <ThemeProvider defaultTheme="dark">
      {detachedPanel ? <DetachedWindowRoot panelId={detachedPanel} /> : <MainWindow />}
    </ThemeProvider>
  );
}

function MainWindow() {
  useDetachedWindowSync({ role: "main" });
  useWindowKeyShortcuts({ enableMinimize: true });
  useSpringLoadedToolShortcuts();
  const { resolvedTheme } = useTheme();

  const {
    document,
    activeTool,
    activeColor,
    brushSize,
    brushOpacity,
    transform,
    activePopover,
    isBrushStudioOpen,
    softProofMode,
    detachedPanels,
    detachPanel,
    setDocument,
    setActiveTool,
    setActiveColor,
    setBrushSize,
    setBrushOpacity,
    setTransform,
    setActivePopover,
    setBrushStudioOpen,
    togglePopover,
    setSoftProofMode,
  } = useDocumentStore();

  useNativeUiRectsSync(activePopover);

  useEffect(() => {
    globalRustBrushBridge.setWorkspaceTheme(resolvedTheme === "dark");
  }, [resolvedTheme]);

  const handleClosePopover = useCallback(() => {
    setActivePopover("none");
  }, [setActivePopover]);

  useEffect(() => {
    // Only full-screen modal dialogs (like New Canvas) block canvas painting entirely.
    // Floating popovers (Color, Layers, Brush settings) are non-modal and allow painting outside them.
    globalRustBrushBridge.setModalOpen(activePopover === "newCanvas");
  }, [activePopover]);

  const handleDetachPanel = useCallback(async (panelId: DetachablePanelId) => {
    detachPanel(panelId);
    const config = DETACHABLE_PANEL_CONFIGS[panelId];
    await detachPanelWindow(config);
  }, [detachPanel]);

  const handleFocusDetached = useCallback(async (panelId: DetachablePanelId) => {
    await focusDetachedWindow(panelId);
  }, []);

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
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden ${
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
          ? "bg-transparent"
          : "bg-background"
      } text-foreground font-sans select-none transition-colors duration-150 rounded-xl border border-border/80`}
    >
      {/* Procreate-Style Top Navigation Bar */}
      <TopNavBar
        document={document}
        activeTool={activeTool}
        activeColor={activeColor}
        zoomScale={transform.scale}
        activePopover={activePopover}
        softProofMode={softProofMode}
        detachedPanels={detachedPanels}
        onFocusDetached={handleFocusDetached}
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
        isOpen={activePopover === "color" && !detachedPanels.color}
        activeColor={activeColor}
        onClose={handleClosePopover}
        onSelectColor={setActiveColor}
        onDetach={() => handleDetachPanel("color")}
      />

      <LayersPopover
        isOpen={activePopover === "layers" && !detachedPanels.layers}
        onClose={handleClosePopover}
        onDetach={() => handleDetachPanel("layers")}
      />

      <BrushLibraryPopover
        isOpen={activePopover === "brushLibrary" && !detachedPanels.brushLibrary}
        onClose={handleClosePopover}
        onOpenSettings={() => setBrushStudioOpen(true)}
        onDetach={() => handleDetachPanel("brushLibrary")}
        activeColor={activeColor}
      />

      <BrushSettingsPopover
        isOpen={isBrushStudioOpen && !detachedPanels.brushSettings}
        onClose={() => setBrushStudioOpen(false)}
        activeColor={activeColor}
        onDetach={() => handleDetachPanel("brushSettings")}
      />

      <NewCanvasModal
        isOpen={activePopover === "newCanvas"}
        onClose={handleClosePopover}
        onCreateDocument={setDocument}
      />
    </div>
  );
}
