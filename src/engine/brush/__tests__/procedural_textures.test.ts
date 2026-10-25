import { describe, it, expect } from "vitest";
import {
  generateCanvasTexture,
  generateCharcoalPaperTexture,
  generateColdPressPaperTexture,
  createDefaultCharcoalTextureConfig,
  createDefaultCanvasTextureConfig,
  createDefaultColdPressTextureConfig,
} from "../procedural_textures";

describe("Procedural Paper & Grain Textures", () => {
  it("generates woven canvas texture with correct dimensions and byte bounds", () => {
    const width = 64;
    const height = 64;
    const bytes = generateCanvasTexture(width, height);
    expect(bytes.length).toBe(width * height);

    for (let i = 0; i < bytes.length; i++) {
      expect(bytes[i]).toBeGreaterThanOrEqual(0);
      expect(bytes[i]).toBeLessThanOrEqual(255);
    }
  });

  it("generates charcoal paper tooth texture with high-contrast luminance distribution", () => {
    const width = 64;
    const height = 64;
    const bytes = generateCharcoalPaperTexture(width, height);
    expect(bytes.length).toBe(width * height);

    let hasDarkPits = false;
    let hasBrightPeaks = false;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] < 80) hasDarkPits = true;
      if (bytes[i] > 180) hasBrightPeaks = true;
    }
    expect(hasDarkPits).toBe(true);
    expect(hasBrightPeaks).toBe(true);
  });

  it("generates cold press paper texture", () => {
    const width = 32;
    const height = 32;
    const bytes = generateColdPressPaperTexture(width, height);
    expect(bytes.length).toBe(width * height);
  });

  it("builds valid BrushTextureConfig presets", () => {
    const charcoal = createDefaultCharcoalTextureConfig();
    expect(charcoal.mode).toBe("subtract");
    expect(charcoal.byPressure).toBe(true);
    expect(charcoal.bytes.length).toBe(128 * 128);

    const canvas = createDefaultCanvasTextureConfig();
    expect(canvas.mode).toBe("multiply");
    expect(canvas.byPressure).toBe(false);

    const coldPress = createDefaultColdPressTextureConfig();
    expect(coldPress.mode).toBe("multiply");
  });
});
