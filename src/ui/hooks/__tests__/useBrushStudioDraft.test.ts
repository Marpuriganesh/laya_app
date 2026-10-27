import { describe, it, expect } from "vitest";
import { deepClonePreset } from "../useBrushStudioDraft";
import type { BrushPreset } from "@/types/brush";
import { DEFAULT_STROKE_SMOOTHING_CONFIG } from "@/types/brush";

function createTestPreset(id = "test-preset"): BrushPreset {
  return {
    presetId: id,
    displayName: "Ink Pen",
    engineType: "pixelbrush",
    thumbnailPngData: new Uint8Array([1, 2, 3, 4]),
    tags: ["Inking", "Default"],
    smoothingConfig: {
      ...DEFAULT_STROKE_SMOOTHING_CONFIG,
      mode: "streamline",
      pullString: {
        enabled: true,
        maxStringLength: 42,
        velocityMultiplier: 2.0,
        catchUpSpeed: 0.25,
        baseDeadzone: 0,
        connectToTipOnRelease: true,
        pressureSmoothing: 0.4,
      },
    },
    engineParameters: {
      engineId: "pixelbrush",
      brushTip: {
        tipType: "generated",
        diameter: 24,
        hardness: 0.9,
        aspectRatio: 1.0,
        angleRadians: 0,
      },
      spacingFraction: 0.08,
      baseOpacity: 0.95,
      baseFlow: 0.85,
      baseSizePx: 24,
      softness: 0.15,
      scatterAmplitude: 0,
      isAirbrushMode: false,
      sizeDynamics: {
        sensorInput: "pressure",
        curvePoints: [
          { inputValue: 0, outputValue: 0.1 },
          { inputValue: 1, outputValue: 1.0 },
        ],
        isEnabled: true,
      },
      opacityDynamics: null,
      flowDynamics: null,
      angleDynamics: null,
      scatterDynamics: null,
    },
  };
}

describe("deepClonePreset", () => {
  it("creates an independent clone of a brush preset", () => {
    const original = createTestPreset();
    const clone = deepClonePreset(original);

    expect(clone.presetId).toBe(original.presetId);
    expect(clone.displayName).toBe(original.displayName);
    expect(clone).not.toBe(original);
    expect(clone.tags).not.toBe(original.tags);
    expect(clone.thumbnailPngData).not.toBe(original.thumbnailPngData);
    expect(clone.thumbnailPngData).toEqual(original.thumbnailPngData);
  });

  it("deeply clones engineParameters without shared references", () => {
    const original = createTestPreset();
    const clone = deepClonePreset(original);

    expect(clone.engineParameters).not.toBe(original.engineParameters);
    if (clone.engineParameters.engineId === "pixelbrush" && original.engineParameters.engineId === "pixelbrush") {
      expect(clone.engineParameters.brushTip).not.toBe(original.engineParameters.brushTip);
      expect(clone.engineParameters.sizeDynamics).not.toBe(original.engineParameters.sizeDynamics);
    }
  });

  it("deeply clones typed arrays in predefined tips and textures", () => {
    const mask = new Uint8ClampedArray([255, 128, 64, 0]);
    const texBytes = new Uint8Array([10, 20, 30, 40]);
    const preset = createTestPreset();
    if (preset.engineParameters.engineId === "pixelbrush") {
      (preset.engineParameters as any).brushTip = {
        tipType: "predefined",
        imageData: mask,
        width: 2,
        height: 2,
      };
      (preset.engineParameters as any).grainTexture = {
        patternId: "test-pat",
        name: "Paper",
        width: 2,
        height: 2,
        bytes: texBytes,
        scale: 1.0,
        mode: "multiply",
        strength: 0.8,
        byPressure: false,
      };
    }

    const clone = deepClonePreset(preset);
    if (clone.engineParameters.engineId === "pixelbrush") {
      expect(clone.engineParameters.brushTip.tipType).toBe("predefined");
      if (clone.engineParameters.brushTip.tipType === "predefined") {
        expect(clone.engineParameters.brushTip.imageData).not.toBe(mask);
        expect(clone.engineParameters.brushTip.imageData).toBeInstanceOf(Uint8ClampedArray);
        expect(Array.from(clone.engineParameters.brushTip.imageData)).toEqual([255, 128, 64, 0]);
      }
      expect(clone.engineParameters.grainTexture?.bytes).not.toBe(texBytes);
      expect(clone.engineParameters.grainTexture?.bytes).toBeInstanceOf(Uint8Array);
      expect(Array.from(clone.engineParameters.grainTexture!.bytes)).toEqual([10, 20, 30, 40]);
    }
  });
});
