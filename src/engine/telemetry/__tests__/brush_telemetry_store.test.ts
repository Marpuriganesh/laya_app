import { describe, it, expect, beforeEach } from "vitest";
import {
  BrushTelemetryStore,
  calculateSphericalTilt,
  createDefaultPointerTelemetry,
} from "../brush_telemetry_store";
import type { StrokePoint } from "@/types/stroke";
import type { PointerEventLike } from "@/input/pointer/pointer_event_normalizer";

describe("BrushTelemetryStore", () => {
  let store: BrushTelemetryStore;

  beforeEach(() => {
    store = new BrushTelemetryStore();
  });

  describe("calculateSphericalTilt", () => {
    it("returns perpendicular altitude for zero tilt", () => {
      const { altitudeAngle, azimuthAngle } = calculateSphericalTilt(0, 0);
      expect(altitudeAngle).toBe(90);
      expect(azimuthAngle).toBe(0);
    });

    it("calculates correct altitude and azimuth for positive X tilt", () => {
      const { altitudeAngle, azimuthAngle } = calculateSphericalTilt(45, 0);
      // tan(45°) = 1, len = sqrt(1 + 0 + 1) = sqrt(2)
      // asin(1/sqrt(2)) = 45°
      expect(altitudeAngle).toBe(45);
      expect(azimuthAngle).toBe(0);
    });

    it("calculates 90 degree azimuth for positive Y tilt", () => {
      const { altitudeAngle, azimuthAngle } = calculateSphericalTilt(0, 45);
      expect(altitudeAngle).toBe(45);
      expect(azimuthAngle).toBe(90);
    });

    it("normalizes negative azimuth angles to 0..360 range", () => {
      const { azimuthAngle } = calculateSphericalTilt(-30, -30);
      expect(azimuthAngle).toBeGreaterThanOrEqual(180);
      expect(azimuthAngle).toBeLessThan(360);
    });
  });

  describe("recordWebEvent", () => {
    it("correctly records raw pointer event properties and kinematics", () => {
      const mockEvent: PointerEventLike & { button: number; buttons: number } = {
        clientX: 120,
        clientY: 240,
        pressure: 0.75,
        pointerType: "pen",
        tiltX: 20,
        tiltY: -15,
        twist: 45,
        button: 0,
        buttons: 1,
        timeStamp: 1000,
      };

      const mockPoint: StrokePoint = {
        canvasX: 200,
        canvasY: 300,
        pressure: 0.75,
        tiltX: 20,
        tiltY: -15,
        rotation: 45,
        speed: 450,
        timeMs: 1000,
      };

      store.recordWebEvent(mockEvent, mockPoint, true, 0.82);

      const tel = store.getCurrentTelemetry();
      expect(tel.pointerType).toBe("pen");
      expect(tel.clientX).toBe(120);
      expect(tel.clientY).toBe(240);
      expect(tel.canvasX).toBe(200);
      expect(tel.canvasY).toBe(300);
      expect(tel.rawPressure).toBe(0.75);
      expect(tel.normalizedPressure).toBe(0.75);
      expect(tel.curvePressure).toBe(0.82);
      expect(tel.tiltX).toBe(20);
      expect(tel.tiltY).toBe(-15);
      expect(tel.twist).toBe(45);
      expect(tel.speed).toBe(450);
      expect(tel.isDrawing).toBe(true);
      expect(tel.source).toBe("web-pointer");

      const waveforms = store.getWaveformSamples();
      expect(waveforms.length).toBe(1);
      expect(waveforms[0].pressure).toBe(0.82);
      expect(waveforms[0].speed).toBe(450);
    });

    it("accumulates cumulative stroke distance during consecutive drawing events", () => {
      const p1: StrokePoint = {
        canvasX: 100,
        canvasY: 100,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        rotation: 0,
        speed: 100,
        timeMs: 100,
      };
      const e1: PointerEventLike = { clientX: 100, clientY: 100, pressure: 0.5, pointerType: "pen", timeStamp: 100 };

      const p2: StrokePoint = {
        canvasX: 130,
        canvasY: 140, // dx=30, dy=40 => dist = 50
        pressure: 0.6,
        tiltX: 0,
        tiltY: 0,
        rotation: 0,
        speed: 500,
        timeMs: 200,
      };
      const e2: PointerEventLike = { clientX: 130, clientY: 140, pressure: 0.6, pointerType: "pen", timeStamp: 200 };

      store.recordWebEvent(e1, p1, true);
      store.recordWebEvent(e2, p2, true);

      const tel = store.getCurrentTelemetry();
      expect(tel.distance).toBe(50);
      expect(tel.strokeEventIndex).toBe(2);
      expect(tel.totalStrokesRecorded).toBe(1);
    });

    it("respects max waveform buffer limit", () => {
      for (let i = 0; i < 150; i++) {
        const pt: StrokePoint = {
          canvasX: i,
          canvasY: i,
          pressure: i / 150,
          tiltX: 0,
          tiltY: 0,
          rotation: 0,
          speed: 100,
          timeMs: 100 + i * 16,
        };
        const ev: PointerEventLike = {
          clientX: i,
          clientY: i,
          pressure: i / 150,
          pointerType: "mouse",
          timeStamp: 100 + i * 16,
        };
        store.recordWebEvent(ev, pt, true);
      }

      const waveforms = store.getWaveformSamples();
      expect(waveforms.length).toBe(120);
    });

    it("freezes telemetry updates when setFrozen(true)", () => {
      const pt: StrokePoint = {
        canvasX: 50,
        canvasY: 50,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        rotation: 0,
        speed: 100,
        timeMs: 100,
      };
      const ev: PointerEventLike = { clientX: 50, clientY: 50, pressure: 0.5, pointerType: "pen", timeStamp: 100 };
      store.recordWebEvent(ev, pt, true);

      store.setFrozen(true);
      expect(store.getIsFrozen()).toBe(true);

      const pt2: StrokePoint = { ...pt, canvasX: 999 };
      const ev2: PointerEventLike = { ...ev, clientX: 999 };
      store.recordWebEvent(ev2, pt2, true);

      expect(store.getCurrentTelemetry().canvasX).toBe(50);
    });

    it("resets state when clear() is invoked", () => {
      const pt: StrokePoint = {
        canvasX: 50,
        canvasY: 50,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        rotation: 0,
        speed: 100,
        timeMs: 100,
      };
      const ev: PointerEventLike = { clientX: 50, clientY: 50, pressure: 0.5, pointerType: "pen", timeStamp: 100 };
      store.recordWebEvent(ev, pt, true);

      store.clear();
      expect(store.getWaveformSamples().length).toBe(0);
      expect(store.getEventLog().length).toBe(0);
      expect(store.getCurrentTelemetry().canvasX).toBe(0);
    });

    it("exports valid formatted JSON", () => {
      const jsonStr = store.exportToJson();
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toHaveProperty("telemetry");
      expect(parsed).toHaveProperty("recentEvents");
      expect(parsed).toHaveProperty("exportedAt");
    });
  });

  describe("recordNativeDto", () => {
    it("records native stroke telemetry correctly", () => {
      store.recordNativeDto({
        is_drawing: true,
        x: 320.5,
        y: 480.2,
        pressure: 0.88,
        tilt_x: 12.0,
        tilt_y: -24.0,
        tilt_elevation: 0.9,
        tilt_azimuth: -0.5,
        velocity: 820.0,
        total_distance: 145.2,
        stroke_direction: 0.4,
        initial_direction: 0.35,
        event_count: 42,
      });

      const tel = store.getCurrentTelemetry();
      expect(tel.source).toBe("native-appkit");
      expect(tel.canvasX).toBe(320.5);
      expect(tel.canvasY).toBe(480.2);
      expect(tel.rawPressure).toBe(0.88);
      expect(tel.speed).toBe(820);
      expect(tel.distance).toBe(145.2);
      expect(tel.strokeEventIndex).toBe(42);
    });
  });
});

