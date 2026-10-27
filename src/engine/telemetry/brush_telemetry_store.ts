/**
 * Brush Telemetry Store
 * High-performance, reactive telemetry accumulator and diagnostics hub.
 * Tracks live hardware inputs, spatial orientation, rolling waveforms, and event logs.
 */

import type {
  PointerTelemetry,
  TelemetryWaveformSample,
  BrushTelemetrySource,
  StrokeTelemetryDto,
} from "@/types/telemetry";
import type { StrokePoint } from "@/types/stroke";
import type { PointerEventLike } from "@/input/pointer/pointer_event_normalizer";

const MAX_WAVEFORM_SAMPLES = 120;
const MAX_EVENT_LOG = 15;

/**
 * Derives spherical altitude angle (0° to 90°) and compass azimuth angle (0° to 360°)
 * from hardware tiltX and tiltY angles in degrees (-90° to 90°).
 */
export function calculateSphericalTilt(
  tiltX: number,
  tiltY: number
): { altitudeAngle: number; azimuthAngle: number } {
  if (tiltX === 0 && tiltY === 0) {
    return { altitudeAngle: 90, azimuthAngle: 0 };
  }

  const radX = (tiltX * Math.PI) / 180;
  const radY = (tiltY * Math.PI) / 180;

  // Tangent projection vector from stylus shaft
  const vx = Math.tan(radX);
  const vy = Math.tan(radY);
  const len = Math.hypot(vx, vy, 1.0);

  // Altitude: 0° flat against surface, 90° perpendicular/vertical
  const altitudeRad = Math.asin(Math.min(1.0, 1.0 / len));
  const altitudeAngle = Math.round((altitudeRad * 180) / Math.PI * 10) / 10;

  // Azimuth: compass bearing in degrees 0° to 360°
  let azimuthRad = Math.atan2(vy, vx);
  if (azimuthRad < 0) {
    azimuthRad += Math.PI * 2;
  }
  const azimuthAngle = Math.round((azimuthRad * 180) / Math.PI * 10) / 10;

  return { altitudeAngle, azimuthAngle };
}

/**
 * Creates an empty default telemetry snapshot.
 */
export function createDefaultPointerTelemetry(): PointerTelemetry {
  return {
    pointerId: -1,
    pointerType: "unknown",
    isPrimary: false,
    button: -1,
    buttons: 0,
    clientX: 0,
    clientY: 0,
    canvasX: 0,
    canvasY: 0,
    rawPressure: 0,
    normalizedPressure: 0,
    curvePressure: 0,
    tiltX: 0,
    tiltY: 0,
    altitudeAngle: 90,
    azimuthAngle: 0,
    twist: 0,
    speed: 0,
    distance: 0,
    strokeDirection: 0,
    initialDirection: 0,
    timeStamp: 0,
    strokeDurationMs: 0,
    coalescedCount: 1,
    predictedCount: 0,
    estimatedHz: 0,
    isDrawing: false,
    strokeEventIndex: 0,
    totalStrokesRecorded: 0,
    source: "web-pointer",
  };
}

export type TelemetryListener = (telemetry: PointerTelemetry) => void;

export class BrushTelemetryStore {
  private currentTelemetry: PointerTelemetry = createDefaultPointerTelemetry();
  private waveformBuffer: TelemetryWaveformSample[] = [];
  private eventLog: PointerTelemetry[] = [];
  private listeners = new Set<TelemetryListener>();

  private isFrozen = false;
  private strokeStartTime = 0;
  private strokeDistance = 0;
  private strokeEventCount = 0;
  private totalStrokes = 0;
  private initialStrokeDirection = 0;
  private hasInitialDirection = false;
  private lastEventTime = 0;
  private lastCanvasX = 0;
  private lastCanvasY = 0;

  public getCurrentTelemetry(): PointerTelemetry {
    return this.currentTelemetry;
  }

  public getWaveformSamples(): readonly TelemetryWaveformSample[] {
    return this.waveformBuffer;
  }

  public getEventLog(): readonly PointerTelemetry[] {
    return this.eventLog;
  }

  public getIsFrozen(): boolean {
    return this.isFrozen;
  }

  public setFrozen(frozen: boolean): void {
    this.isFrozen = frozen;
    this.notifyListeners();
  }

  public toggleFrozen(): void {
    this.setFrozen(!this.isFrozen);
  }

  public clear(): void {
    this.waveformBuffer = [];
    this.eventLog = [];
    this.strokeDistance = 0;
    this.strokeEventCount = 0;
    this.strokeStartTime = 0;
    this.hasInitialDirection = false;
    this.currentTelemetry = createDefaultPointerTelemetry();
    this.notifyListeners();
  }

  /**
   * Subscribes to real-time telemetry changes.
   */
  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.currentTelemetry);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentTelemetry);
    }
  }

  /**
   * Records a PointerEvent from the web input pipeline.
   */
  public recordWebEvent(
    event: PointerEventLike & {
      readonly isPrimary?: boolean;
      readonly button?: number;
      readonly buttons?: number;
      readonly altitudeAngle?: number;
      readonly azimuthAngle?: number;
      getPredictedEvents?: () => PointerEventLike[];
    },
    strokePoint: StrokePoint,
    isDrawing: boolean,
    curvePressure?: number
  ): void {
    if (this.isFrozen) return;

    const now = event.timeStamp ?? Date.now();
    const dt = this.lastEventTime > 0 ? Math.max(1, now - this.lastEventTime) : 16;
    this.lastEventTime = now;
    const estimatedHz = Math.min(1000, Math.round(1000 / dt));

    // Stroke lifecycle transitions
    if (isDrawing && !this.currentTelemetry.isDrawing) {
      // Stroke inception
      this.strokeStartTime = now;
      this.strokeDistance = 0;
      this.strokeEventCount = 0;
      this.totalStrokes += 1;
      this.hasInitialDirection = false;
    } else if (!isDrawing && this.currentTelemetry.isDrawing) {
      // Stroke termination
      this.hasInitialDirection = false;
    }

    if (isDrawing) {
      this.strokeEventCount += 1;
      if (this.strokeEventCount > 1) {
        const dx = strokePoint.canvasX - this.lastCanvasX;
        const dy = strokePoint.canvasY - this.lastCanvasY;
        const stepDist = Math.hypot(dx, dy);
        this.strokeDistance += stepDist;

        if (stepDist > 0.5) {
          const dirDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (!this.hasInitialDirection && this.strokeDistance > 2.0) {
            this.initialStrokeDirection = dirDeg;
            this.hasInitialDirection = true;
          }
        }
      }
    }

    this.lastCanvasX = strokePoint.canvasX;
    this.lastCanvasY = strokePoint.canvasY;

    // Spatial tilt & orientation angles
    let altAngle: number;
    let azAngle: number;

    if (typeof event.altitudeAngle === "number" && typeof event.azimuthAngle === "number") {
      // Native PointerEvent Level 3 angles (in radians)
      altAngle = Math.round((event.altitudeAngle * 180) / Math.PI * 10) / 10;
      let azDeg = (event.azimuthAngle * 180) / Math.PI;
      if (azDeg < 0) azDeg += 360;
      azAngle = Math.round(azDeg * 10) / 10;
    } else {
      const derived = calculateSphericalTilt(strokePoint.tiltX, strokePoint.tiltY);
      altAngle = derived.altitudeAngle;
      azAngle = derived.azimuthAngle;
    }

    // Coalesced & predicted count
    const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const coalescedCount = Math.max(1, coalesced.length);
    const predicted = typeof event.getPredictedEvents === "function" ? event.getPredictedEvents() : [];
    const predictedCount = predicted.length;

    const strokeDurationMs = this.strokeStartTime > 0 ? Math.max(0, now - this.strokeStartTime) : 0;
    const finalCurvePressure = curvePressure ?? strokePoint.pressure;

    const telemetry: PointerTelemetry = {
      pointerId: (event as unknown as { pointerId?: number }).pointerId ?? 1,
      pointerType: (event.pointerType as PointerTelemetry["pointerType"]) || "unknown",
      isPrimary: event.isPrimary ?? true,
      button: event.button ?? (isDrawing ? 0 : -1),
      buttons: event.buttons ?? (isDrawing ? 1 : 0),
      clientX: Math.round(event.clientX * 10) / 10,
      clientY: Math.round(event.clientY * 10) / 10,
      canvasX: Math.round(strokePoint.canvasX * 10) / 10,
      canvasY: Math.round(strokePoint.canvasY * 10) / 10,
      rawPressure: Math.round(event.pressure * 1000) / 1000,
      normalizedPressure: Math.round(strokePoint.pressure * 1000) / 1000,
      curvePressure: Math.round(finalCurvePressure * 1000) / 1000,
      tiltX: Math.round(strokePoint.tiltX),
      tiltY: Math.round(strokePoint.tiltY),
      altitudeAngle: altAngle,
      azimuthAngle: azAngle,
      twist: Math.round(strokePoint.rotation),
      speed: Math.round(strokePoint.speed),
      distance: Math.round(this.strokeDistance * 10) / 10,
      strokeDirection: Math.round(this.hasInitialDirection ? ((Math.atan2(strokePoint.canvasY - this.lastCanvasY, strokePoint.canvasX - this.lastCanvasX) * 180) / Math.PI) : 0),
      initialDirection: Math.round(this.initialStrokeDirection),
      timeStamp: now,
      strokeDurationMs: Math.round(strokeDurationMs),
      coalescedCount,
      predictedCount,
      estimatedHz,
      isDrawing,
      strokeEventIndex: this.strokeEventCount,
      totalStrokesRecorded: this.totalStrokes,
      source: "web-pointer",
    };

    this.currentTelemetry = telemetry;

    // Push into rolling waveform buffer
    this.pushWaveformSample({
      timestamp: now,
      pressure: telemetry.curvePressure,
      speed: telemetry.speed,
      altitudeAngle: telemetry.altitudeAngle,
      azimuthAngle: telemetry.azimuthAngle,
    });

    // Push into event log (only during drawing or periodic move)
    if (isDrawing || this.eventLog.length === 0) {
      this.pushEventLog(telemetry);
    }

    this.notifyListeners();
  }

  /**
   * Records native telemetry received from Tauri Desktop / Rust `sketch_core` engine.
   */
  public recordNativeDto(dto: StrokeTelemetryDto): void {
    if (this.isFrozen) return;

    const now = Date.now();
    const dt = this.lastEventTime > 0 ? Math.max(1, now - this.lastEventTime) : 8;
    this.lastEventTime = now;
    const estimatedHz = Math.min(1000, Math.round(1000 / dt));

    const derived = calculateSphericalTilt(dto.tilt_x, dto.tilt_y);

    const telemetry: PointerTelemetry = {
      pointerId: 0,
      pointerType: "pen",
      isPrimary: true,
      button: dto.is_drawing ? 0 : -1,
      buttons: dto.is_drawing ? 1 : 0,
      clientX: 0,
      clientY: 0,
      canvasX: Math.round(dto.x * 10) / 10,
      canvasY: Math.round(dto.y * 10) / 10,
      rawPressure: Math.round(dto.pressure * 1000) / 1000,
      normalizedPressure: Math.round(dto.pressure * 1000) / 1000,
      curvePressure: Math.round(dto.pressure * 1000) / 1000,
      tiltX: Math.round(dto.tilt_x),
      tiltY: Math.round(dto.tilt_y),
      altitudeAngle: Math.round((dto.tilt_elevation * 180) / Math.PI * 10) / 10 || derived.altitudeAngle,
      azimuthAngle: Math.round((dto.tilt_azimuth * 180) / Math.PI * 10) / 10 || derived.azimuthAngle,
      twist: 0,
      speed: Math.round(dto.velocity),
      distance: Math.round(dto.total_distance * 10) / 10,
      strokeDirection: Math.round((dto.stroke_direction * 180) / Math.PI),
      initialDirection: Math.round((dto.initial_direction * 180) / Math.PI),
      timeStamp: now,
      strokeDurationMs: 0,
      coalescedCount: 1,
      predictedCount: 0,
      estimatedHz,
      isDrawing: dto.is_drawing,
      strokeEventIndex: dto.event_count,
      totalStrokesRecorded: this.totalStrokes,
      source: "native-appkit",
    };

    this.currentTelemetry = telemetry;

    this.pushWaveformSample({
      timestamp: now,
      pressure: telemetry.curvePressure,
      speed: telemetry.speed,
      altitudeAngle: telemetry.altitudeAngle,
      azimuthAngle: telemetry.azimuthAngle,
    });

    if (dto.is_drawing) {
      this.pushEventLog(telemetry);
    }

    this.notifyListeners();
  }

  private pushWaveformSample(sample: TelemetryWaveformSample): void {
    this.waveformBuffer.push(sample);
    if (this.waveformBuffer.length > MAX_WAVEFORM_SAMPLES) {
      this.waveformBuffer.shift();
    }
  }

  private pushEventLog(entry: PointerTelemetry): void {
    this.eventLog.unshift(entry);
    if (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog.pop();
    }
  }

  /**
   * Generates a formatted JSON representation of current telemetry for export / clipboard.
   */
  public exportToJson(): string {
    return JSON.stringify(
      {
        telemetry: this.currentTelemetry,
        recentEvents: this.eventLog.slice(0, 5),
        waveformSampleCount: this.waveformBuffer.length,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }
}

export const globalBrushTelemetryStore = new BrushTelemetryStore();

