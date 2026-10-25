/// Pure, modular mathematical blend mode functions matching Krita's composite operations (Pigment).
///
/// Designed in accordance with:
/// - Rule I: Mathematical transparency & explanatory comments.
/// - Rule II: Strict Single Responsibility Principle (one function = one job).
/// - Rule IV: 1:1 C++/Rust/Wasm and WGSL translatability.
///
/// Every channel function operates on `f32` in `[0.0, 255.0]` (or normalized `[0.0, 1.0]`),
/// and integer helpers provide zero-allocation `u8` operations.

// ============================================================================
// 1. Single-Channel Blending Functions (Pure Math)
// ============================================================================

/// Normal channel blend: source replaces destination.
#[inline(always)]
pub fn blend_channel_normal(_dst: f32, src: f32) -> f32 {
    src
}

/// Multiply: f(d, s) = (d * s) / 255.0
#[inline(always)]
pub fn blend_channel_multiply(dst: f32, src: f32) -> f32 {
    (dst * src) / 255.0
}

/// Screen: f(d, s) = 255.0 - ((255.0 - d) * (255.0 - s)) / 255.0
#[inline(always)]
pub fn blend_channel_screen(dst: f32, src: f32) -> f32 {
    255.0 - ((255.0 - dst) * (255.0 - src)) / 255.0
}

/// Overlay: Multiplies darks, screens lights based on destination.
#[inline(always)]
pub fn blend_channel_overlay(dst: f32, src: f32) -> f32 {
    if dst < 128.0 {
        (2.0 * dst * src) / 255.0
    } else {
        255.0 - (2.0 * (255.0 - dst) * (255.0 - src)) / 255.0
    }
}

/// Hard Light: Multiplies darks, screens lights based on source (inverse of overlay).
#[inline(always)]
pub fn blend_channel_hard_light(dst: f32, src: f32) -> f32 {
    if src < 128.0 {
        (2.0 * dst * src) / 255.0
    } else {
        255.0 - (2.0 * (255.0 - dst) * (255.0 - src)) / 255.0
    }
}

/// Soft Light: W3C Pegtop formula for gentle contrast adjustment.
#[inline(always)]
pub fn blend_channel_soft_light(dst: f32, src: f32) -> f32 {
    let d = dst / 255.0;
    let s = src / 255.0;
    let res = if s <= 0.5 {
        d - (1.0 - 2.0 * s) * d * (1.0 - d)
    } else {
        let factor_d = if d <= 0.25 {
            ((16.0 * d - 12.0) * d + 4.0) * d
        } else {
            d.sqrt()
        };
        d + (2.0 * s - 1.0) * (factor_d - d)
    };
    res * 255.0
}

/// Darken: f(d, s) = min(d, s)
#[inline(always)]
pub fn blend_channel_darken(dst: f32, src: f32) -> f32 {
    dst.min(src)
}

/// Lighten: f(d, s) = max(d, s)
#[inline(always)]
pub fn blend_channel_lighten(dst: f32, src: f32) -> f32 {
    dst.max(src)
}

/// Color Dodge: Brightens destination by dividing by the inverse of source.
#[inline(always)]
pub fn blend_channel_color_dodge(dst: f32, src: f32) -> f32 {
    if src >= 255.0 {
        255.0
    } else {
        ((dst * 255.0) / (255.0 - src)).min(255.0)
    }
}

/// Color Burn: Darkens destination by inverting, dividing, and re-inverting.
#[inline(always)]
pub fn blend_channel_color_burn(dst: f32, src: f32) -> f32 {
    if src <= 0.0 {
        0.0
    } else {
        (255.0 - ((255.0 - dst) * 255.0) / src).max(0.0)
    }
}

/// Linear Dodge (Addition): f(d, s) = min(255, d + s)
#[inline(always)]
pub fn blend_channel_add(dst: f32, src: f32) -> f32 {
    (dst + src).min(255.0)
}

/// Linear Burn: f(d, s) = max(0, d + s - 255)
#[inline(always)]
pub fn blend_channel_linear_burn(dst: f32, src: f32) -> f32 {
    (dst + src - 255.0).max(0.0)
}

/// Subtract: f(d, s) = max(0, d - s)
#[inline(always)]
pub fn blend_channel_subtract(dst: f32, src: f32) -> f32 {
    (dst - src).max(0.0)
}

/// Inverse Subtract: f(d, s) = max(0, s - d)
#[inline(always)]
pub fn blend_channel_inverse_subtract(dst: f32, src: f32) -> f32 {
    (src - dst).max(0.0)
}

/// Divide: f(d, s) = min(255, (d * 256) / (s + 1))
#[inline(always)]
pub fn blend_channel_divide(dst: f32, src: f32) -> f32 {
    if src <= 0.0 {
        255.0
    } else {
        ((dst * 255.0) / src).min(255.0)
    }
}

/// Vivid Light: Combines Color Burn and Color Dodge.
#[inline(always)]
pub fn blend_channel_vivid_light(dst: f32, src: f32) -> f32 {
    if src < 128.0 {
        blend_channel_color_burn(dst, 2.0 * src)
    } else {
        blend_channel_color_dodge(dst, 2.0 * (src - 128.0))
    }
}

/// Linear Light: Combines Linear Burn and Linear Dodge.
#[inline(always)]
pub fn blend_channel_linear_light(dst: f32, src: f32) -> f32 {
    (dst + 2.0 * src - 255.0).clamp(0.0, 255.0)
}

/// Pin Light: Selectively replaces pixels based on extreme source brightness.
#[inline(always)]
pub fn blend_channel_pin_light(dst: f32, src: f32) -> f32 {
    if src < 128.0 {
        dst.min(2.0 * src)
    } else {
        dst.max(2.0 * (src - 128.0))
    }
}

/// Hard Mix: Extreme thresholding to binary posterization.
#[inline(always)]
pub fn blend_channel_hard_mix(dst: f32, src: f32) -> f32 {
    if dst + src >= 255.0 {
        255.0
    } else {
        0.0
    }
}

/// Difference: f(d, s) = |d - s|
#[inline(always)]
pub fn blend_channel_difference(dst: f32, src: f32) -> f32 {
    (dst - src).abs()
}

/// Exclusion: f(d, s) = d + s - (2 * d * s) / 255.0
#[inline(always)]
pub fn blend_channel_exclusion(dst: f32, src: f32) -> f32 {
    dst + src - (2.0 * dst * src) / 255.0
}

/// Parallel: Krita parallel / harmonic blend mode.
/// Calculates the harmonic mean of destination and source channels:
/// f(d, s) = 2.0 / (1/d + 1/s) = (2.0 * d * s) / (d + s)
///
/// Blends colors in a natural, organic way akin to physical parallel circuits,
/// producing smooth, physical-like tonal transitions.
/// If `d + s <= 0.0`, returns 0.0 to prevent division by zero.
#[inline(always)]
pub fn blend_channel_parallel(dst: f32, src: f32) -> f32 {
    let sum = dst + src;
    if sum <= 0.0 {
        0.0
    } else {
        ((2.0 * dst * src) / sum).clamp(0.0, 255.0)
    }
}

// ============================================================================
// 2. Modular Texture Modes (Krita KisTextureOption Modulation)
// ============================================================================

/// Identifies the texture blend mode used to modulate brush dabs with paper grain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum TextureBlendMode {
    #[default]
    Multiply = 0,
    Subtract = 1,
    Add = 2,
    Screen = 3,
    Overlay = 4,
    Divide = 5,
    Darken = 6,
    Lighten = 7,
    Parallel = 8,
}

impl TextureBlendMode {
    /// Parses a string representation (e.g. from Krita preset XML or JSON).
    pub fn from_str(name: &str) -> Self {
        match name.to_ascii_lowercase().as_str() {
            "multiply" | "mult" => Self::Multiply,
            "subtract" | "sub" => Self::Subtract,
            "add" | "linear_dodge" | "plus" => Self::Add,
            "screen" => Self::Screen,
            "overlay" => Self::Overlay,
            "divide" => Self::Divide,
            "darken" => Self::Darken,
            "lighten" => Self::Lighten,
            "parallel" | "harmonic" => Self::Parallel,
            _ => Self::Multiply,
        }
    }
}

/// Modulates a dab's alpha value with a paper pattern sample according to `mode` and `strength`.
///
/// # Arguments
/// * `dab_alpha` - The unmodulated alpha from the brush tip mask [0..255].
/// * `pattern_sample` - The grayscale texture intensity [0..255] (with brightness/contrast applied).
/// * `strength` - Texture modulation strength in [0.0..1.0] (often driven by stylus pressure).
///
/// Returns the resulting modulated alpha byte [0..255].
#[inline]
pub fn modulate_texture_alpha(
    dab_alpha: u8,
    pattern_sample: u8,
    strength: f32,
    mode: TextureBlendMode,
) -> u8 {
    if dab_alpha == 0 || strength <= 0.001 {
        return dab_alpha;
    }

    let a_f = dab_alpha as f32;
    let pat_f = pattern_sample as f32;
    let s = strength.clamp(0.0, 1.0);

    let res = match mode {
        // Multiply: α_out = α_dab * (1.0 - strength * (1.0 - pat / 255.0))
        TextureBlendMode::Multiply => {
            let mult_factor = 1.0 - s * (1.0 - pat_f / 255.0);
            a_f * mult_factor
        }
        // Subtract: α_out = clamp(α_dab - (255 - pat) * strength, 0, 255)
        TextureBlendMode::Subtract => {
            let cut = (255.0 - pat_f) * s;
            (a_f - cut).max(0.0)
        }
        // Add: α_out = clamp(α_dab + pat * strength, 0, 255)
        TextureBlendMode::Add => {
            let add = pat_f * s;
            (a_f + add).min(255.0)
        }
        // Screen: α_out = 255 - (255 - α_dab) * (1.0 - strength * (pat / 255.0))
        TextureBlendMode::Screen => {
            let inv_a = 255.0 - a_f;
            let screen_factor = 1.0 - s * (pat_f / 255.0);
            255.0 - inv_a * screen_factor
        }
        // Overlay: blends dab alpha with pattern sample
        TextureBlendMode::Overlay => {
            let blended = blend_channel_overlay(a_f, pat_f);
            a_f + (blended - a_f) * s
        }
        // Divide: lifts or cuts alpha based on texture
        TextureBlendMode::Divide => {
            let blended = blend_channel_divide(a_f, pat_f);
            a_f + (blended - a_f) * s
        }
        // Darken: min(a_f, pat_f) blended by strength
        TextureBlendMode::Darken => {
            let blended = a_f.min(pat_f);
            a_f + (blended - a_f) * s
        }
        // Lighten: max(a_f, pat_f) blended by strength
        TextureBlendMode::Lighten => {
            let blended = a_f.max(pat_f);
            a_f + (blended - a_f) * s
        }
        // Parallel: blends dab alpha with pattern sample via harmonic mean
        TextureBlendMode::Parallel => {
            let blended = blend_channel_parallel(a_f, pat_f);
            a_f + (blended - a_f) * s
        }
    };

    res.round().clamp(0.0, 255.0) as u8
}

// ============================================================================
// 3. Full RGB & RGBA Composite Functions
// ============================================================================

/// Supported color compositing blend modes for layers and brush strokes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum ColorBlendMode {
    #[default]
    Normal = 0,
    Multiply = 1,
    Screen = 2,
    Overlay = 3,
    Darken = 4,
    Lighten = 5,
    ColorDodge = 6,
    ColorBurn = 7,
    Add = 8,
    LinearBurn = 9,
    Subtract = 10,
    HardLight = 11,
    SoftLight = 12,
    Difference = 13,
    Exclusion = 14,
    Divide = 15,
    VividLight = 16,
    LinearLight = 17,
    PinLight = 18,
    HardMix = 19,
    Behind = 20,
    Erase = 21,
    Parallel = 22,
}

impl ColorBlendMode {
    pub fn from_str(name: &str) -> Self {
        match name.to_ascii_lowercase().as_str() {
            "normal" | "over" => Self::Normal,
            "multiply" | "mult" => Self::Multiply,
            "screen" => Self::Screen,
            "overlay" => Self::Overlay,
            "darken" => Self::Darken,
            "lighten" => Self::Lighten,
            "colordodge" | "dodge" => Self::ColorDodge,
            "colorburn" | "burn" => Self::ColorBurn,
            "add" | "lineardodge" | "plus" => Self::Add,
            "linearburn" => Self::LinearBurn,
            "subtract" | "sub" => Self::Subtract,
            "hardlight" => Self::HardLight,
            "softlight" => Self::SoftLight,
            "difference" | "diff" => Self::Difference,
            "exclusion" => Self::Exclusion,
            "divide" => Self::Divide,
            "vividlight" => Self::VividLight,
            "linearlight" => Self::LinearLight,
            "pinlight" => Self::PinLight,
            "hardmix" => Self::HardMix,
            "behind" => Self::Behind,
            "erase" | "destination_out" => Self::Erase,
            "parallel" | "harmonic" => Self::Parallel,
            _ => Self::Normal,
        }
    }
}

/// Blends two pure RGB triplets (excluding alpha).
#[inline]
pub fn blend_rgb(dst: [u8; 3], src: [u8; 3], mode: ColorBlendMode) -> [u8; 3] {
    let [dr, dg, db] = [dst[0] as f32, dst[1] as f32, dst[2] as f32];
    let [sr, sg, sb] = [src[0] as f32, src[1] as f32, src[2] as f32];

    let (r, g, b) = match mode {
        ColorBlendMode::Normal | ColorBlendMode::Behind | ColorBlendMode::Erase => (sr, sg, sb),
        ColorBlendMode::Multiply => (
            blend_channel_multiply(dr, sr),
            blend_channel_multiply(dg, sg),
            blend_channel_multiply(db, sb),
        ),
        ColorBlendMode::Screen => (
            blend_channel_screen(dr, sr),
            blend_channel_screen(dg, sg),
            blend_channel_screen(db, sb),
        ),
        ColorBlendMode::Overlay => (
            blend_channel_overlay(dr, sr),
            blend_channel_overlay(dg, sg),
            blend_channel_overlay(db, sb),
        ),
        ColorBlendMode::Darken => (
            blend_channel_darken(dr, sr),
            blend_channel_darken(dg, sg),
            blend_channel_darken(db, sb),
        ),
        ColorBlendMode::Lighten => (
            blend_channel_lighten(dr, sr),
            blend_channel_lighten(dg, sg),
            blend_channel_lighten(db, sb),
        ),
        ColorBlendMode::ColorDodge => (
            blend_channel_color_dodge(dr, sr),
            blend_channel_color_dodge(dg, sg),
            blend_channel_color_dodge(db, sb),
        ),
        ColorBlendMode::ColorBurn => (
            blend_channel_color_burn(dr, sr),
            blend_channel_color_burn(dg, sg),
            blend_channel_color_burn(db, sb),
        ),
        ColorBlendMode::Add => (
            blend_channel_add(dr, sr),
            blend_channel_add(dg, sg),
            blend_channel_add(db, sb),
        ),
        ColorBlendMode::LinearBurn => (
            blend_channel_linear_burn(dr, sr),
            blend_channel_linear_burn(dg, sg),
            blend_channel_linear_burn(db, sb),
        ),
        ColorBlendMode::Subtract => (
            blend_channel_subtract(dr, sr),
            blend_channel_subtract(dg, sg),
            blend_channel_subtract(db, sb),
        ),
        ColorBlendMode::HardLight => (
            blend_channel_hard_light(dr, sr),
            blend_channel_hard_light(dg, sg),
            blend_channel_hard_light(db, sb),
        ),
        ColorBlendMode::SoftLight => (
            blend_channel_soft_light(dr, sr),
            blend_channel_soft_light(dg, sg),
            blend_channel_soft_light(db, sb),
        ),
        ColorBlendMode::Difference => (
            blend_channel_difference(dr, sr),
            blend_channel_difference(dg, sg),
            blend_channel_difference(db, sb),
        ),
        ColorBlendMode::Exclusion => (
            blend_channel_exclusion(dr, sr),
            blend_channel_exclusion(dg, sg),
            blend_channel_exclusion(db, sb),
        ),
        ColorBlendMode::Divide => (
            blend_channel_divide(dr, sr),
            blend_channel_divide(dg, sg),
            blend_channel_divide(db, sb),
        ),
        ColorBlendMode::VividLight => (
            blend_channel_vivid_light(dr, sr),
            blend_channel_vivid_light(dg, sg),
            blend_channel_vivid_light(db, sb),
        ),
        ColorBlendMode::LinearLight => (
            blend_channel_linear_light(dr, sr),
            blend_channel_linear_light(dg, sg),
            blend_channel_linear_light(db, sb),
        ),
        ColorBlendMode::PinLight => (
            blend_channel_pin_light(dr, sr),
            blend_channel_pin_light(dg, sg),
            blend_channel_pin_light(db, sb),
        ),
        ColorBlendMode::HardMix => (
            blend_channel_hard_mix(dr, sr),
            blend_channel_hard_mix(dg, sg),
            blend_channel_hard_mix(db, sb),
        ),
        ColorBlendMode::Parallel => (
            blend_channel_parallel(dr, sr),
            blend_channel_parallel(dg, sg),
            blend_channel_parallel(db, sb),
        ),
    };

    [
        r.round().clamp(0.0, 255.0) as u8,
        g.round().clamp(0.0, 255.0) as u8,
        b.round().clamp(0.0, 255.0) as u8,
    ]
}

/// Fully composites a source pixel [R, G, B, A] over a destination pixel [R, G, B, A] with mode and opacity.
/// Follows standard W3C Porter-Duff compositing with blend mode formula:
///   α_out = α_s + α_d * (1 - α_s)
///   C_out = (α_s * (1 - α_d) * C_s + α_d * (1 - α_s) * C_d + α_s * α_d * B(C_d, C_s)) / α_out
#[inline]
pub fn composite_pixel(
    dst: [u8; 4],
    src: [u8; 4],
    opacity: f32,
    mode: ColorBlendMode,
) -> [u8; 4] {
    let src_a = (src[3] as f32 / 255.0) * opacity.clamp(0.0, 1.0);
    if src_a <= 0.0001 {
        return dst;
    }

    let dst_a = dst[3] as f32 / 255.0;

    // Erase mode: destination-out
    if mode == ColorBlendMode::Erase {
        let factor = (1.0 - src_a).max(0.0);
        let out_a = dst_a * factor;
        return [
            (dst[0] as f32 * factor).round() as u8,
            (dst[1] as f32 * factor).round() as u8,
            (dst[2] as f32 * factor).round() as u8,
            (out_a * 255.0).round().clamp(0.0, 255.0) as u8,
        ];
    }

    // Behind mode: source paints only behind existing opaque content (destination-under)
    if mode == ColorBlendMode::Behind {
        let out_a = dst_a + src_a * (1.0 - dst_a);
        if out_a <= 0.0001 {
            return [0, 0, 0, 0];
        }
        let inv_dst_a = 1.0 - dst_a;
        let r = (dst[0] as f32 * dst_a + src[0] as f32 * src_a * inv_dst_a) / out_a;
        let g = (dst[1] as f32 * dst_a + src[1] as f32 * src_a * inv_dst_a) / out_a;
        let b = (dst[2] as f32 * dst_a + src[2] as f32 * src_a * inv_dst_a) / out_a;
        return [
            r.round().clamp(0.0, 255.0) as u8,
            g.round().clamp(0.0, 255.0) as u8,
            b.round().clamp(0.0, 255.0) as u8,
            (out_a * 255.0).round().clamp(0.0, 255.0) as u8,
        ];
    }

    let out_a = src_a + dst_a * (1.0 - src_a);
    if out_a <= 0.0001 {
        return [0, 0, 0, 0];
    }

    // When destination is completely transparent, color is source color
    if dst_a <= 0.0001 {
        return [
            src[0],
            src[1],
            src[2],
            (out_a * 255.0).round().clamp(0.0, 255.0) as u8,
        ];
    }

    let [dr, dg, db] = [dst[0] as f32, dst[1] as f32, dst[2] as f32];
    let [sr, sg, sb] = [src[0] as f32, src[1] as f32, src[2] as f32];

    // Evaluate pure color blend function B(dst, src)
    let [br, bg, bb] = blend_rgb([dst[0], dst[1], dst[2]], [src[0], src[1], src[2]], mode);
    let [br_f, bg_f, bb_f] = [br as f32, bg as f32, bb as f32];

    // Standard W3C non-separable / separable blending equation:
    // C_out = (src_a * (1 - dst_a) * src + dst_a * (1 - src_a) * dst + src_a * dst_a * B(dst, src)) / out_a
    let factor_src = src_a * (1.0 - dst_a);
    let factor_dst = dst_a * (1.0 - src_a);
    let factor_both = src_a * dst_a;

    let out_r = (factor_src * sr + factor_dst * dr + factor_both * br_f) / out_a;
    let out_g = (factor_src * sg + factor_dst * dg + factor_both * bg_f) / out_a;
    let out_b = (factor_src * sb + factor_dst * db + factor_both * bb_f) / out_a;

    [
        out_r.round().clamp(0.0, 255.0) as u8,
        out_g.round().clamp(0.0, 255.0) as u8,
        out_b.round().clamp(0.0, 255.0) as u8,
        (out_a * 255.0).round().clamp(0.0, 255.0) as u8,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multiply_channel() {
        assert_eq!(blend_channel_multiply(255.0, 128.0).round(), 128.0);
        assert_eq!(blend_channel_multiply(0.0, 255.0), 0.0);
        assert_eq!(blend_channel_multiply(255.0, 255.0), 255.0);
    }

    #[test]
    fn test_screen_channel() {
        assert_eq!(blend_channel_screen(0.0, 0.0), 0.0);
        assert_eq!(blend_channel_screen(255.0, 128.0), 255.0);
        assert_eq!(blend_channel_screen(128.0, 128.0).round(), 192.0);
    }

    #[test]
    fn test_add_subtract_channels() {
        assert_eq!(blend_channel_add(100.0, 200.0), 255.0);
        assert_eq!(blend_channel_add(50.0, 70.0), 120.0);
        assert_eq!(blend_channel_subtract(100.0, 120.0), 0.0);
        assert_eq!(blend_channel_subtract(100.0, 40.0), 60.0);
    }

    #[test]
    fn test_parallel_channel() {
        // Both pure white -> 255
        assert_eq!(blend_channel_parallel(255.0, 255.0).round(), 255.0);
        // Both 0 -> 0 (division by zero avoided)
        assert_eq!(blend_channel_parallel(0.0, 0.0), 0.0);
        // Zero with non-zero -> 0 (black absorbed)
        assert_eq!(blend_channel_parallel(0.0, 255.0), 0.0);
        assert_eq!(blend_channel_parallel(255.0, 0.0), 0.0);
        // Equal values preserve brightness: H(128, 128) = 128
        assert_eq!(blend_channel_parallel(128.0, 128.0).round(), 128.0);
        // Harmonic mean of 100 and 200: (2 * 100 * 200) / 300 = 133.333
        assert!((blend_channel_parallel(100.0, 200.0) - 133.33333).abs() < 0.01);
    }

    #[test]
    fn test_composite_pixel_opaque_parallel() {
        let dst = [200, 100, 50, 255];
        let src = [200, 100, 50, 255];
        let out = composite_pixel(dst, src, 1.0, ColorBlendMode::Parallel);
        assert_eq!(out, [200, 100, 50, 255]);
    }

    #[test]
    fn test_texture_modulation_multiply() {
        // Full opacity dab (255) with 50% texture (128) at full strength (1.0)
        let res = modulate_texture_alpha(255, 128, 1.0, TextureBlendMode::Multiply);
        assert_eq!(res, 128);

        // At 0 strength, texture has no effect
        let res_zero = modulate_texture_alpha(255, 128, 0.0, TextureBlendMode::Multiply);
        assert_eq!(res_zero, 255);
    }

    #[test]
    fn test_texture_modulation_subtract() {
        // Dab alpha 200, texture 200 (cut = 55), strength 1.0 -> 200 - 55 = 145
        let res = modulate_texture_alpha(200, 200, 1.0, TextureBlendMode::Subtract);
        assert_eq!(res, 145);
    }

    #[test]
    fn test_composite_pixel_opaque_multiply() {
        let dst = [255, 255, 255, 255]; // white
        let src = [128, 128, 128, 255]; // 50% gray
        let out = composite_pixel(dst, src, 1.0, ColorBlendMode::Multiply);
        assert_eq!(out, [128, 128, 128, 255]);
    }

    #[test]
    fn test_composite_pixel_erase() {
        let dst = [100, 100, 100, 255];
        let src = [0, 0, 0, 255];
        let out = composite_pixel(dst, src, 1.0, ColorBlendMode::Erase);
        assert_eq!(out[3], 0, "Full erase must reduce alpha to 0");
    }
}
