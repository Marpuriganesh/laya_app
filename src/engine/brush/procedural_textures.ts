/**
 * Procedural Seamless Paper & Grain Texture Generators
 * Pure algorithmic functions generating 8-bit grayscale seamless textures
 * for Krita-compatible brush texture modulation (KisTextureOption).
 */

import type { BrushTextureConfig } from "../../types/brush";

/**
 * Simple pseudo-random hash generator for deterministic procedural noise.
 */
function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Seamless 2D value noise tiling across [width, height].
 */
function seamlessNoise(x: number, y: number, width: number, height: number): number {
  const x0 = Math.floor(x) % width;
  const y0 = Math.floor(y) % height;
  const x1 = (x0 + 1) % width;
  const y1 = (y0 + 1) % height;

  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2d(x0, y0);
  const n10 = hash2d(x1, y0);
  const n01 = hash2d(x0, y1);
  const n11 = hash2d(x1, y1);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);

  return nx0 + sy * (nx1 - nx0);
}

/**
 * Generates a seamless woven canvas grain texture (alternating horizontal and vertical fiber bands).
 */
export function generateCanvasTexture(width = 128, height = 128): Uint8Array {
  const buffer = new Uint8Array(width * height);
  const period = 6.0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width) * (width / period) * 2 * Math.PI;
      const v = (y / height) * (height / period) * 2 * Math.PI;

      // Weave pattern: orthogonal cosine fibers
      const weave = Math.sin(u) * Math.cos(v);
      const micro = hash2d(x % 16, y % 16) * 0.25;

      const lum = Math.round(128 + 100 * weave + 50 * micro);
      buffer[y * width + x] = Math.max(0, Math.min(255, lum));
    }
  }

  return buffer;
}

/**
 * Generates a coarse charcoal / pastel paper tooth texture with deep grain valleys.
 */
export function generateCharcoalPaperTexture(width = 128, height = 128): Uint8Array {
  const buffer = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave fractal noise
      const n1 = seamlessNoise(x * 0.25, y * 0.25, width, height);
      const n2 = seamlessNoise(x * 0.5, y * 0.5, width, height) * 0.5;
      const n3 = hash2d(x, y) * 0.35;

      const combined = (n1 + n2 + n3) / 1.85;
      const lum = Math.round(combined * 255);
      buffer[y * width + x] = Math.max(0, Math.min(255, lum));
    }
  }

  return buffer;
}

/**
 * Generates a subtle cold-press watercolor paper grain.
 */
export function generateColdPressPaperTexture(width = 128, height = 128): Uint8Array {
  const buffer = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n1 = seamlessNoise(x * 0.15, y * 0.15, width, height);
      const n2 = seamlessNoise(x * 0.35, y * 0.35, width, height) * 0.35;
      const fine = hash2d(x % 32, y % 32) * 0.15;

      const combined = (n1 + n2 + fine) / 1.5;
      const lum = Math.round(100 + combined * 155);
      buffer[y * width + x] = Math.max(0, Math.min(255, lum));
    }
  }

  return buffer;
}

/**
 * Creates default brush texture configs for Charcoal, Canvas, and Cold Press.
 */
export function createDefaultCharcoalTextureConfig(): BrushTextureConfig {
  const size = 128;
  return {
    patternId: "charcoal-paper-tooth",
    name: "Charcoal Tooth",
    width: size,
    height: size,
    bytes: generateCharcoalPaperTexture(size, size),
    scale: 1.0,
    mode: "subtract",
    strength: 1.0,
    byPressure: true,
  };
}

export function createDefaultCanvasTextureConfig(): BrushTextureConfig {
  const size = 128;
  return {
    patternId: "woven-canvas",
    name: "Woven Canvas",
    width: size,
    height: size,
    bytes: generateCanvasTexture(size, size),
    scale: 1.0,
    mode: "multiply",
    strength: 0.85,
    byPressure: false,
  };
}

export function createDefaultColdPressTextureConfig(): BrushTextureConfig {
  const size = 128;
  return {
    patternId: "cold-press-paper",
    name: "Cold Press Paper",
    width: size,
    height: size,
    bytes: generateColdPressPaperTexture(size, size),
    scale: 1.0,
    mode: "multiply",
    strength: 0.70,
    byPressure: true,
  };
}
