import type { FC } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";

interface BrushSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor?: string;
  onDetach?: () => void;
}

export const BrushSettingsPopover: FC<BrushSettingsPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  return (
    <FloatingWindowPanel
      title="Brush Settings"
      icon={<SlidersHorizontal className="w-4 h-4 text-zinc-300" />}
      isOpen={isOpen}
      onClose={onClose}
      width={300}
      height={320}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-4 top-16"
    >
      <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-zinc-400 h-full select-none">
        <SlidersHorizontal className="w-8 h-8 text-zinc-600 mb-1" />
        <p className="text-sm font-medium text-zinc-200">Brush Settings</p>
        <p className="text-xs text-zinc-500">
          Clean slate ready for Rust brush dynamics & presets.
        </p>
      </div>
    </FloatingWindowPanel>
  );
};
