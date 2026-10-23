/**
 * Brush Library Popover
 * Spacious floating window displaying categorized brush presets with Procreate-style
 * live stroke previews and gear icons to open the Brush Studio without closing the library.
 */

import type { FC } from "react";
import { Brush } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { BrushLibraryContent } from "@/ui/components/BrushLibraryContent";
import type { BrushPreset } from "@/types/brush";

interface BrushLibraryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset?: (presetName: string) => void;
  onOpenSettings?: (preset?: BrushPreset) => void;
  onDetach?: () => void;
  activeColor?: string;
}

export const BrushLibraryPopover: FC<BrushLibraryPopoverProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onDetach,
  activeColor,
}) => {
  return (
    <FloatingWindowPanel
      title="Brush Library"
      icon={<Brush className="w-4 h-4 text-blue-500" />}
      isOpen={isOpen}
      onClose={onClose}
      width={480}
      height={620}
      initialOffset={{ x: -260, y: 0 }}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-6 top-16"
    >
      <div className="h-145 w-full flex flex-col">
        <BrushLibraryContent
          onOpenSettings={onOpenSettings}
          activeColor={activeColor}
        />
      </div>
    </FloatingWindowPanel>
  );
};
