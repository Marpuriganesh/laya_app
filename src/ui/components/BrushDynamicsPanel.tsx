import { useState, useCallback, useId, type FC } from "react";
import {
  Activity,
  Maximize2,
  Compass,
  Gauge,
  Shuffle,
  Ruler,
} from "lucide-react";
import {
  CurveEditor,
} from "@/ui/components/CurveEditor";
import {
  createLinearCurve,
  createSCurve,
  generateCurveLookupTable256,
  type CurvePoint,
} from "@/engine/math/dynamics_curve";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";

export type DynamicsParameterId =
  | "size"
  | "opacity"
  | "flow"
  | "softness"
  | "angle"
  | "jitter";

export type SensorTypeId =
  | "pressure"
  | "tilt_elevation"
  | "tilt_azimuth"
  | "velocity"
  | "distance"
  | "random";

export interface ParameterDynamicsState {
  enabled: boolean;
  sensor: SensorTypeId;
  minOutput: number;
  maxOutput: number;
  curvePoints: CurvePoint[];
}

export interface BrushDynamicsPanelProps {
  initialState?: Partial<Record<DynamicsParameterId, ParameterDynamicsState>>;
  onChange?: (state: Record<DynamicsParameterId, ParameterDynamicsState>) => void;
  className?: string;
}

interface ParameterMeta {
  id: DynamicsParameterId;
  label: string;
  description: string;
  defaultSensor: SensorTypeId;
  defaultCurve: () => CurvePoint[];
}

const PARAMETERS: readonly ParameterMeta[] = [
  {
    id: "size",
    label: "Size",
    description: "Modulates brush diameter",
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "opacity",
    label: "Opacity",
    description: "Modulates stroke transparency",
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "flow",
    label: "Flow",
    description: "Modulates per-dab paint accumulation",
    defaultSensor: "pressure",
    defaultCurve: createSCurve,
  },
  {
    id: "softness",
    label: "Softness",
    description: "Modulates radial tip blur and feathering",
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "angle",
    label: "Rotation",
    description: "Modulates tip rotation angle",
    defaultSensor: "tilt_azimuth",
    defaultCurve: createLinearCurve,
  },
  {
    id: "jitter",
    label: "Scatter",
    description: "Randomizes dab position offset",
    defaultSensor: "random",
    defaultCurve: createLinearCurve,
  },
];

interface SensorMeta {
  id: SensorTypeId;
  label: string;
  icon: FC<{ className?: string }>;
  description: string;
}

const SENSORS: readonly SensorMeta[] = [
  { id: "pressure", label: "Pressure", icon: Activity, description: "Stylus tip pressure (0.0 to 1.0)" },
  { id: "tilt_elevation", label: "Tilt Elev.", icon: Maximize2, description: "Stylus angle relative to canvas" },
  { id: "tilt_azimuth", label: "Tilt Dir.", icon: Compass, description: "Stylus compass rotation heading" },
  { id: "velocity", label: "Speed", icon: Gauge, description: "Instantaneous stroke speed" },
  { id: "distance", label: "Distance", icon: Ruler, description: "Cyclic distance along stroke" },
  { id: "random", label: "Fuzzy", icon: Shuffle, description: "Organic random noise per dab" },
];

function createDefaultDynamicsState(): Record<DynamicsParameterId, ParameterDynamicsState> {
  return {
    size: {
      enabled: false,
      sensor: "pressure",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createLinearCurve(),
    },
    opacity: {
      enabled: false,
      sensor: "pressure",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createLinearCurve(),
    },
    flow: {
      enabled: false,
      sensor: "pressure",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createSCurve(),
    },
    softness: {
      enabled: false,
      sensor: "pressure",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createLinearCurve(),
    },
    angle: {
      enabled: false,
      sensor: "tilt_azimuth",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createLinearCurve(),
    },
    jitter: {
      enabled: false,
      sensor: "random",
      minOutput: 0.0,
      maxOutput: 1.0,
      curvePoints: createLinearCurve(),
    },
  };
}

export const BrushDynamicsPanel: FC<BrushDynamicsPanelProps> = ({
  initialState,
  onChange,
  className = "",
}) => {
  const [selectedParam, setSelectedParam] = useState<DynamicsParameterId>("size");
  const [dynamicsState, setDynamicsState] = useState<Record<DynamicsParameterId, ParameterDynamicsState>>(() => {
    const base = createDefaultDynamicsState();
    if (initialState) {
      return { ...base, ...initialState };
    }
    return base;
  });

  const uniqueId = useId();

  // Sync parameter curve and 256-LUT directly to Rust (Desktop AppKit) and Wasm (Browser)
  const syncToEngines = useCallback(
    (paramId: DynamicsParameterId, paramState: ParameterDynamicsState) => {
      const lut = generateCurveLookupTable256(paramState.curvePoints);

      // Desktop Tauri Rust core bridge
      globalRustBrushBridge.setDynamicsMapping(
        paramId,
        paramState.enabled,
        paramState.sensor,
        paramState.minOutput,
        paramState.maxOutput,
        lut
      );

      // Browser Web Wasm core bridge
      globalWasmBrushBridge.setDynamicsMapping(
        paramId,
        paramState.enabled,
        paramState.sensor,
        paramState.minOutput,
        paramState.maxOutput,
        lut
      );
    },
    []
  );

  const updateParamState = useCallback(
    (paramId: DynamicsParameterId, updater: (prev: ParameterDynamicsState) => ParameterDynamicsState) => {
      setDynamicsState((prev) => {
        const nextParamState = updater(prev[paramId]);
        const nextFullState = { ...prev, [paramId]: nextParamState };
        syncToEngines(paramId, nextParamState);
        onChange?.(nextFullState);
        return nextFullState;
      });
    },
    [syncToEngines, onChange]
  );

  const activeParamState = dynamicsState[selectedParam];
  const activeMeta = PARAMETERS.find((p) => p.id === selectedParam) ?? PARAMETERS[0];

  return (
    <div className={`w-full max-w-full overflow-hidden flex flex-col gap-2.5 select-none text-zinc-800 dark:text-zinc-200 ${className}`}>
      {/* 2-Column Responsive Layout strictly contained without canvas spilling */}
      <div className="flex gap-2.5 w-full max-w-full overflow-hidden min-h-[280px]">
        {/* Left Column: Properties Sidebar */}
        <div className="w-28 shrink-0 flex flex-col gap-0.5 pr-2 border-r border-zinc-200 dark:border-white/5">
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-2 py-0.5">
            Settings
          </span>

          {PARAMETERS.map((param) => {
            const isSelected = selectedParam === param.id;
            const isEnabled = dynamicsState[param.id].enabled;

            return (
              <div
                key={param.id}
                onClick={() => setSelectedParam(param.id)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateParamState(param.id, (prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }));
                    }}
                    className="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer shrink-0"
                    title={`Enable dynamics for ${param.label}`}
                  />
                  <span className="truncate">{param.label}</span>
                </div>

                {isEnabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Dynamic Sensor & Krita Curve Editor */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0 overflow-hidden">
          {/* Header Bar: Toggle + Strength Slider */}
          <div className="flex items-center justify-between gap-2 p-1.5 px-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-white/5">
            <label className="flex items-center gap-2 cursor-pointer min-w-0" title={`Toggle dynamics for ${activeMeta.label}`}>
              <input
                type="checkbox"
                checked={activeParamState.enabled}
                onChange={(e) =>
                  updateParamState(selectedParam, (prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
                className="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer shrink-0"
              />
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {activeMeta.label} Dynamics
              </span>
            </label>

            {/* Strength Slider */}
            <div
              className="flex items-center gap-1.5 shrink-0"
              title={`Dynamics modulation strength: ${Math.round(activeParamState.maxOutput * 100)}%`}
            >
              <Gauge className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="range"
                min={0}
                max={1.0}
                step={0.05}
                value={activeParamState.maxOutput}
                onChange={(e) =>
                  updateParamState(selectedParam, (prev) => ({
                    ...prev,
                    maxOutput: Number(e.target.value),
                  }))
                }
                className="w-16 accent-blue-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] font-mono text-zinc-500 w-7 text-right">
                {Math.round(activeParamState.maxOutput * 100)}%
              </span>
            </div>
          </div>

          {/* Modulation Sensor Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 w-full overflow-hidden">
            {SENSORS.map((s) => {
              const Icon = s.icon;
              const isSelected = activeParamState.sensor === s.id;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    updateParamState(selectedParam, (prev) => ({
                      ...prev,
                      sensor: s.id,
                    }))
                  }
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors overflow-hidden ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs font-semibold"
                      : "bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300"
                  }`}
                  title={s.description}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Embedded CurveEditor: 100% fluid & responsive */}
          <div className="w-full max-w-full overflow-hidden">
            <CurveEditor
              key={`${uniqueId}-${selectedParam}-${activeParamState.sensor}`}
              value={activeParamState.curvePoints}
              onChange={(nextPoints) =>
                updateParamState(selectedParam, (prev) => ({
                  ...prev,
                  curvePoints: nextPoints,
                }))
              }
              inputLabel={
                SENSORS.find((s) => s.id === activeParamState.sensor)?.label ?? "Sensor"
              }
              outputLabel={`${activeMeta.label}`}
              showLiveTelemetry={true}
              showPresets={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
