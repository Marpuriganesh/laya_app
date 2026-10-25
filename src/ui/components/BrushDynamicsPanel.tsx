import { useState, useCallback, useId, useRef, useEffect, type FC } from "react";
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
    defaultSensor: "stroke_direction",
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

    // If multiDynamics stored, restore all saved sensors
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
      // Default initial sensor
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
    angle: createParamState("angle", "tilt_azimuth", false, p?.angleDynamics),
    jitter: createParamState("jitter", "random", Boolean(scatterDyn?.isEnabled || scatterAmp > 0.01), scatterDyn),
  };
}

export const BrushDynamicsPanel: FC<BrushDynamicsPanelProps> = ({
  initialState,
  onChange,
  className = "",
}) => {
  const [selectedParam, setSelectedParam] = useState<DynamicsParameterId>("size");
  const [dynamicsState, setDynamicsState] = useState<Record<DynamicsParameterId, ParameterMultiDynamicsState>>(() => {
    const base = createDefaultDynamicsState();
    if (initialState) {
      return { ...base, ...initialState };
    }
    return base;
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const uniqueId = useId();

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, selectedParam]);

  const handleScrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -140, behavior: "smooth" });
    setTimeout(checkScroll, 220);
  };

  const handleScrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 140, behavior: "smooth" });
    setTimeout(checkScroll, 220);
  };

  // Sync parameter curve and 256-LUT directly to Rust (Desktop AppKit) and Wasm (Browser)
  const syncToEngines = useCallback(
    (paramId: DynamicsParameterId, paramState: ParameterMultiDynamicsState) => {
      // 1. Sync all 6 sensors to both Rust and Wasm
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

      // 2. Sync calculation mode
      void globalRustBrushBridge.setDynamicsCalculationMode(paramId, paramState.calculationMode);
      globalWasmBrushBridge.setDynamicsCalculationMode(paramId, paramState.calculationMode);

      // 3. Sync into active preset for storage and live previews
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

  const activeMeta = PARAMETERS.find((p) => p.id === selectedParam) ?? PARAMETERS[0];
  const activeParamState = dynamicsState[selectedParam];
  const selectedSensorState = activeParamState.sensors[activeParamState.selectedSensor];
  const selectedSensorMeta = SENSORS.find((s) => s.id === activeParamState.selectedSensor) ?? SENSORS[0];

  return (
    <div className={`flex flex-col gap-3 w-full max-w-full overflow-hidden select-none ${className}`}>
      {/* 2-Column Responsive Layout */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-full overflow-hidden">
        {/* Left Column: Brush Parameter List */}
        <div className="w-full sm:w-36 shrink-0 flex flex-row sm:flex-col gap-1 p-1 bg-zinc-100/70 dark:bg-zinc-900/50 rounded-xl overflow-x-auto sm:overflow-visible no-scrollbar">
          {PARAMETERS.map((param) => {
            const isSelected = selectedParam === param.id;
            const paramState = dynamicsState[param.id];
            const isMasterEnabled = paramState.enabled;
            const activeSensorsCount = Object.values(paramState.sensors).filter((s) => s.enabled).length;

            return (
              <div
                key={param.id}
                onClick={() => setSelectedParam(param.id)}
                className={`group flex items-center justify-between p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  isSelected
                    ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={isMasterEnabled}
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

                {isMasterEnabled && activeSensorsCount > 0 && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold shrink-0"
                    title={`${activeSensorsCount} active sensor${activeSensorsCount > 1 ? "s" : ""}`}
                  >
                    {activeSensorsCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Dynamic Sensors & Curve Editor */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0 overflow-hidden">
          {/* Header Bar: Master Toggle + Calculation Mode */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-white/5">
            <label className="flex items-center gap-2 cursor-pointer min-w-0" title={`Toggle all dynamics for ${activeMeta.label}`}>
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
                Enable {activeMeta.label} Dynamics
              </span>
            </label>

            {/* Curves Calculation Mode Selector (Multiply / Add / Max / Min) */}
            <div className="flex items-center gap-1.5 text-xs shrink-0">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Mode:</span>
              <select
                value={activeParamState.calculationMode}
                onChange={(e) =>
                  updateParamState(selectedParam, (prev) => ({
                    ...prev,
                    calculationMode: e.target.value as CalculationMode,
                  }))
                }
                className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs rounded-md px-2 py-0.5 border border-zinc-300 dark:border-zinc-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Method used to combine multiple active sensor curves"
              >
                <option value="multiply">Multiply (Default)</option>
                <option value="add">Addition</option>
                <option value="max">Maximum</option>
                <option value="min">Minimum</option>
              </select>
            </div>
          </div>

          {/* Modulation Sensors Row with Stylus Scroll Handles */}
          <div className="relative flex items-center w-full max-w-full">
            {/* Left Scroll Handle for Stylus / Mouse */}
            <button
              type="button"
              onClick={handleScrollLeft}
              disabled={!canScrollLeft}
              className={`p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-opacity cursor-pointer shrink-0 mr-1 ${
                canScrollLeft ? "opacity-100" : "opacity-30 cursor-not-allowed"
              }`}
              title="Scroll sensors left"
              aria-label="Scroll sensors left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Scrollable sensor pills container with onWheel support */}
            <div
              ref={scrollContainerRef}
              onScroll={checkScroll}
              onWheel={(e) => {
                if (scrollContainerRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  scrollContainerRef.current.scrollLeft += e.deltaY;
                  checkScroll();
                }
              }}
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 w-full max-w-full select-none"
            >
              {SENSORS.map((s) => {
                const Icon = s.icon;
                const sensorConfig = activeParamState.sensors[s.id];
                const isChecked = sensorConfig.enabled;
                const isEditingThisCurve = activeParamState.selectedSensor === s.id;

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      // Clicking the pill selects this sensor curve for editing
                      updateParamState(selectedParam, (prev) => ({
                        ...prev,
                        selectedSensor: s.id,
                      }));
                    }}
                    className={`group flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all border ${
                      isEditingThisCurve
                        ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 shadow-xs font-semibold"
                        : "bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 border-transparent text-zinc-700 dark:text-zinc-300"
                    }`}
                    title={`Click to edit curve for ${s.label} (${isChecked ? "Active" : "Inactive"})`}
                  >
                    {/* Multi-select checkbox: toggles whether this sensor is active for the property */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        const newEnabled = e.target.checked;
                        updateParamState(selectedParam, (prev) => ({
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
                      title={`Enable ${s.label} for ${activeMeta.label}`}
                    />
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{s.label}</span>
                    {isChecked && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Active sensor modulation" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Scroll Handle for Stylus / Mouse */}
            <button
              type="button"
              onClick={handleScrollRight}
              disabled={!canScrollRight}
              className={`p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 transition-opacity cursor-pointer shrink-0 ml-1 ${
                canScrollRight ? "opacity-100" : "opacity-30 cursor-not-allowed"
              }`}
              title="Scroll sensors right"
              aria-label="Scroll sensors right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Embedded CurveEditor for Active Sensor: 100% fluid & responsive */}
          <div className="w-full max-w-full overflow-hidden">
            <CurveEditor
              key={`${uniqueId}-${selectedParam}-${activeParamState.selectedSensor}`}
              value={selectedSensorState.curvePoints}
              onChange={(nextPoints) =>
                updateParamState(selectedParam, (prev) => ({
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
