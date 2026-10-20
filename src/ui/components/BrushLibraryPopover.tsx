import type { FC } from "react";
import { Brush } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";

interface BrushLibraryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset?: (presetName: string) => void;
  onOpenSettings?: () => void;
  onDetach?: () => void;
}

export const BrushLibraryPopover: FC<BrushLibraryPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  return (
    <FloatingWindowPanel
      title="Brush Library"
      icon={<Brush className="w-4 h-4 text-zinc-300" />}
      isOpen={isOpen}
      onClose={onClose}
      width={300}
      height={320}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-4 top-16"
    >
      <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-zinc-400 h-full select-none">
        <Brush className="w-8 h-8 text-zinc-600 mb-1" />
        <p className="text-sm font-medium text-zinc-200">Brush Library</p>
        <p className="text-xs text-zinc-500">
          Clean slate ready for Rust-powered preset library.
        </p>
      </div>
    </FloatingWindowPanel>
  );
};
