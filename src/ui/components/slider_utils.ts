/**
 * Utility functions for non-linear brush dynamics sliders (Size & Opacity).
 * 
 * Provides perceptual quadratic scaling for brush size (giving high precision in the 1-50px range)
 * and linear/clamped scaling for opacity.
 */

export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 300;

/**
 * Maps a normalized slider position t in [0, 1] to a brush size in [1, 300].
 * Uses a quadratic curve: S(t) = 1 + t^2 * (MAX - 1).
 * This dedicates ~40% of the slider travel to sizes under 50px for fine artistic control.
 */
export function ratioToBrushSize(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  const size = MIN_BRUSH_SIZE + Math.pow(clamped, 2) * (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE);
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size)));
}

/**
 * Inverts a brush size in [1, 300] back to a normalized slider position in [0, 1].
 * t = sqrt((size - 1) / (MAX - 1)).
 */
export function brushSizeToRatio(size: number): number {
  const clamped = Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, size));
  return Math.sqrt((clamped - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE));
}

/**
 * Maps a normalized slider position t in [0, 1] to an opacity value in [0.01, 1.0].
 * Clamped and rounded to 2 decimal places (whole percentage).
 */
export function ratioToOpacity(ratio: number): number {
  const clamped = Math.max(0.01, Math.min(1, ratio));
  return Math.round(clamped * 100) / 100;
}

/**
 * Inverts an opacity value in [0, 1] to a normalized slider ratio in [0, 1].
 */
export function opacityToRatio(opacity: number): number {
  return Math.max(0, Math.min(1, opacity));
}
