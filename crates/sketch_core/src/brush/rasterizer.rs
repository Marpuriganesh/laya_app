/// Computes 2D radial dab alpha mask using Krita's analytical softness equation
/// combined with subpixel edge anti-aliasing.
#[derive(Debug, Default, Clone, Copy)]
pub struct MaskRasterizer;

impl MaskRasterizer {
    /// Constructs a new `MaskRasterizer`.
    pub fn new() -> Self {
        Self
    }

    /// Renders an analytical circular dab alpha mask into a newly allocated vector.
    ///
    /// # Arguments
    /// * `radius` - Radius of the dab in pixels.
    /// * `softness` - Softness factor in `[0.0, 1.0]`. 0.0 = hard edge, 1.0 = maximum radial fade.
    /// * `sub_x` - Sub-pixel X offset of the dab center relative to integer dab origin.
    /// * `sub_y` - Sub-pixel Y offset of the dab center relative to integer dab origin.
    /// * `antialias` - Whether 1-pixel subpixel perimeter anti-aliasing is applied.
    ///
    /// Returns `(mask, width, height)`.
    pub fn render_circle_dab(
        &self,
        radius: f32,
        softness: f32,
        sub_x: f32,
        sub_y: f32,
        antialias: bool,
    ) -> (Vec<u8>, usize, usize) {
        let size = (radius * 2.0).ceil() as usize + 2;
        let mut mask = vec![0u8; size * size];
        self.render_circle_dab_into(radius, softness, sub_x, sub_y, antialias, &mut mask);
        (mask, size, size)
    }

    /// Renders the circular dab alpha mask directly into an existing output buffer (resizing if necessary)
    /// to eliminate per-dab heap allocations.
    pub fn render_circle_dab_into(
        &self,
        radius: f32,
        softness: f32,
        sub_x: f32,
        sub_y: f32,
        antialias: bool,
        mask: &mut Vec<u8>,
    ) -> (usize, usize) {
        let size = (radius * 2.0).ceil() as usize + 2;
        let total_pixels = size * size;
        if mask.len() < total_pixels {
            mask.resize(total_pixels, 0);
        }

        let fade_radius = radius * (1.0 - softness);
        let softness_range = radius - fade_radius;

        for y in 0..size {
            let dy = (y as f32 + 0.5) - sub_y;
            let row_offset = y * size;
            for x in 0..size {
                let dx = (x as f32 + 0.5) - sub_x;
                let dist = (dx * dx + dy * dy).sqrt();

                let alpha = if !antialias {
                    // Strict 1-bit binary cutoff for pixel art & hard inking
                    if dist < radius {
                        if softness <= 0.001 || dist <= fade_radius {
                            255
                        } else {
                            let ratio = (radius - dist) / softness_range;
                            (ratio * 255.0).clamp(0.0, 255.0) as u8
                        }
                    } else {
                        0
                    }
                } else {
                    // Analytical 1-pixel subpixel anti-aliasing band along the dab perimeter [radius - 0.5 .. radius + 0.5]
                    let coverage = (radius + 0.5 - dist).clamp(0.0, 1.0);
                    if coverage <= 0.0 {
                        0
                    } else if softness <= 0.001 || dist <= fade_radius {
                        (coverage * 255.0).round().clamp(0.0, 255.0) as u8
                    } else {
                        let soft_ratio = ((radius - dist) / softness_range).clamp(0.0, 1.0);
                        (coverage * soft_ratio * 255.0).round().clamp(0.0, 255.0) as u8
                    }
                };

                mask[row_offset + x] = alpha;
            }
        }

        (size, size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_circle_dab_center_opaque() {
        let rasterizer = MaskRasterizer::new();
        let (mask, w, h) = rasterizer.render_circle_dab(10.0, 0.5, 10.0, 10.0, true);
        assert_eq!(w, h);
        let center_idx = 10 * w + 10;
        assert_eq!(mask[center_idx], 255);
    }

    #[test]
    fn test_render_circle_dab_subpixel_antialias() {
        let rasterizer = MaskRasterizer::new();
        // Circle of radius 5.0, hard edge (softness 0.0), centered at (5.5, 5.5) so center coincides with pixel grid center
        let (mask, w, _) = rasterizer.render_circle_dab(5.0, 0.0, 5.5, 5.5, true);

        // Center pixel at (5, 5): dist = 0.0 -> 255
        assert_eq!(mask[5 * w + 5], 255);

        // Pixel at (11, 5): dx = 11.5 - 5.5 = 6.0, dy = 0.0 -> dist = 6.0 > 5.5 -> coverage = 0.0 -> 0
        assert_eq!(mask[5 * w + 11], 0);

        // Pixel at (10, 5): dx = 10.5 - 5.5 = 5.0, dy = 0.0 -> dist = 5.0 (exact radius!) -> coverage = 5.5 - 5.0 = 0.5 -> ~128
        let edge_val = mask[5 * w + 10];
        assert_eq!(edge_val, 128);

        // Pixel at (9, 5): dx = 9.5 - 5.5 = 4.0, dy = 0.0 -> dist = 4.0 <= 4.5 -> coverage = 1.0 -> 255
        assert_eq!(mask[5 * w + 9], 255);
    }

    #[test]
    fn test_render_circle_dab_no_antialias_binary() {
        let rasterizer = MaskRasterizer::new();
        let (mask, _, _) = rasterizer.render_circle_dab(5.0, 0.0, 5.0, 5.0, false);

        // Every pixel must be strictly 0 or 255
        for val in mask {
            assert!(val == 0 || val == 255, "Non-antialiased dab must be strictly binary");
        }
    }
}
