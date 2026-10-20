/// Computes 2D radial dab alpha mask using Krita's analytical softness equation.
#[derive(Debug, Default, Clone, Copy)]
pub struct MaskRasterizer;

impl MaskRasterizer {
    /// Constructs a new `MaskRasterizer`.
    pub fn new() -> Self {
        Self
    }

    /// Renders an analytical radial softness circular dab alpha mask into a newly allocated vector.
    ///
    /// # Arguments
    /// * `radius` - Radius of the dab in pixels.
    /// * `softness` - Softness factor in `[0.0, 1.0]`. 0.0 = hard edge, 1.0 = maximum radial fade.
    /// * `sub_x` - Sub-pixel X offset of the dab center relative to integer dab origin.
    /// * `sub_y` - Sub-pixel Y offset of the dab center relative to integer dab origin.
    ///
    /// Returns `(mask, width, height)`.
    pub fn render_circle_dab(
        &self,
        radius: f32,
        softness: f32,
        sub_x: f32,
        sub_y: f32,
    ) -> (Vec<u8>, usize, usize) {
        let size = (radius * 2.0).ceil() as usize + 2;
        let mut mask = vec![0u8; size * size];
        self.render_circle_dab_into(radius, softness, sub_x, sub_y, &mut mask);
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

                let alpha = if dist >= radius {
                    0
                } else if dist <= fade_radius || softness_range <= 0.001 {
                    255
                } else {
                    // Krita linear radial edge falloff
                    let ratio = (radius - dist) / softness_range;
                    (ratio * 255.0).clamp(0.0, 255.0) as u8
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
        let (mask, w, h) = rasterizer.render_circle_dab(10.0, 0.5, 10.0, 10.0);
        assert_eq!(w, h);
        assert!(w >= 22);

        // Center pixel should be fully opaque (255)
        let center_idx = 10 * w + 10;
        assert_eq!(mask[center_idx], 255);

        // Far corner should be fully transparent (0)
        assert_eq!(mask[0], 0);
    }
}
