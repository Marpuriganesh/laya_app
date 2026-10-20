import type { FC } from "react";
import { Layers } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";

interface LayersPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LayersPopover: FC<LayersPopoverProps> = ({ isOpen, onClose }) => {
  return (
    <FloatingWindowPanel
      title="Layers"
      icon={<Layers className="w-4 h-4 text-zinc-300" />}
      isOpen={isOpen}
      onClose={onClose}
      width={280}
      height={220}
      anchorClassName="fixed right-4 top-16"
    >
      <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-zinc-400 h-full select-none">
        <Layers className="w-8 h-8 text-zinc-600 mb-1" />
        <p className="text-sm font-medium text-zinc-200">Layers</p>
        <p className="text-xs text-zinc-500">
          Clean slate ready for Rust sparse-tile non-destructive layer stack.
        </p>
      </div>
    </FloatingWindowPanel>
  );
};
