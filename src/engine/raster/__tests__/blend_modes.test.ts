/**
 * Modular Blend Modes & Texture Modulation Unit Tests
 * Verifies that all Krita-compatible single-channel blend modes,
 * texture modulation modes (Multiply, Subtract, Add, Screen, etc.),
 * RGB blending, and Porter-Duff compositing match exact specifications.
 */

import { describe, it, expect } from "vitest";
import {
  blendChannelMultiply,
  blendChannelScreen,
  blendChannelOverlay,
  blendChannelHardLight,
  blendChannelSoftLight,
  blendChannelDarken,
  blendChannelLighten,
  blendChannelColorDodge,
  blendChannelColorBurn,
  blendChannelAdd,
  blendChannelSubtract,
  blendChannelDivide,
  blendChannelLinearBurn,
  blendChannelLinearLight,
  blendChannelVividLight,
  blendChannelPinLight,
  blendChannelHardMix,
  blendChannelDifference,
  blendChannelExclusion,
  modulateTextureAlpha,
  blendPixelColor,
  compositePixelOver,
} from "../blend_modes";

describe("Single-Channel Modular Blend Modes", () => {
  it("computes Multiply correctly", () => {
    expect(blendChannelMultiply(255, 128)).toBeCloseTo(128);
    expect(blendChannelMultiply(0, 255)).toBe(0);
    expect(blendChannelMultiply(255, 255)).toBe(255);
  });

  it("computes Screen correctly", () => {
    expect(blendChannelScreen(0, 0)).toBe(0);
    expect(blendChannelScreen(255, 128)).toBe(255);
    expect(blendChannelScreen(128, 128)).toBeCloseTo(192, 0);
  });

  it("computes Add and Subtract correctly", () => {
    expect(blendChannelAdd(100, 200)).toBe(255);
    expect(blendChannelAdd(50, 70)).toBe(120);
    expect(blendChannelSubtract(100, 120)).toBe(0);
    expect(blendChannelSubtract(100, 40)).toBe(60);
  });

  it("computes Divide correctly", () => {
    expect(blendChannelDivide(128, 128)).toBe(255);
    expect(blendChannelDivide(64, 128)).toBeCloseTo(127.5, 0);
    expect(blendChannelDivide(100, 0)).toBe(255);
  });

  it("computes Difference and Exclusion correctly", () => {
    expect(blendChannelDifference(100, 120)).toBe(20);
    expect(blendChannelDifference(120, 100)).toBe(20);
    expect(blendChannelExclusion(0, 0)).toBe(0);
    expect(blendChannelExclusion(255, 255)).toBe(0);
  });

  it("computes Hard Light and Soft Light correctly", () => {
    expect(blendChannelHardLight(100, 0)).toBe(0);
    expect(blendChannelHardLight(100, 255)).toBe(255);
    expect(blendChannelSoftLight(128, 128)).toBeCloseTo(128, 0);
    expect(blendChannelOverlay(128, 128)).toBeCloseTo(128, 0);
  });

  it("computes Darken and Lighten correctly", () => {
    expect(blendChannelDarken(100, 150)).toBe(100);
    expect(blendChannelLighten(100, 150)).toBe(150);
  });

  it("computes Dodge and Burn correctly", () => {
    expect(blendChannelColorDodge(100, 255)).toBe(255);
    expect(blendChannelColorBurn(100, 0)).toBe(0);
    expect(blendChannelLinearBurn(100, 100)).toBe(0);
  });

  it("computes Vivid Light, Linear Light, Pin Light, and Hard Mix correctly", () => {
    expect(blendChannelLinearLight(128, 128)).toBe(129);
    expect(blendChannelVividLight(100, 0)).toBe(0);
    expect(blendChannelPinLight(100, 50)).toBe(100);
    expect(blendChannelHardMix(100, 155)).toBe(255);
    expect(blendChannelHardMix(100, 154)).toBe(0);
  });

  it("computes blendPixelColor correctly", () => {
    const blended = blendPixelColor(255, 255, 255, 128, 128, 128, "multiply");
    expect(blended).toEqual([128, 128, 128]);
  });
});

describe("Modular Texture Modulation (KisTextureOption)", () => {
  it("modulates alpha in Multiply mode", () => {
    // Full opacity dab (255) with 50% texture (128) at full strength (1.0) -> 128
    const result = modulateTextureAlpha(255, 128, 1.0, "multiply");
    expect(result).toBe(128);

    // At 0 strength, texture has zero attenuation
    const resultZero = modulateTextureAlpha(255, 128, 0.0, "multiply");
    expect(resultZero).toBe(255);
  });

  it("modulates alpha in Subtract mode", () => {
    // Dab alpha 200, texture 200 (cut = 55), strength 1.0 -> 200 - 55 = 145
    const result = modulateTextureAlpha(200, 200, 1.0, "subtract");
    expect(result).toBe(145);

    // Zero texture (0) subtracts full 255 * strength -> 0
    const cutAll = modulateTextureAlpha(200, 0, 1.0, "subtract");
    expect(cutAll).toBe(0);
  });

  it("modulates alpha in Add mode", () => {
    const result = modulateTextureAlpha(100, 50, 1.0, "add");
    expect(result).toBe(150);
  });

  it("modulates alpha in Screen mode", () => {
    const result = modulateTextureAlpha(128, 128, 1.0, "screen");
    expect(result).toBeCloseTo(192, 0);
  });
});

describe("Full Pixel Compositing (Porter-Duff with Blend Modes)", () => {
  it("composites with Multiply mode over white", () => {
    const white: [number, number, number, number] = [255, 255, 255, 255];
    const gray: [number, number, number, number] = [128, 128, 128, 255];
    const out = compositePixelOver(white[0], white[1], white[2], white[3], gray[0], gray[1], gray[2], gray[3], "multiply");
    expect(out).toEqual([128, 128, 128, 255]);
  });

  it("composites with Erase mode", () => {
    const opaque: [number, number, number, number] = [200, 100, 50, 255];
    const erase: [number, number, number, number] = [0, 0, 0, 255];
    const out = compositePixelOver(opaque[0], opaque[1], opaque[2], opaque[3], erase[0], erase[1], erase[2], erase[3], "erase");
    expect(out[3]).toBe(0);
  });

  it("composites with Behind mode (underneath existing content)", () => {
    const opaque: [number, number, number, number] = [255, 0, 0, 255]; // Red
    const under: [number, number, number, number] = [0, 0, 255, 255];  // Blue
    const out = compositePixelOver(opaque[0], opaque[1], opaque[2], opaque[3], under[0], under[1], under[2], under[3], "behind");
    // Underneath opaque red, blue is completely hidden!
    expect(out).toEqual([255, 0, 0, 255]);
  });
});
