import { type FC } from "react";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";

export const DiscreteGridPanelContent: FC = () => {
  const { wheelConfig, setWheelConfig } = useDocumentStore();

  return (
    <div className="flex flex-col gap-3.5 p-3.5 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none h-full transition-colors">
      {/* Mode Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800/80">
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Wheel Grid Mode</span>
        <button
          type="button"
          onClick={() => setWheelConfig({ isContinuous: !wheelConfig.isContinuous })}
          className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors cursor-pointer ${
            wheelConfig.isContinuous
              ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              : "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
          }`}
        >
          {wheelConfig.isContinuous ? "Smooth (Cont)" : "Stepped (Disc)"}
        </button>
      </div>

      {/* Hue Sectors */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <span>Hue Sectors</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{wheelConfig.hueSectors}</span>
        </div>
        <input
          type="range"
          min="6"
          max="36"
          step="2"
          value={wheelConfig.hueSectors}
          onChange={(e) => setWheelConfig({ hueSectors: Number(e.target.value) })}
          aria-label="Wheel hue sectors"
          className="w-full accent-blue-500 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Saturation Rings */}
      <div className="flex flex-col gap-1 pt-1.5 border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="flex justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <span>Saturation Rings</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{wheelConfig.saturationRings}</span>
        </div>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          value={wheelConfig.saturationRings}
          onChange={(e) => setWheelConfig({ saturationRings: Number(e.target.value) })}
          aria-label="Wheel saturation rings"
          className="w-full accent-blue-500 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Value Steps */}
      <div className="flex flex-col gap-1 pt-1.5 border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="flex justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400">
          <span>Value Steps</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{wheelConfig.valueSteps}</span>
        </div>
        <input
          type="range"
          min="2"
          max="10"
          step="1"
          value={wheelConfig.valueSteps}
          onChange={(e) => setWheelConfig({ valueSteps: Number(e.target.value) })}
          aria-label="Value ladder steps"
          className="w-full accent-blue-500 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Presets */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-[11px]">
        <span className="text-zinc-500 dark:text-zinc-400 font-medium">Standard Presets:</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setWheelConfig({ hueSectors: 12, saturationRings: 3, valueSteps: 5 })}
            className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-mono transition-colors cursor-pointer"
          >
            12/3/5
          </button>
          <button
            type="button"
            onClick={() => setWheelConfig({ hueSectors: 8, saturationRings: 2, valueSteps: 4 })}
            className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-mono transition-colors cursor-pointer"
          >
            8/2/4
          </button>
          <button
            type="button"
            onClick={() => setWheelConfig({ hueSectors: 6, saturationRings: 2, valueSteps: 5 })}
            className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 text-xs font-mono transition-colors cursor-pointer"
          >
            6/2/5
          </button>
        </div>
      </div>
    </div>
  );
};
