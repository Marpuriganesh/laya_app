import { type FC, type ChangeEvent } from "react";
import {
  GAMUT_MASK_PRESETS,
  type GamutMaskType,
} from "@/engine/color/gamut_mask";
import { useDocumentStore } from "@/ui/hooks/useDocumentStore";

export const GamutMaskPanelContent: FC = () => {
  const { gamutMask, setGamutMask } = useDocumentStore();

  const handleToggle = () => {
    setGamutMask({ enabled: !gamutMask.enabled });
  };

  const handleTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value as GamutMaskType;
    setGamutMask({ type: nextType, enabled: true });
  };

  const handleRotationChange = (e: ChangeEvent<HTMLInputElement>) => {
    setGamutMask({ rotation: Number(e.target.value) });
  };

  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    setGamutMask({ opacity: parseFloat(e.target.value) });
  };

  const currentPreset = GAMUT_MASK_PRESETS.find((p) => p.id === gamutMask.type);

  return (
    <div className="flex flex-col gap-3 p-3.5 bg-zinc-950 text-zinc-100 select-none h-full">
      {/* Top Toggle Switch */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <span className="text-xs font-semibold text-zinc-200">Gamut Constraint</span>
        <button
          type="button"
          onClick={handleToggle}
          className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors cursor-pointer ${
            gamutMask.enabled
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {gamutMask.enabled ? "ACTIVE" : "DISABLED"}
        </button>
      </div>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-zinc-400 font-medium">Harmonic Shape Preset</label>
        <select
          value={gamutMask.type}
          onChange={handleTypeChange}
          className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:border-blue-400/80 cursor-pointer"
        >
          {GAMUT_MASK_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id} className="bg-zinc-900 text-zinc-200">
              {preset.name}
            </option>
          ))}
        </select>
        {currentPreset && (
          <p className="text-[10px] text-zinc-400 italic leading-relaxed">
            {currentPreset.description}
          </p>
        )}
      </div>

      {/* Mask Rotation Slider */}
      <div className="flex flex-col gap-1 pt-2 border-t border-zinc-800/60">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <span>Mask Angle</span>
          <span className="text-blue-400 font-semibold">{gamutMask.rotation}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          step="1"
          value={gamutMask.rotation}
          onChange={handleRotationChange}
          aria-label="Gamut mask rotation angle"
          className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
        />

        {/* Quick Cardinal Angles */}
        <div className="flex items-center justify-between pt-1 text-[10px]">
          <span className="text-zinc-500 font-medium">Quick Cardinal:</span>
          <div className="flex gap-1.5">
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => setGamutMask({ rotation: deg, enabled: true })}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  gamutMask.rotation === deg
                    ? "bg-blue-500/20 text-blue-300 border border-blue-400/40"
                    : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mask Boundary Opacity Slider */}
      <div className="flex flex-col gap-1 pt-2 border-t border-zinc-800/60">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <span>Boundary Opacity</span>
          <span className="text-blue-400 font-semibold">
            {Math.round(gamutMask.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.05"
          max="1.0"
          step="0.05"
          value={gamutMask.opacity}
          onChange={handleOpacityChange}
          aria-label="Gamut mask boundary opacity"
          className="w-full accent-blue-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
        />
      </div>
    </div>
  );
};
