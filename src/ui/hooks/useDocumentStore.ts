import { useState, useCallback } from "react";
import {
  type DocumentConfiguration,
  createDefaultDocumentConfiguration,
} from "@/types/document";
import type { ActiveTool, PopoverType, CanvasTransform, SoftProofMode } from "@/types/ui";

export interface DocumentStore {
  document: DocumentConfiguration;
  activeTool: ActiveTool;
  activeColor: string;
  brushSize: number;
  brushOpacity: number;
  transform: CanvasTransform;
  activePopover: PopoverType;
  softProofMode: SoftProofMode;
  setDocument: (doc: DocumentConfiguration) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setActiveColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setTransform: (transform: CanvasTransform) => void;
  setActivePopover: (popover: PopoverType) => void;
  togglePopover: (popover: PopoverType) => void;
  setSoftProofMode: (mode: SoftProofMode) => void;
  resetTransform: () => void;
}

export function useDocumentStore(): DocumentStore {
  const [document, setDocument] = useState<DocumentConfiguration>(
    createDefaultDocumentConfiguration
  );
  const [activeTool, setActiveTool] = useState<ActiveTool>("brush");
  const [activeColor, setActiveColor] = useState<string>("#1e1e1e");
  const [brushSize, setBrushSize] = useState<number>(32);
  const [brushOpacity, setBrushOpacity] = useState<number>(1.0);
  const [transform, setTransform] = useState<CanvasTransform>({
    scale: 0.8,
    panX: 0,
    panY: 0,
  });
  const [activePopover, setActivePopover] = useState<PopoverType>("none");
  const [softProofMode, setSoftProofMode] = useState<SoftProofMode>("none");

  const togglePopover = useCallback((popover: PopoverType) => {
    setActivePopover((current) => (current === popover ? "none" : popover));
  }, []);

  const resetTransform = useCallback(() => {
    setTransform({ scale: 0.8, panX: 0, panY: 0 });
  }, []);

  return {
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
    resetTransform,
  };
}
