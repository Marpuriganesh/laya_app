use std::sync::Arc;

/// Represents the type and geometry configuration of a brush tip.
#[derive(Debug, Clone, PartialEq)]
pub enum BrushTipType {
    /// Procedurally generated elliptical/circular auto-brush tip.
    Auto {
        /// Aspect ratio of vertical to horizontal radius in `[0.01..1.0]`. 1.0 = round circle.
        aspect_ratio: f32,
        /// Rotation angle of the brush tip in radians.
        angle_radians: f32,
    },
    /// Predefined raster image stamp (e.g. loaded from `.gbr` or image).
    Predefined {
        tip_data: Arc<PredefinedTipData>,
        /// Scale multiplier applied on top of dynamic brush sizing.
        scale: f32,
        /// Rotation angle of the stamp in radians.
        angle_radians: f32,
    },
}

impl Default for BrushTipType {
    fn default() -> Self {
        Self::Auto {
            aspect_ratio: 1.0,
            angle_radians: 0.0,
        }
    }
}

/// Raw backing buffer for a predefined image tip (.gbr or PNG).
#[derive(Debug, Clone, PartialEq)]
pub struct PredefinedTipData {
    pub width: u32,
    pub height: u32,
    /// Grayscale alpha mask in `[0..255]`.
    /// White is color (255 = fully opaque ink), Black is transparent (0 = transparent).
    pub mask: Vec<u8>,
    /// Optional RGBA data if this is a full-color brush stamp.
    pub color_data: Option<Vec<u8>>,
}

impl PredefinedTipData {
    /// Creates a new grayscale predefined tip from raw bytes.
    /// By default, White is color (255 = fully opaque ink), Black is transparent (0 = transparent).
    /// If `invert` is true, values are inverted (`alpha = 255 - raw_byte`).
    pub fn from_gbr_grayscale(width: u32, height: u32, raw_bytes: &[u8], invert: bool) -> Self {
        let mask = if invert {
            raw_bytes.iter().map(|&b| 255 - b).collect()
        } else {
            raw_bytes.to_vec()
        };
        Self {
            width,
            height,
            mask,
            color_data: None,
        }
    }

    /// Creates a predefined tip from RGBA8 interleaved pixels.
    ///
    /// # Opacity & Transparency Resolution (matching Krita KisCustomImageBrush):
    /// 1. If the image has an alpha channel with real transparency (any alpha < 255),
    ///    the alpha channel is used directly (alpha 255 = opaque ink, 0 = transparent).
    /// 2. If the image is fully opaque (all alpha == 255, e.g. standard PNG brush drawn on paper):
    ///    - If corners are bright/white (average corner luminance > 128), it represents black/dark
    ///      ink drawn on white paper (like Krita's chalk.png and bristles_*.png).
    ///      The luminance is inverted (`alpha = 255 - lum`), turning the white paper transparent (0)
    ///      and dark ink marks opaque (up to 255).
    ///    - If corners are dark (average corner luminance <= 128), it represents light/white marks
    ///      on a dark background (`alpha = lum`), turning the dark background transparent (0).
    pub fn from_rgba(width: u32, height: u32, rgba_bytes: &[u8]) -> Self {
        let pixel_count = (width * height) as usize;
        let mut mask = Vec::with_capacity(pixel_count);
        let mut has_transparency = false;

        for chunk in rgba_bytes.chunks_exact(4) {
            if chunk[3] < 255 {
                has_transparency = true;
            }
            mask.push(chunk[3]);
        }

        if !has_transparency && pixel_count > 0 {
            let w = width as usize;
            let h = height as usize;
            let sample_lum = |x: usize, y: usize| -> f32 {
                let idx = (y * w + x) * 4;
                0.299 * rgba_bytes[idx] as f32
                    + 0.587 * rgba_bytes[idx + 1] as f32
                    + 0.114 * rgba_bytes[idx + 2] as f32
            };

            let c_tl = sample_lum(0, 0);
            let c_tr = sample_lum(w.saturating_sub(1), 0);
            let c_bl = sample_lum(0, h.saturating_sub(1));
            let c_br = sample_lum(w.saturating_sub(1), h.saturating_sub(1));
            let avg_corner_lum = (c_tl + c_tr + c_bl + c_br) * 0.25;

            // If corners are white/bright (> 128), this is ink on white paper -> invert paper to transparent
            let invert_paper = avg_corner_lum > 128.0;

            mask.clear();
            for chunk in rgba_bytes.chunks_exact(4) {
                let lum = (0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32).round() as u8;
                let alpha = if invert_paper { 255 - lum } else { lum };
                mask.push(alpha);
            }
        }

        Self {
            width,
            height,
            mask,
            color_data: Some(rgba_bytes.to_vec()),
        }
    }
}

/// Renders dab alpha masks for Auto (analytical circle/ellipse) and Predefined tips.
#[derive(Debug, Default, Clone, Copy)]
pub struct BrushTipRasterizer;

impl BrushTipRasterizer {
    pub fn new() -> Self {
        Self
    }

    /// Renders an AutoBrush circular or elliptical tip matching Krita's `KisCircleMaskGenerator`.
    ///
    /// # Coordinates & Rotation
    /// Rotates coordinates into local brush space:
    ///   x_r = dx * cos(θ) + dy * sin(θ)
    ///   y_r = -dx * sin(θ) + dy * cos(θ)
    ///
    /// # Elliptical Metric
    ///   u = x_r / r_x
    ///   v = y_r / r_y
    ///   d = sqrt(u^2 + v^2)
    ///
    /// # Subpixel Anti-Aliasing
    /// Applies analytical coverage band along outer perimeter.
    #[allow(clippy::too_many_arguments)]
    pub fn render_auto_brush(
        &self,
        radius: f32,
        aspect_ratio: f32,
        angle_rad: f32,
        softness: f32,
        sub_x: f32,
        sub_y: f32,
        antialias: bool,
        out_mask: &mut Vec<u8>,
    ) -> (usize, usize) {
        let size = (radius * 2.0).ceil() as usize + 2;
        let total_pixels = size * size;
        if out_mask.len() < total_pixels {
            out_mask.resize(total_pixels, 0);
        }

        let cos_a = angle_rad.cos();
        let sin_a = angle_rad.sin();
        let r_x = radius.max(0.5);
        let r_y = (radius * aspect_ratio.clamp(0.01, 1.0)).max(0.5);

        let fade_r = 1.0 - softness.clamp(0.0, 1.0);
        let softness_range = softness.clamp(0.001, 1.0);

        for y in 0..size {
            let dy = (y as f32 + 0.5) - sub_y;
            let row = y * size;
            for x in 0..size {
                let dx = (x as f32 + 0.5) - sub_x;

                // 2D coordinate rotation into local brush space
                let xr = dx * cos_a + dy * sin_a;
                let yr = -dx * sin_a + dy * cos_a;

                // Normalized elliptical distance
                let u = xr / r_x;
                let v = yr / r_y;
                let d = (u * u + v * v).sqrt();

                if d > 1.0 + (0.5 / r_x) {
                    out_mask[row + x] = 0;
                    continue;
                }

                let alpha = if !antialias {
                    if d <= 1.0 {
                        if softness <= 0.001 || d <= fade_r {
                            255
                        } else {
                            let ratio = (1.0 - d) / softness_range;
                            (ratio * 255.0).clamp(0.0, 255.0) as u8
                        }
                    } else {
                        0
                    }
                } else {
                    // Analytical 1-pixel subpixel anti-aliasing band
                    let perimeter_dist = d * r_x;
                    let coverage = (r_x + 0.5 - perimeter_dist).clamp(0.0, 1.0);

                    if coverage <= 0.0 {
                        0
                    } else if softness <= 0.001 || d <= fade_r {
                        (coverage * 255.0).round().clamp(0.0, 255.0) as u8
                    } else {
                        let soft_ratio = ((1.0 - d) / softness_range).clamp(0.0, 1.0);
                        (coverage * soft_ratio * 255.0).round().clamp(0.0, 255.0) as u8
                    }
                };

                out_mask[row + x] = alpha;
            }
        }

        (size, size)
    }

    /// Renders a Predefined Brush Tip (stamped image mask) scaled and rotated via bilinear interpolation.
    pub fn render_predefined_tip(
        &self,
        tip: &PredefinedTipData,
        target_diameter: f32,
        angle_rad: f32,
        sub_x: f32,
        sub_y: f32,
        out_mask: &mut Vec<u8>,
    ) -> (usize, usize) {
        let size = target_diameter.ceil() as usize + 2;
        let total_pixels = size * size;
        if out_mask.len() < total_pixels {
            out_mask.resize(total_pixels, 0);
        }

        let src_w = tip.width as f32;
        let src_h = tip.height as f32;
        let max_dim = src_w.max(src_h).max(1.0);

        let scale = target_diameter / max_dim;
        let inv_scale = 1.0 / scale.max(0.001);

        let cos_a = (-angle_rad).cos();
        let sin_a = (-angle_rad).sin();

        let src_cx = src_w * 0.5;
        let src_cy = src_h * 0.5;

        for y in 0..size {
            let dy = (y as f32 + 0.5) - sub_y;
            let row = y * size;
            for x in 0..size {
                let dx = (x as f32 + 0.5) - sub_x;

                // Rotate and scale back to source image coordinates
                let xr = (dx * cos_a - dy * sin_a) * inv_scale + src_cx;
                let yr = (dx * sin_a + dy * cos_a) * inv_scale + src_cy;

                if xr < 0.0 || xr >= src_w - 1.0 || yr < 0.0 || yr >= src_h - 1.0 {
                    out_mask[row + x] = 0;
                    continue;
                }

                // Bilinear interpolation
                let x0 = xr.floor() as usize;
                let y0 = yr.floor() as usize;
                let x1 = (x0 + 1).min(tip.width as usize - 1);
                let y1 = (y0 + 1).min(tip.height as usize - 1);

                let fx = xr - x0 as f32;
                let fy = yr - y0 as f32;

                let w = tip.width as usize;
                let p00 = tip.mask[y0 * w + x0] as f32;
                let p10 = tip.mask[y0 * w + x1] as f32;
                let p01 = tip.mask[y1 * w + x0] as f32;
                let p11 = tip.mask[y1 * w + x1] as f32;

                let top = p00 * (1.0 - fx) + p10 * fx;
                let bottom = p01 * (1.0 - fx) + p11 * fx;
                let sample = top * (1.0 - fy) + bottom * fy;

                out_mask[row + x] = sample.round().clamp(0.0, 255.0) as u8;
            }
        }

        (size, size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_auto_brush_circle() {
        let rasterizer = BrushTipRasterizer::new();
        let mut mask = Vec::new();
        let (w, h) = rasterizer.render_auto_brush(10.0, 1.0, 0.0, 0.5, 10.0, 10.0, true, &mut mask);
        assert_eq!(w, h);
        // Center pixel must be opaque
        let center = 10 * w + 10;
        assert_eq!(mask[center], 255);
    }

    #[test]
    fn test_render_auto_brush_ellipse() {
        let rasterizer = BrushTipRasterizer::new();
        let mut mask = Vec::new();
        // Aspect ratio 0.5 (half height)
        let (w, h) = rasterizer.render_auto_brush(10.0, 0.5, 0.0, 0.0, 10.0, 10.0, true, &mut mask);
        assert_eq!(w, h);
        assert_eq!(mask[10 * w + 10], 255);
    }

    #[test]
    fn test_predefined_gbr_opacity_mapping() {
        // Direct opacity: byte 255 (white ink) is 255 opaque, 0 (black background) is 0 transparent
        let tip = PredefinedTipData::from_gbr_grayscale(2, 2, &[0, 255, 128, 0], false);
        assert_eq!(tip.mask[0], 0);
        assert_eq!(tip.mask[1], 255);
        assert_eq!(tip.mask[2], 128);
        assert_eq!(tip.mask[3], 0);

        // Invert option: when invert is true, 0 becomes 255 and 255 becomes 0
        let tip_inv = PredefinedTipData::from_gbr_grayscale(2, 2, &[0, 255, 128, 0], true);
        assert_eq!(tip_inv.mask[0], 255);
        assert_eq!(tip_inv.mask[1], 0);
        assert_eq!(tip_inv.mask[2], 127);
        assert_eq!(tip_inv.mask[3], 255);
    }

    #[test]
    fn test_predefined_rgba_white_paper_png() {
        // Simulating a 2x2 PNG drawn with black ink on white paper:
        // Corners: white paper [255, 255, 255, 255]
        // Center/Ink: dark bristle [0, 0, 0, 255]
        let pixels = [
            255, 255, 255, 255, // White paper (corner)
            0,   0,   0,   255, // Black ink
            255, 255, 255, 255, // White paper
            255, 255, 255, 255, // White paper
        ];
        let tip = PredefinedTipData::from_rgba(2, 2, &pixels);
        // White paper should be 0 (transparent background), black ink should be 255 (opaque ink)
        assert_eq!(tip.mask[0], 0);
        assert_eq!(tip.mask[1], 255);
        assert_eq!(tip.mask[2], 0);
        assert_eq!(tip.mask[3], 0);
    }

    #[test]
    fn test_predefined_rgba_transparent_png() {
        // Simulating a 2x2 PNG with actual transparency channel:
        let pixels = [
            0,   0,   0,   0,   // Transparent background
            255, 0,   0,   255, // Opaque dab
            0,   0,   0,   0,   // Transparent
            255, 0,   0,   128, // 50% alpha
        ];
        let tip = PredefinedTipData::from_rgba(2, 2, &pixels);
        assert_eq!(tip.mask[0], 0);
        assert_eq!(tip.mask[1], 255);
        assert_eq!(tip.mask[2], 0);
        assert_eq!(tip.mask[3], 128);
    }
}
