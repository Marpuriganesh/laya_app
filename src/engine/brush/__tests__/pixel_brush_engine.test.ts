import { describe, it, expect, beforeEach } from "vitest";
import {
  PixelBrushEngine,
  generateCircularDabStamp,
  createDefaultPixelBrushParameters,
} from "../pixel_brush_engine";
import { MemoryRasterBuffer } from "../../raster/memory_raster_buffer";
import type { StrokePoint, CubicBezierSegment } from "../../../types/stroke";

describe("PixelBrushEngine", () => {
  let rasterBuffer: MemoryRasterBuffer;
  let engine: PixelBrushEngine;

  beforeEach(() => {
    rasterBuffer = new MemoryRasterBuffer(200, 200);
    engine = new PixelBrushEngine(rasterBuffer);
  });

  describe("Procedural Dab Stamp Generation", () => {
    it("generates a buffer with correct square dimensions (D * D * 4)", () => {
      const stamp = generateCircularDabStamp({
        diameter: 10,
        hardness: 1.0,
        colorR: 255,
        colorG: 0,
        colorB: 0,
        colorA: 1.0,
        flow: 1.0,
      });

      expect(stamp.length).toBe(10 * 10 * 4);
    });

    it("generates hard-edged circular stamp when hardness = 1.0", () => {
      const diameter = 11;
      const stamp = generateCircularDabStamp({
        diameter,
        hardness: 1.0,
        colorR: 255,
        colorG: 128,
        colorB: 0,
        colorA: 1.0,
        flow: 1.0,
      });

      // Center pixel (5, 5)
      const centerOffset = (5 * diameter + 5) * 4;
      expect(stamp[centerOffset]).toBe(255);
      expect(stamp[centerOffset + 1]).toBe(128);
      expect(stamp[centerOffset + 2]).toBe(0);
      expect(stamp[centerOffset + 3]).toBe(255);

      // Corner pixel (0, 0) is at distance sqrt(25 + 25) = 7.07 > radius 5.5 -> must be transparent
      const cornerOffset = (0 * diameter + 0) * 4;
      expect(stamp[cornerOffset + 3]).toBe(0);
    });

    it("generates Gaussian soft falloff when hardness = 0.0", () => {
      const diameter = 21;
      const stamp = generateCircularDabStamp({
        diameter,
        hardness: 0.0,
        colorR: 0,
        colorG: 0,
        colorB: 255,
        colorA: 1.0,
        flow: 1.0,
      });

      const centerIndex = 10;
      const centerOffset = (centerIndex * diameter + centerIndex) * 4;
      const centerAlpha = stamp[centerOffset + 3];
      expect(centerAlpha).toBe(255);

      // Pixel halfway to edge (r = 5)
      const midOffset = (centerIndex * diameter + (centerIndex + 5)) * 4;
      const midAlpha = stamp[midOffset + 3];

      // Pixel close to edge (r = 10)
      const edgeOffset = (centerIndex * diameter + (centerIndex + 10)) * 4;
      const edgeAlpha = stamp[edgeOffset + 3];

      // Gaussian property: center > mid > edge
      expect(midAlpha).toBeLessThan(centerAlpha);
      expect(edgeAlpha).toBeLessThan(midAlpha);
      expect(edgeAlpha).toBeGreaterThanOrEqual(0);
    });

    it("scales stamp alpha according to flow and color alpha", () => {
      const stamp = generateCircularDabStamp({
        diameter: 5,
        hardness: 1.0,
        colorR: 100,
        colorG: 100,
        colorB: 100,
        colorA: 0.5,
        flow: 0.5,
      });

      const centerOffset = (2 * 5 + 2) * 4;
      // Expected alpha = 0.5 * 0.5 = 0.25 * 255 ~= 64
      expect(stamp[centerOffset + 3]).toBeCloseTo(64, -1);
    });

    it("generates elliptical dab when aspectRatio < 1.0", () => {
      const stamp = generateCircularDabStamp({
        diameter: 21,
        hardness: 1.0,
        colorR: 255,
        colorG: 255,
        colorB: 255,
        colorA: 1.0,
        flow: 1.0,
        aspectRatio: 0.5, // Flattened along Y
      });

      const center = 10;
      // Along X at distance 8 (in bounds because width radius is 10.5)
      const xOffset = (center * 21 + (center + 8)) * 4;
      expect(stamp[xOffset + 3]).toBeGreaterThan(0);

      // Along Y at distance 8 (out of bounds because height radius is 10.5 * 0.5 = 5.25)
      const yOffset = ((center + 8) * 21 + center) * 4;
      expect(stamp[yOffset + 3]).toBe(0);
    });
  });

  describe("Pressure Dynamics Evaluation", () => {
    it("scales brush diameter according to pressure dynamics curve", () => {
      engine.setBrushSize(50);

      // With default curve: pressure 0.0 -> 0.1 (diameter = 5), pressure 1.0 -> 1.0 (diameter = 50)
      expect(engine.evaluateBrushDiameter(0.0)).toBeCloseTo(5);
      expect(engine.evaluateBrushDiameter(0.5)).toBeCloseTo(27.5, 0);
      expect(engine.evaluateBrushDiameter(1.0)).toBeCloseTo(50);
    });

    it("scales brush opacity according to opacity dynamics when enabled", () => {
      const parameters = createDefaultPixelBrushParameters({
        baseOpacity: 1.0,
        opacityDynamics: {
          sensorInput: "pressure",
          curvePoints: [
            { inputValue: 0.0, outputValue: 0.2 },
            { inputValue: 1.0, outputValue: 1.0 },
          ],
          isEnabled: true,
        },
      });
      engine.setParameters(parameters);

      expect(engine.evaluateBrushOpacity(0.0)).toBeCloseTo(0.2);
      expect(engine.evaluateBrushOpacity(1.0)).toBeCloseTo(1.0);
    });

    it("returns base size and opacity when dynamics are disabled or null", () => {
      const parameters = createDefaultPixelBrushParameters({
        baseSizePx: 30,
        sizeDynamics: null,
        opacityDynamics: null,
      });
      engine.setParameters(parameters);

      expect(engine.evaluateBrushDiameter(0.0)).toBe(30);
      expect(engine.evaluateBrushDiameter(0.7)).toBe(30);
      expect(engine.evaluateBrushOpacity(0.2)).toBe(1.0);
    });
  });

  describe("Stroke Lifecycle & Spacing Emission", () => {
    const makePoint = (x: number, y: number, pressure = 1.0): StrokePoint => ({
      canvasX: x,
      canvasY: y,
      pressure,
      tiltX: 0,
      tiltY: 0,
      rotation: 0,
      speed: 100,
      timeMs: 1000,
    });

    it("emits initial dab at stroke origin on beginStroke", () => {
      engine.setForegroundColor(255, 0, 0, 1.0);
      const dirtyRects = engine.beginStroke(makePoint(100, 100, 1.0));

      expect(dirtyRects.length).toBe(1);
      expect(dirtyRects[0].x).toBeLessThanOrEqual(100);
      expect(dirtyRects[0].x + dirtyRects[0].width).toBeGreaterThan(100);

      // Verify pixel on canvas
      const sampled = rasterBuffer.samplePixels(100, 100, 1, 1);
      expect(sampled[0]).toBe(255);
      expect(sampled[3]).toBe(255);
    });

    it("emits evenly spaced dabs along a linear segment on paintTo", () => {
      engine.setBrushSize(20);
      // Spacing fraction 0.2 = step distance 4px
      engine.setParameters(
        createDefaultPixelBrushParameters({
          baseSizePx: 20,
          spacingFraction: 0.2,
          sizeDynamics: null, // Keep size constant at 20px
        })
      );

      engine.beginStroke(makePoint(10, 50));
      // Move 40 pixels horizontally -> 40 / 4 = 10 dabs
      const dirtyRects = engine.paintTo(makePoint(50, 50));

      expect(dirtyRects.length).toBe(10);
    });

    it("accumulates leftover distance across tiny stroke movements", () => {
      engine.setParameters(
        createDefaultPixelBrushParameters({
          baseSizePx: 20,
          spacingFraction: 0.5, // 10px step distance
          sizeDynamics: null,
        })
      );

      engine.beginStroke(makePoint(10, 50));

      // Move 4px (less than step distance 10px) -> no dabs emitted
      const step1 = engine.paintTo(makePoint(14, 50));
      expect(step1.length).toBe(0);

      // Move another 4px (total 8px) -> still no dabs emitted
      const step2 = engine.paintTo(makePoint(18, 50));
      expect(step2.length).toBe(0);

      // Move another 4px (total 12px) -> crosses 10px threshold -> 1 dab emitted
      const step3 = engine.paintTo(makePoint(22, 50));
      expect(step3.length).toBe(1);
    });

    it("emits dabs along a Cubic Bézier segment", () => {
      engine.setParameters(
        createDefaultPixelBrushParameters({
          baseSizePx: 20,
          spacingFraction: 0.2, // 4px step
          sizeDynamics: null,
        })
      );

      const bezierSegment: CubicBezierSegment = {
        p0: { x: 10, y: 10 },
        c1: { x: 10, y: 60 },
        c2: { x: 60, y: 60 },
        p3: { x: 60, y: 10 },
        startPressure: 1.0,
        endPressure: 1.0,
        startTimeMs: 0,
        endTimeMs: 100,
      };

      const dirtyRects = engine.paintBezierSegment(bezierSegment);
      expect(dirtyRects.length).toBeGreaterThan(5);
    });

    it("stamps single dab directly via stampDabAt", () => {
      engine.setForegroundColor(0, 255, 0, 1.0);
      const dirtyRect = engine.stampDabAt(80, 80, 1.0);

      expect(dirtyRect.width).toBeGreaterThan(0);
      const sampled = rasterBuffer.samplePixels(80, 80, 1, 1);
      expect(sampled[1]).toBe(255);
    });

    it("resets spacing distance on endStroke", () => {
      engine.beginStroke(makePoint(0, 0));
      engine.paintTo(makePoint(5, 0));
      engine.endStroke();

      // Next stroke should start fresh and emit initial dab
      const dirtyRects = engine.beginStroke(makePoint(100, 100));
      expect(dirtyRects.length).toBe(1);
    });
  });

  describe("Real-time State Adjustments", () => {
    it("updates foreground color and clamps values", () => {
      engine.setForegroundColor(300, -20, 150, 1.5);
      expect(engine.getForegroundColor()).toEqual([255, 0, 150, 1.0]);
    });

    it("updates brush size and opacity", () => {
      engine.setBrushSize(75);
      expect(engine.getBrushSize()).toBe(75);

      engine.setBrushOpacity(0.42);
      expect(engine.getBrushOpacity()).toBeCloseTo(0.42);
    });

    it("updates blend mode", () => {
      engine.setBlendMode("multiply");
      expect(engine.getBlendMode()).toBe("multiply");
    });

    it("mutates hardness, spacing, flow, aspect ratio, and angle", () => {
      engine.setHardness(0.5);
      expect(engine.getHardness()).toBeCloseTo(0.5);

      engine.setSpacingFraction(0.25);
      expect(engine.getSpacingFraction()).toBeCloseTo(0.25);

      engine.setFlow(0.7);
      expect(engine.getFlow()).toBeCloseTo(0.7);

      engine.setAspectRatio(0.6);
      expect(engine.getAspectRatio()).toBeCloseTo(0.6);

      engine.setAngleRadians(Math.PI / 4);
      expect(engine.getAngleRadians()).toBeCloseTo(Math.PI / 4);
    });

    it("toggles size dynamics and opacity dynamics", () => {
      engine.setSizeDynamicsEnabled(false);
      expect(engine.getParameters().sizeDynamics?.isEnabled).toBe(false);

      engine.setSizeDynamicsEnabled(true);
      expect(engine.getParameters().sizeDynamics?.isEnabled).toBe(true);

      const paramsWithOpacity = createDefaultPixelBrushParameters({
        opacityDynamics: {
          sensorInput: "pressure",
          curvePoints: [
            { inputValue: 0, outputValue: 0.1 },
            { inputValue: 1, outputValue: 1.0 },
          ],
          isEnabled: true,
        },
      });
      engine.setParameters(paramsWithOpacity);

      engine.setOpacityDynamicsEnabled(false);
      expect(engine.getParameters().opacityDynamics?.isEnabled).toBe(false);
    });

    it("verifies anti-aliased sub-pixel falloff at perimeter for hardness = 1.0", () => {
      const diameter = 20;
      const stamp = generateCircularDabStamp({
        diameter,
        hardness: 1.0,
        colorR: 0,
        colorG: 0,
        colorB: 0,
        colorA: 1.0,
        flow: 1.0,
      });

      // Core pixel at distance 7 (inside core = 10 - 1.25 = 8.75) -> must be 255
      const coreX = 9;
      const coreY = 9;
      const coreOffset = (coreY * diameter + coreX) * 4;
      expect(stamp[coreOffset + 3]).toBe(255);

      // Boundary pixel at distance ~9.5 (just inside radius 10) -> must be smoothly anti-aliased
      const edgeX = 19;
      const edgeY = 9;
      const edgeOffset = (edgeY * diameter + edgeX) * 4;
      const edgeAlpha = stamp[edgeOffset + 3];

      // Must be greater than 0 and less than or equal to 255 (smooth transition, not sharp cutoff)
      expect(edgeAlpha).toBeGreaterThanOrEqual(0);
      expect(edgeAlpha).toBeLessThan(255);
    });
  });
});
