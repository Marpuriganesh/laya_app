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
    /// In accordance with Krita and GIMP `.gbr` specifications:
    /// In 1-BPP GBR brushes, 0 = black ink (fully opaque) and 255 = white paper (transparent).
    /// PredefinedTipData stores normalized alpha where 255 = fully opaque ink.
    pub mask: Vec<u8>,
    /// Optional RGBA data if this is a full-color brush stamp.
    pub color_data: Option<Vec<u8>>,
}

impl PredefinedTipData {
    /// Creates a new grayscale predefined tip from raw GBR bytes.
    /// Inverts 1-BPP GBR ink values (`alpha = 255 - raw_byte`) if `invert_gbr` is true.
    pub fn from_gbr_grayscale(width: u32, height: u32, raw_bytes: &[u8], invert_gbr: bool) -> Self {
        let mask = if invert_gbr {
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
    pub fn from_rgba(width: u32, height: u32, rgba_bytes: &[u8]) -> Self {
        let pixel_count = (width * height) as usize;
        let mut mask = Vec::with_capacity(pixel_count);
        for chunk in rgba_bytes.chunks_exact(4) {
            mask.push(chunk[3]); // Alpha channel
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
    fn test_predefined_gbr_inversion() {
        // GBR raw byte 0 (black ink) should become 255 opaque
        let tip = PredefinedTipData::from_gbr_grayscale(2, 2, &[0, 255, 128, 0], true);
        assert_eq!(tip.mask[0], 255);
        assert_eq!(tip.mask[1], 0);
        assert_eq!(tip.mask[2], 127);
        assert_eq!(tip.mask[3], 255);
    }
}
