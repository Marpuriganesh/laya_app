import { useState, useCallback, useId, useRef, type FC } from "react";
import {
  Activity,
  Maximize2,
  Compass,
  Gauge,
  Shuffle,
  Ruler,
  Navigation,
  Pin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Droplet,
  RotateCw,
  Eye,
  CircleDot,
} from "lucide-react";
import { CurveEditor } from "@/ui/components/CurveEditor";
import {
  createLinearCurve,
  createSCurve,
  generateCurveLookupTable256,
  type CurvePoint,
} from "@/engine/math/dynamics_curve";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { globalDrawingEngine } from "@/engine/drawing_engine_instance";
import { useBrushStore } from "@/ui/stores/brush_store";

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
  | "stroke_direction"
  | "initial_stroke_direction"
  | "velocity"
  | "distance"
  | "random";

export type CalculationMode = "multiply" | "add" | "max" | "min";

export interface SensorDynamicsState {
  enabled: boolean;
  minOutput: number;
  maxOutput: number;
  curvePoints: CurvePoint[];
}

export interface ParameterMultiDynamicsState {
  enabled: boolean;
  selectedSensor: SensorTypeId;
  calculationMode: CalculationMode;
  sensors: Record<SensorTypeId, SensorDynamicsState>;
}

export interface BrushDynamicsPanelProps {
  initialState?: Partial<Record<DynamicsParameterId, ParameterMultiDynamicsState>>;
  onChange?: (state: Record<DynamicsParameterId, ParameterMultiDynamicsState>) => void;
  className?: string;
}

interface ParameterMeta {
  id: DynamicsParameterId;
  label: string;
  description: string;
  icon: FC<{ className?: string }>;
  defaultSensor: SensorTypeId;
  defaultCurve: () => CurvePoint[];
}

const PARAMETERS: readonly ParameterMeta[] = [
  {
    id: "size",
    label: "Size",
    description: "Modulates brush diameter",
    icon: Maximize2,
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "opacity",
    label: "Opacity",
    description: "Modulates stroke transparency",
    icon: Eye,
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "flow",
    label: "Flow",
    description: "Modulates per-dab paint accumulation",
    icon: Droplet,
    defaultSensor: "pressure",
    defaultCurve: createSCurve,
  },
  {
    id: "softness",
    label: "Softness",
    description: "Modulates radial tip blur and feathering",
    icon: CircleDot,
    defaultSensor: "pressure",
    defaultCurve: createLinearCurve,
  },
  {
    id: "angle",
    label: "Rotation",
    description: "Modulates tip rotation angle",
    icon: RotateCw,
    defaultSensor: "stroke_direction",
    defaultCurve: createLinearCurve,
  },
  {
    id: "jitter",
    label: "Scatter",
    description: "Randomizes dab position offset",
    icon: Shuffle,
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
  { id: "tilt_elevation", label: "Tilt Elevation", icon: Maximize2, description: "Stylus angle relative to canvas" },
  { id: "tilt_azimuth", label: "Tilt Direction", icon: Compass, description: "Stylus compass rotation heading" },
  { id: "stroke_direction", label: "Stroke Direction", icon: Navigation, description: "Instantaneous stroke movement tangent angle" },
  { id: "initial_stroke_direction", label: "Initial Direction", icon: Pin, description: "Initial stroke direction locked at stroke start" },
  { id: "velocity", label: "Speed", icon: Gauge, description: "Instantaneous stroke speed" },
  { id: "distance", label: "Distance", icon: Ruler, description: "Cyclic distance along stroke" },
  { id: "random", label: "Fuzzy Dab", icon: Shuffle, description: "Organic random noise per dab" },
];

function createBlankSensorState(enabled = false): SensorDynamicsState {
  return {
    enabled,
    minOutput: 0.0,
    maxOutput: 1.0,
    curvePoints: createLinearCurve(),
  };
}

function createDefaultDynamicsState(): Record<DynamicsParameterId, ParameterMultiDynamicsState> {
  const active = globalDrawingEngine.getActiveBrush?.();
  const p = active?.engineParameters && active.engineParameters.engineId === "pixelbrush" ? active.engineParameters : null;

  const sizeDyn = p?.sizeDynamics;
  const opDyn = p?.opacityDynamics;
  const scatterDyn = p?.scatterDynamics;
  const scatterAmp = typeof p?.scatterAmplitude === "number" ? p.scatterAmplitude : 0;
  const multiDyn = p?.multiDynamics;

  const createParamState = (
    paramId: DynamicsParameterId,
    defaultPrimary: SensorTypeId,
    isParamEnabledByDefault: boolean,
    existingLegacyDyn: any
  ): ParameterMultiDynamicsState => {
    const existingMulti = multiDyn?.[paramId];
    const isMasterEnabled = existingMulti ? true : (existingLegacyDyn ? existingLegacyDyn.isEnabled : isParamEnabledByDefault);
    const calcMode: CalculationMode = (existingMulti?.calculationMode as CalculationMode) ?? "multiply";

    const sensors: Record<SensorTypeId, SensorDynamicsState> = {
      pressure: createBlankSensorState(false),
      tilt_elevation: createBlankSensorState(false),
      tilt_azimuth: createBlankSensorState(false),
      stroke_direction: createBlankSensorState(false),
      initial_stroke_direction: createBlankSensorState(false),
      velocity: createBlankSensorState(false),
      distance: createBlankSensorState(false),
      random: createBlankSensorState(false),
    };

    if (existingMulti?.sensors) {
      for (const [sKey, sVal] of Object.entries(existingMulti.sensors)) {
        if (sVal && sKey in sensors) {
          sensors[sKey as SensorTypeId] = {
            enabled: sVal.isEnabled,
            minOutput: sVal.minOutput ?? 0.0,
            maxOutput: sVal.maxOutput ?? 1.0,
            curvePoints: sVal.curvePoints && sVal.curvePoints.length >= 2
              ? sVal.curvePoints.map((pt) => ({ x: pt.inputValue, y: pt.outputValue }))
              : createLinearCurve(),
          };
        }
      }
    } else if (existingLegacyDyn) {
      const sId = (existingLegacyDyn.sensorInput as SensorTypeId) ?? defaultPrimary;
      if (sId in sensors) {
        sensors[sId] = {
          enabled: existingLegacyDyn.isEnabled,
          minOutput: 0.0,
          maxOutput: paramId === "jitter" && scatterAmp > 0 ? scatterAmp : 1.0,
          curvePoints: existingLegacyDyn.curvePoints && existingLegacyDyn.curvePoints.length >= 2
            ? existingLegacyDyn.curvePoints.map((pt: any) => ({ x: pt.inputValue, y: pt.outputValue }))
            : createLinearCurve(),
        };
      }
    } else {
      sensors[defaultPrimary] = {
        enabled: isParamEnabledByDefault,
        minOutput: 0.0,
        maxOutput: 1.0,
        curvePoints: createLinearCurve(),
      };
    }

    return {
      enabled: isMasterEnabled,
      selectedSensor: defaultPrimary,
      calculationMode: calcMode,
      sensors,
    };
  };

  return {
    size: createParamState("size", "pressure", true, sizeDyn),
    opacity: createParamState("opacity", "pressure", false, opDyn),
    flow: createParamState("flow", "pressure", false, p?.flowDynamics),
    softness: createParamState("softness", "pressure", false, null),
    angle: createParamState("angle", "stroke_direction", false, p?.angleDynamics),
    jitter: createParamState("jitter", "random", Boolean(scatterDyn?.isEnabled || scatterAmp > 0.01), scatterDyn),
  };
}

export const BrushDynamicsPanel: FC<BrushDynamicsPanelProps> = ({
  initialState,
  onChange,
  className = "",
}) => {
  const [dynamicsState, setDynamicsState] = useState<Record<DynamicsParameterId, ParameterMultiDynamicsState>>(() => {
    const base = createDefaultDynamicsState();
    if (initialState) {
      return { ...base, ...initialState };
    }
    return base;
  });

  // Track expanded accordion parameters; defaults to "size" open
  const [expandedParams, setExpandedParams] = useState<Set<DynamicsParameterId>>(() => new Set(["size"]));
  const scrollContainersRef = useRef<Record<string, HTMLDivElement | null>>({});
  const uniqueId = useId();

  const toggleExpand = (paramId: DynamicsParameterId) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      if (next.has(paramId)) {
        next.delete(paramId);
      } else {
        next.add(paramId);
      }
      return next;
    });
  };

  // Sync parameter curve and 256-LUT directly to Rust (Desktop AppKit) and Wasm (Browser)
  const syncToEngines = useCallback(
    (paramId: DynamicsParameterId, paramState: ParameterMultiDynamicsState) => {
      for (const s of SENSORS) {
        const sensorConfig = paramState.sensors[s.id];
        const isSensorActive = paramState.enabled && sensorConfig.enabled;
        const lut = generateCurveLookupTable256(sensorConfig.curvePoints);

        // Desktop Tauri Rust core bridge
        void globalRustBrushBridge.setDynamicsMapping(
          paramId,
          isSensorActive,
          s.id,
          sensorConfig.minOutput,
          sensorConfig.maxOutput,
          lut
        );

        // Browser Web Wasm core bridge
        globalWasmBrushBridge.setDynamicsMapping(
          paramId,
          isSensorActive,
          s.id,
          sensorConfig.minOutput,
          sensorConfig.maxOutput,
          lut
        );
      }

      // Sync calculation mode
      void globalRustBrushBridge.setDynamicsCalculationMode(paramId, paramState.calculationMode);
      globalWasmBrushBridge.setDynamicsCalculationMode(paramId, paramState.calculationMode);

      // Sync into active preset for storage and live previews
      const anySensorActive = Object.values(paramState.sensors).some((s) => s.enabled);
      const activeSensorId = paramState.selectedSensor;
      const activeSensorConfig = paramState.sensors[activeSensorId];

      const multiSensorsMap: Record<string, any> = {};
      for (const [sId, sVal] of Object.entries(paramState.sensors)) {
        multiSensorsMap[sId] = {
          isEnabled: sVal.enabled,
          minOutput: sVal.minOutput,
          maxOutput: sVal.maxOutput,
          curvePoints: sVal.curvePoints.map((p) => ({ inputValue: p.x, outputValue: p.y })),
        };
      }

      const activeBrush = globalDrawingEngine.getActiveBrush?.();
      const existingMulti = activeBrush?.engineParameters && activeBrush.engineParameters.engineId === "pixelbrush"
        ? (activeBrush.engineParameters.multiDynamics ?? {})
        : {};

      const updatedMultiDynamics = {
        ...existingMulti,
        [paramId]: {
          calculationMode: paramState.calculationMode,
          sensors: multiSensorsMap,
        },
      };

      if (paramId === "jitter") {
        globalDrawingEngine.updateActivePreset?.({
          scatterAmplitude: paramState.enabled && anySensorActive ? activeSensorConfig.maxOutput : 0,
          scatterDynamics: {
            sensorInput: activeSensorId,
            curvePoints: activeSensorConfig.curvePoints.map((p) => ({ inputValue: p.x, outputValue: p.y })),
            isEnabled: paramState.enabled && anySensorActive,
          },
          multiDynamics: updatedMultiDynamics,
        });
      } else if (paramId === "size") {
        globalDrawingEngine.updateActivePreset?.({
          sizeDynamics: {
            sensorInput: activeSensorId,
            curvePoints: activeSensorConfig.curvePoints.map((p) => ({ inputValue: p.x, outputValue: p.y })),
            isEnabled: paramState.enabled && anySensorActive,
          },
          multiDynamics: updatedMultiDynamics,
        });
      } else if (paramId === "opacity") {
        globalDrawingEngine.updateActivePreset?.({
          opacityDynamics: {
            sensorInput: activeSensorId,
            curvePoints: activeSensorConfig.curvePoints.map((p) => ({ inputValue: p.x, outputValue: p.y })),
            isEnabled: paramState.enabled && anySensorActive,
          },
          multiDynamics: updatedMultiDynamics,
        });
      } else {
        globalDrawingEngine.updateActivePreset?.({
          multiDynamics: updatedMultiDynamics,
        });
      }

      const activeId = useBrushStore.getState().activePresetId;
      useBrushStore.getState().markPresetDirty(activeId, {
        multiDynamics: updatedMultiDynamics,
      });
      useBrushStore.getState().bumpBrushSettingsRevision();
    },
    []
  );

  const updateParamState = (
    paramId: DynamicsParameterId,
    updater: (prev: ParameterMultiDynamicsState) => ParameterMultiDynamicsState
  ) => {
    setDynamicsState((prev) => {
      const next = {
        ...prev,
        [paramId]: updater(prev[paramId]),
      };
      onChange?.(next);
      syncToEngines(paramId, next[paramId]);
      return next;
    });
  };

  const scrollSensors = (paramId: string, direction: "left" | "right") => {
    const el = scrollContainersRef.current[paramId];
    if (el) {
      el.scrollBy({
        left: direction === "left" ? -120 : 120,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={`flex flex-col gap-2.5 w-full max-w-full select-none ${className}`}>
      {PARAMETERS.map((param) => {
        const paramState = dynamicsState[param.id];
        const isExpanded = expandedParams.has(param.id);
        const isMasterEnabled = paramState.enabled;
        const activeSensorsCount = Object.values(paramState.sensors).filter((s) => s.enabled).length;
        const selectedSensorState = paramState.sensors[paramState.selectedSensor];
        const selectedSensorMeta = SENSORS.find((s) => s.id === paramState.selectedSensor) ?? SENSORS[0];
        const ParamIcon = param.icon;

        return (
          <div
            key={param.id}
            className={`rounded-xl border transition-all duration-150 overflow-hidden ${
              isExpanded
                ? "bg-white dark:bg-zinc-800/60 border-zinc-300 dark:border-white/10 shadow-xs"
                : "bg-zinc-50/80 dark:bg-zinc-800/30 border-zinc-200/80 dark:border-white/5 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
            }`}
          >
            {/* Accordion Dropdown Header */}
            <div
              onClick={() => toggleExpand(param.id)}
              className="flex items-center justify-between p-3 cursor-pointer select-none"
              title={`${isExpanded ? "Collapse" : "Expand"} ${param.label} Dynamics options`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                )}
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  isMasterEnabled
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                }`}>
                  <ParamIcon className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {param.label} Dynamics
                  </span>
                  {isMasterEnabled && activeSensorsCount > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold shrink-0">
                      {activeSensorsCount} {activeSensorsCount === 1 ? "Sensor" : "Sensors"}
                    </span>
                  )}
                </div>
              </div>

              {/* Independent Normal Enable/Disable Toggle Switch */}
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                  <span className="text-[11px] hidden xs:inline">{isMasterEnabled ? "Enabled" : "Disabled"}</span>
                  <input
                    type="checkbox"
                    checked={isMasterEnabled}
                    onChange={(e) => {
                      updateParamState(param.id, (prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }));
                    }}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                    title={`Enable or disable ${param.label} dynamics`}
                    aria-label={`Enable or disable ${param.label} dynamics`}
                  />
                </label>
              </div>
            </div>

            {/* Expanded Full-Width Settings Body (Zero Cramping!) */}
            {isExpanded && (
              <div className="p-3 pt-0 border-t border-zinc-100 dark:border-white/5 flex flex-col gap-3 animate-in fade-in duration-100">
                {/* Calculation Mode Selector Bar */}
                <div className="flex items-center justify-between gap-2 pt-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400 font-medium">Combination Mode:</span>
                  <select
                    value={paramState.calculationMode}
                    onChange={(e) =>
                      updateParamState(param.id, (prev) => ({
                        ...prev,
                        calculationMode: e.target.value as CalculationMode,
                      }))
                    }
                    className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs rounded-lg px-2.5 py-1 border border-zinc-200 dark:border-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Method used to combine multiple active sensor curves"
                  >
                    <option value="multiply">Multiply (Default)</option>
                    <option value="add">Addition</option>
                    <option value="max">Maximum</option>
                    <option value="min">Minimum</option>
                  </select>
                </div>

                {/* Sensor Tabs Carousel Row */}
                <div className="relative flex items-center w-full max-w-full">
                  <button
                    type="button"
                    onClick={() => scrollSensors(param.id, "left")}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer shrink-0 mr-1"
                    title="Scroll sensors left"
                    aria-label="Scroll sensors left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div
                    ref={(el) => {
                      scrollContainersRef.current[param.id] = el;
                    }}
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth flex-1 py-1"
                  >
                    {SENSORS.map((s) => {
                      const isSelected = paramState.selectedSensor === s.id;
                      const isChecked = paramState.sensors[s.id].enabled;
                      const Icon = s.icon;

                      return (
                        <div
                          key={s.id}
                          onClick={() =>
                            updateParamState(param.id, (prev) => ({
                              ...prev,
                              selectedSensor: s.id,
                            }))
                          }
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border shrink-0 select-none ${
                            isSelected
                              ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold"
                              : isChecked
                              ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200"
                              : "bg-transparent border-transparent text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
                          }`}
                          title={`Click to edit curve for ${s.label} (${isChecked ? "Active" : "Inactive"})`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newEnabled = e.target.checked;
                              updateParamState(param.id, (prev) => ({
                                ...prev,
                                selectedSensor: s.id,
                                sensors: {
                                  ...prev.sensors,
                                  [s.id]: {
                                    ...prev.sensors[s.id],
                                    enabled: newEnabled,
                                  },
                                },
                              }));
                            }}
                            className="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer shrink-0"
                            title={`Toggle ${s.label} sensor for ${param.label}`}
                          />
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">{s.label}</span>
                          {isChecked && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => scrollSensors(param.id, "right")}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer shrink-0 ml-1"
                    title="Scroll sensors right"
                    aria-label="Scroll sensors right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Full-Width CurveEditor for Active Sensor */}
                <div className="w-full max-w-full overflow-hidden">
                  <CurveEditor
                    key={`${uniqueId}-${param.id}-${paramState.selectedSensor}`}
                    value={selectedSensorState.curvePoints}
                    onChange={(nextPoints) =>
                      updateParamState(param.id, (prev) => ({
                        ...prev,
                        sensors: {
                          ...prev.sensors,
                          [prev.selectedSensor]: {
                            ...prev.sensors[prev.selectedSensor],
                            curvePoints: nextPoints,
                          },
                        },
                      }))
                    }
                    inputLabel={selectedSensorMeta.label}
                    outputLabel={`${param.label} Output`}
                    showLiveTelemetry={true}
                    showPresets={true}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
