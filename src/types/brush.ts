/**
 * Brush Preset & Dynamics Contracts
 * Defines the schema for brush presets, sensor dynamics mappings, and engine configurations.
 * Aligned with Krita's .kpp XML schema and Photoshop ABR brush definitions.
 */

/**
 * Sensor inputs that can drive brush dynamics parameters.
 * Directly mirrors Krita's <param name="..."> dynamics bindings.
 */
export type SensorInputName =
  | "pressure"
  | "tiltX"
  | "tiltY"
  | "speed"
  | "rotation"
  | "random"
  | "distance"
  | "fade";

/**
 * A single control point on a dynamics response curve.
 * Curves map normalized sensor input (0.0 to 1.0) to normalized parameter scaling (0.0 to 1.0).
 */
export interface DynamicsCurvePoint {
  readonly inputValue: number;   // 0.0 to 1.0 on sensor axis
  readonly outputValue: number;  // 0.0 to 1.0 on output axis
}

/**
 * A dynamics mapping linking a physical sensor to a brush parameter via a response curve.
 */
export interface DynamicsMapping {
  readonly sensorInput: SensorInputName;
  readonly curvePoints: readonly DynamicsCurvePoint[];
  readonly isEnabled: boolean;
}

/**
 * Tip shape type: generated algorithmic shape or predefined raster bitmap.
 */
export type BrushTipType = "generated" | "predefined" | "text";

/**
 * Procedurally generated brush tip (e.g., circular Gaussian, elliptical, or polygonal).
 */
export interface GeneratedBrushTip {
  readonly tipType: "generated";
  readonly diameter: number;          // Base tip diameter in pixels
  readonly hardness: number;          // 0.0 (fully soft/Gaussian) to 1.0 (hard edge)
  readonly aspectRatio: number;       // 1.0 = circular; < 1.0 = elliptical
  readonly angleRadians: number;      // Fixed tip rotation angle in radians
}

/**
 * Predefined raster tip mask (e.g. from Photoshop .abr or Krita .gbr).
 */
export interface PredefinedBrushTip {
  readonly tipType: "predefined";
  readonly imageData: Uint8ClampedArray;  // 8-bit grayscale alpha mask
  readonly width: number;
  readonly height: number;
}

export type BrushTip = GeneratedBrushTip | PredefinedBrushTip;

/**
 * Selectable stroke smoothing algorithm.
 */
export type SmoothingMode = "streamline" | "movingAverage" | "predictiveBezier" | "none";

/**
 * Configuration options for the stroke smoothing pipeline.
 */
export interface StrokeSmoothingConfig {
  readonly mode: SmoothingMode;
  /** Streamline: catch-up pull string radius in pixels (1 to 150, default 20) */
  readonly streamlineStringRadiusPx: number;
  /** Streamline: base smoothing factor at zero velocity (0.0 to 1.0, default 0.1) */
  readonly streamlineBaseSmoothing: number;
  /** Streamline: max smoothing factor at high velocity (0.0 to 1.0, default 0.9) */
  readonly streamlineMaxSmoothing: number;
  /** Streamline: speed threshold where smoothing reaches maximum in px/sec (default 400) */
  readonly streamlineVelocityThresholdPxPerSec: number;
  /** Moving Average: sliding window point count (2 to 20, default 6) */
  readonly movingAverageWindowSize: number;
  /** Predictive Bézier: number of frames ahead to extrapolate (1 to 4, default 2) */
  readonly predictiveLookAheadFrames: number;
}

/**
 * Parameter block for Krita's Pixel Brush engine (paintopid="pixelbrush").
 */
export interface PixelBrushParameters {
  readonly engineId: "pixelbrush";
  readonly brushTip: BrushTip;
  readonly spacingFraction: number;       // Dab spacing as fraction of diameter (e.g. 0.1 = 10%)
  readonly baseOpacity: number;           // 0.0 to 1.0
  readonly baseFlow: number;              // 0.0 to 1.0
  readonly baseSizePx: number;            // Nominal brush diameter in pixels
  readonly softness: number;              // Tip edge softness 0.0 to 1.0
  readonly scatterAmplitude: number;      // Random displacement amplitude
  readonly isAirbrushMode: boolean;       // Continuous spray while pointer stationary
  readonly sizeDynamics: DynamicsMapping | null;
  readonly opacityDynamics: DynamicsMapping | null;
  readonly flowDynamics: DynamicsMapping | null;
  readonly angleDynamics: DynamicsMapping | null;
  readonly scatterDynamics: DynamicsMapping | null;
}

/**
 * Parameter block for Krita's Color Smudge engine (paintopid="colorsmudge").
 */
export interface ColorSmudgeParameters {
  readonly engineId: "colorsmudge";
  readonly brushTip: BrushTip;
  readonly spacingFraction: number;
  readonly baseOpacity: number;
  readonly baseSizePx: number;
  readonly smudgeMode: "smearing" | "dulling";
  readonly colorRate: number;             // 0.0 to 1.0: foreground color injection rate
  readonly smudgeLength: number;          // 0.0 to 1.0: how far sampled color smears
  readonly smudgeRadius: number;          // In pixels
  readonly sampleAllLayers: boolean;
  readonly sizeDynamics: DynamicsMapping | null;
  readonly opacityDynamics: DynamicsMapping | null;
  readonly smudgeRateDynamics: DynamicsMapping | null;
}

/**
 * Parameter block for MyPaint natural media engine (paintopid="mypaint").
 */
export interface MyPaintParameters {
  readonly engineId: "mypaint";
  readonly mybJsonContent: string;        // Raw JSON string from .myb preset file
  readonly brushName: string;
}

export type BrushEngineParameters =
  | PixelBrushParameters
  | ColorSmudgeParameters
  | MyPaintParameters;

/**
 * Fully-resolved brush preset ready for consumption by DrawingAppEngine.
 */
export interface BrushPreset {
  readonly presetId: string;
  readonly displayName: string;
  readonly engineType: "pixelbrush" | "colorsmudge" | "mypaint";
  readonly thumbnailPngData: Uint8Array | null;
  readonly engineParameters: BrushEngineParameters;
  readonly smoothingConfig: StrokeSmoothingConfig;
  readonly tags: readonly string[];
}
