/**
 * Brush Telemetry Contracts
 * Single source of truth for raw hardware pointer events, stylus sensor telemetry,
 * kinematics, and real-time diagnostics.
 */

export type BrushTelemetrySource = "web-pointer" | "native-appkit" | "wasm";

/**
 * Complete hardware and kinematic snapshot of a single pointer/brush event.
 */
export interface PointerTelemetry {
  // Identity & Device Hardware
  readonly pointerId: number;
  readonly pointerType: "pen" | "touch" | "mouse" | "unknown";
  readonly isPrimary: boolean;
  readonly button: number;
  readonly buttons: number;

  // Screen Coordinates (Viewport) & Document Coordinates (Canvas)
  readonly clientX: number;
  readonly clientY: number;
  readonly canvasX: number;
  readonly canvasY: number;

  // Pressure Sensor Telemetry
  readonly rawPressure: number;         // 0.0 to 1.0 (raw hardware report)
  readonly normalizedPressure: number;  // Normalized for device type
  readonly curvePressure: number;       // Post global pressure response curve

  // Tilt & Spatial Orientation
  readonly tiltX: number;               // -90 to +90 degrees
  readonly tiltY: number;               // -90 to +90 degrees
  readonly altitudeAngle: number;       // 0 to 90 degrees (angle relative to canvas plane)
  readonly azimuthAngle: number;        // 0 to 360 degrees (compass bearing)
  readonly twist: number;               // 0 to 360 degrees (barrel roll)

  // Kinematics & Stroke Math
  readonly speed: number;               // Instantaneous velocity in canvas pixels per second
  readonly distance: number;            // Cumulative stroke distance in canvas pixels
  readonly strokeDirection: number;     // Motion tangent angle in degrees (-180 to 180)
  readonly initialDirection: number;    // Angle established at stroke inception

  // Hardware Timing & Sampling Rate
  readonly timeStamp: number;           // Event timestamp (ms)
  readonly strokeDurationMs: number;    // Elapsed duration of current stroke
  readonly coalescedCount: number;      // High-frequency hardware samples bundled in frame
  readonly predictedCount: number;      // Predicted samples (if provided by browser)
  readonly estimatedHz: number;         // Instantaneous sampling rate (Hz)

  // Stroke Lifecycle State
  readonly isDrawing: boolean;          // True if pen/button is actively down drawing
  readonly strokeEventIndex: number;    // Sequential event counter within current stroke
  readonly totalStrokesRecorded: number;// Total strokes since session start

  // Telemetry Source
  readonly source: BrushTelemetrySource;
}

/**
 * A compact historical telemetry sample stored in the rolling oscilloscope buffer.
 */
export interface TelemetryWaveformSample {
  readonly timestamp: number;
  readonly pressure: number;
  readonly speed: number;
  readonly altitudeAngle: number;
  readonly azimuthAngle: number;
}

/**
 * Data Transfer Object from Tauri Native AppKit / Rust `sketch_core` engine.
 */
export interface StrokeTelemetryDto {
  readonly is_drawing: boolean;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tilt_x: number;
  readonly tilt_y: number;
  readonly tilt_elevation: number;
  readonly tilt_azimuth: number;
  readonly velocity: number;
  readonly total_distance: number;
  readonly stroke_direction: number;
  readonly initial_direction: number;
  readonly event_count: number;
}
