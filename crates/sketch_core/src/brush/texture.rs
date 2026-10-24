use std::sync::Arc;
use crate::brush::blend::{modulate_texture_alpha, TextureBlendMode};

/// Raw backing buffer for seamless paper grain / pattern texture.
#[derive(Debug, Clone, PartialEq)]
pub struct PatternData {
    pub width: u32,
    pub height: u32,
    /// Grayscale 8-bit luminance in `[0..255]`.
    pub bytes: Vec<u8>,
}

impl PatternData {
    /// Constructs a pattern from 8-bit grayscale bytes.
    pub fn from_grayscale(width: u32, height: u32, bytes: Vec<u8>) -> Self {
        Self { width, height, bytes }
    }

    /// Constructs a pattern from RGBA8 interleaved bytes, calculating Rec. 601 luminance.
    pub fn from_rgba(width: u32, height: u32, rgba_bytes: &[u8]) -> Self {
        let pixel_count = (width * height) as usize;
        let mut bytes = Vec::with_capacity(pixel_count);
        for chunk in rgba_bytes.chunks_exact(4) {
            let r = chunk[0] as f32;
            let g = chunk[1] as f32;
            let b = chunk[2] as f32;
            let lum = (0.299 * r + 0.587 * g + 0.114 * b).round().clamp(0.0, 255.0) as u8;
            bytes.push(lum);
        }
        Self { width, height, bytes }
    }
}

/// Configuration parameters for paper texture modulation matching Krita's `KisTextureOption`.
#[derive(Debug, Clone, PartialEq)]
pub struct TextureConfig {
    /// Shared pointer to the texture pattern buffer.
    pub pattern: Arc<PatternData>,
    /// Scaling multiplier applied to pattern texture coordinates.
    pub scale: f32,
    /// Horizontal offset in canvas pixels.
    pub offset_x: i32,
    /// Vertical offset in canvas pixels.
    pub offset_y: i32,
    /// Texture brightness adjustment in `[-1.0..1.0]` (default: 0.0).
    pub brightness: f32,
    /// Texture contrast adjustment in `[0.0..2.0]` (default: 1.0).
    pub contrast: f32,
    /// Lower cutoff / threshold in `[0.0..1.0]` (default: 0.0).
    pub cutoff_left: f32,
    /// Upper cutoff / threshold in `[0.0..1.0]` (default: 1.0).
    pub cutoff_right: f32,
    /// Whether the pattern grayscale values are inverted.
    pub invert: bool,
    /// Texture blend mode (Multiply, Subtract, Add, Screen, etc.).
    pub mode: TextureBlendMode,
    /// Modulation strength in `[0.0..1.0]` (often modulated by pressure).
    pub strength: f32,
}

impl Default for TextureConfig {
    fn default() -> Self {
        Self {
            pattern: Arc::new(PatternData::from_grayscale(1, 1, vec![255])),
            scale: 1.0,
            offset_x: 0,
            offset_y: 0,
            brightness: 0.0,
            contrast: 1.0,
            cutoff_left: 0.0,
            cutoff_right: 1.0,
            invert: false,
            mode: TextureBlendMode::Multiply,
            strength: 1.0,
        }
    }
}

/// Modulates a dab's alpha mask with paper pattern texture locked to world canvas space.
///
/// In accordance with Krita's `KisTextureOption`:
/// 1. Pattern coordinates tile across the infinite canvas:
///    u = floor((world_x - offset_x) / scale) mod pat_w
///    v = floor((world_y - offset_y) / scale) mod pat_h
/// 2. Raw luminance is adjusted by brightness, contrast, cutoff, and inversion.
/// 3. The resulting texture sample modulates the dab's alpha mask via `mode` and `strength`.
pub fn apply_texture_to_dab(
    dab_mask: &mut [u8],
    dab_w: usize,
    dab_h: usize,
    canvas_origin_x: i32,
    canvas_origin_y: i32,
    config: &TextureConfig,
    dynamic_strength: f32,
) {
    if dynamic_strength <= 0.001 || config.strength <= 0.001 {
        return;
    }

    let pat_w = config.pattern.width as isize;
    let pat_h = config.pattern.height as isize;
    if pat_w <= 0 || pat_h <= 0 {
        return;
    }

    let total_strength = (config.strength * dynamic_strength).clamp(0.0, 1.0);
    let inv_scale = 1.0 / config.scale.max(0.01);
    let cutoff_range = (config.cutoff_right - config.cutoff_left).max(0.001);

    let pat_data = &config.pattern.bytes;
    let pat_w_usize = config.pattern.width as usize;

    for y in 0..dab_h {
        let world_y = canvas_origin_y + y as i32;
        let dab_row = y * dab_w;

        // Modulo wrapping in world canvas space
        let v = (((world_y - config.offset_y) as f32 * inv_scale).floor() as isize).rem_euclid(pat_h) as usize;
        let pat_row = v * pat_w_usize;

        for x in 0..dab_w {
            let dab_idx = dab_row + x;
            let current_alpha = dab_mask[dab_idx];
            if current_alpha == 0 {
                continue;
            }

            let world_x = canvas_origin_x + x as i32;
            let u = (((world_x - config.offset_x) as f32 * inv_scale).floor() as isize).rem_euclid(pat_w) as usize;

            let raw_lum = pat_data[pat_row + u] as f32 / 255.0;

            // Apply contrast and brightness: L1 = (L0 - 0.5) * contrast + 0.5 + brightness
            let l1 = ((raw_lum - 0.5) * config.contrast + 0.5 + config.brightness).clamp(0.0, 1.0);

            // Cutoff thresholding
            let mut t = if l1 <= config.cutoff_left {
                0.0
            } else if l1 >= config.cutoff_right {
                1.0
            } else {
                (l1 - config.cutoff_left) / cutoff_range
            };

            if config.invert {
                t = 1.0 - t;
            }

            let pattern_sample = (t * 255.0).round().clamp(0.0, 255.0) as u8;

            dab_mask[dab_idx] = modulate_texture_alpha(
                current_alpha,
                pattern_sample,
                total_strength,
                config.mode,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_texture_world_tiling() {
        // 2x2 pattern: top row = [0, 255], bottom row = [255, 0]
        let pattern = Arc::new(PatternData::from_grayscale(2, 2, vec![0, 255, 255, 0]));
        let config = TextureConfig {
            pattern,
            scale: 1.0,
            mode: TextureBlendMode::Multiply,
            strength: 1.0,
            ..Default::default()
        };

        let mut dab = vec![255u8; 4]; // 2x2 dab
        // Place dab at canvas origin (0, 0)
        apply_texture_to_dab(&mut dab, 2, 2, 0, 0, &config, 1.0);

        // Under Multiply, dab[0] with pattern[0]=0 gives 0
        assert_eq!(dab[0], 0);
        // dab[1] with pattern[1]=255 gives 255
        assert_eq!(dab[1], 255);
        // dab[2] with pattern[2]=255 gives 255
        assert_eq!(dab[2], 255);
        // dab[3] with pattern[3]=0 gives 0
        assert_eq!(dab[3], 0);
    }
}
