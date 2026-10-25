use crate::brush::canvas::CanvasView;
use crate::brush::rect::Rect;

/// Performs Porter-Duff Over alpha compositing in-place into canvas memory.
#[derive(Debug, Default, Clone, Copy)]
pub struct CanvasBlitter;

impl CanvasBlitter {
    /// Constructs a new `CanvasBlitter`.
    pub fn new() -> Self {
        Self
    }

    /// Composites a single grayscale dab alpha mask onto the target RGBA canvas buffer.
    ///
    /// # Arguments
    /// * `canvas` - Target mutable canvas buffer.
    /// * `dab_mask` - Flat array of alpha values `[0..255]`.
    /// * `dab_w` - Width of the dab mask.
    /// * `dab_h` - Height of the dab mask.
    /// * `dest_x` - Canvas X position where the dab top-left begins.
    /// * `dest_y` - Canvas Y position where the dab top-left begins.
    /// * `color` - Brush RGBA8 color.
    /// * `flow_opacity` - Combined flow and opacity multiplier in `[0.0..1.0]`.
    ///
    /// Returns the clipped bounding `Rect` modified by this dab, or `None` if completely out of bounds.
    #[allow(clippy::too_many_arguments)]
    pub fn blit_dab(
        &self,
        canvas: &mut CanvasView,
        dab_mask: &[u8],
        dab_w: usize,
        dab_h: usize,
        dest_x: i32,
        dest_y: i32,
        color: [u8; 4],
        flow_opacity: f32,
        blend_mode: crate::brush::ColorBlendMode,
    ) -> Option<Rect> {
        let x_start = dest_x.max(0);
        let y_start = dest_y.max(0);
        let x_end = (dest_x + dab_w as i32).min(canvas.width as i32);
        let y_end = (dest_y + dab_h as i32).min(canvas.height as i32);

        if x_start >= x_end || y_start >= y_end {
            return None;
        }

        let [br, bg, bb, ba] = color;
        let flow_alpha_scale = if blend_mode == crate::brush::ColorBlendMode::Erase {
            flow_opacity
        } else {
            (ba as f32 / 255.0) * flow_opacity
        };

        let flow_scale_256 = (flow_alpha_scale * 256.0).round().clamp(0.0, 256.0) as u32;
        let is_normal_mode = blend_mode == crate::brush::ColorBlendMode::Normal;

        let canvas_width = canvas.width as usize;
        let buffer = &mut canvas.buffer;

        for y in y_start..y_end {
            let canvas_row = (y as usize) * canvas_width * 4;
            let dab_row = ((y - dest_y) as usize) * dab_w;

            for x in x_start..x_end {
                let dab_col = (x - dest_x) as usize;
                let dab_alpha = dab_mask[dab_row + dab_col];
                if dab_alpha == 0 {
                    continue;
                }

                let c_idx = canvas_row + (x as usize * 4);

                // High-performance integer fast path for standard Normal blend mode
                if is_normal_mode {
                    let sa = ((dab_alpha as u32 * flow_scale_256) >> 8).min(255);
                    if sa == 0 {
                        continue;
                    }

                    let da = buffer[c_idx + 3] as u32;

                    if da == 0 {
                        buffer[c_idx + 0] = br;
                        buffer[c_idx + 1] = bg;
                        buffer[c_idx + 2] = bb;
                        buffer[c_idx + 3] = sa as u8;
                    } else if sa == 255 {
                        buffer[c_idx + 0] = br;
                        buffer[c_idx + 1] = bg;
                        buffer[c_idx + 2] = bb;
                        buffer[c_idx + 3] = 255;
                    } else {
                        let inv_sa = 255 - sa;
                        let out_a = sa + (da * inv_sa + 127) / 255;
                        if out_a > 0 {
                            let factor_dst = (da * inv_sa + 127) / 255;
                            buffer[c_idx + 0] = ((br as u32 * sa + buffer[c_idx + 0] as u32 * factor_dst) / out_a).min(255) as u8;
                            buffer[c_idx + 1] = ((bg as u32 * sa + buffer[c_idx + 1] as u32 * factor_dst) / out_a).min(255) as u8;
                            buffer[c_idx + 2] = ((bb as u32 * sa + buffer[c_idx + 2] as u32 * factor_dst) / out_a).min(255) as u8;
                            buffer[c_idx + 3] = out_a.min(255) as u8;
                        }
                    }
                } else {
                    let src_pixel = [br, bg, bb, dab_alpha];
                    let dst_pixel = [
                        buffer[c_idx + 0],
                        buffer[c_idx + 1],
                        buffer[c_idx + 2],
                        buffer[c_idx + 3],
                    ];

                    let out = crate::brush::composite_pixel(dst_pixel, src_pixel, flow_alpha_scale, blend_mode);
                    buffer[c_idx + 0] = out[0];
                    buffer[c_idx + 1] = out[1];
                    buffer[c_idx + 2] = out[2];
                    buffer[c_idx + 3] = out[3];
                }
            }
        }

        Some(Rect::new(
            x_start,
            y_start,
            x_end - x_start,
            y_end - y_start,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blitter_opaque_over_white() {
        let mut canvas = CanvasView::new(10, 10);
        let blitter = CanvasBlitter::new();

        let mask = vec![255u8; 4]; // 2x2 fully opaque dab
        let rect = blitter.blit_dab(
            &mut canvas,
            &mask,
            2,
            2,
            4,
            4,
            [255, 0, 0, 255], // Red
            1.0,
            crate::brush::ColorBlendMode::Normal,
        );

        assert_eq!(rect, Some(Rect::new(4, 4, 2, 2)));
        assert_eq!(canvas.get_pixel(4, 4), Some([255, 0, 0, 255]));
        assert_eq!(canvas.get_pixel(5, 5), Some([255, 0, 0, 255]));
        // Untouched neighbor should still be white
        assert_eq!(canvas.get_pixel(3, 3), Some([255, 255, 255, 255]));

        // Test erase mode over the red pixels
        let erase_rect = blitter.blit_dab(
            &mut canvas,
            &mask,
            2,
            2,
            4,
            4,
            [0, 0, 0, 0],
            1.0,
            crate::brush::ColorBlendMode::Erase,
        );
        assert_eq!(erase_rect, Some(Rect::new(4, 4, 2, 2)));
        assert_eq!(canvas.get_pixel(4, 4), Some([0, 0, 0, 0]));
    }
}
