import type { FC } from "react";
import { Layers } from "lucide-react";
import { FloatingWindowPanel } from "@/ui/components/FloatingWindowPanel";
import { LayersPanelContent } from "@/ui/components/LayersPanelContent";

interface LayersPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onDetach?: () => void;
}

export const LayersPopover: FC<LayersPopoverProps> = ({
  isOpen,
  onClose,
  onDetach,
}) => {
  return (
    <FloatingWindowPanel
      title="Layers"
      icon={<Layers className="w-4 h-4 text-zinc-300" />}
      isOpen={isOpen}
      onClose={onClose}
      width={320}
      height={440}
      allowPopout={true}
      onPopout={onDetach}
      anchorClassName="fixed right-4 top-16"
    >
      <LayersPanelContent />
    </FloatingWindowPanel>
  );
};
