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
    ) -> Option<Rect> {
        let x_start = dest_x.max(0);
        let y_start = dest_y.max(0);
        let x_end = (dest_x + dab_w as i32).min(canvas.width as i32);
        let y_end = (dest_y + dab_h as i32).min(canvas.height as i32);

        if x_start >= x_end || y_start >= y_end {
            return None;
        }

        let [br, bg, bb, ba] = color;
        let flow_alpha_scale = (ba as f32 / 255.0) * flow_opacity;
        let br_f = br as f32;
        let bg_f = bg as f32;
        let bb_f = bb as f32;

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

                let src_a = (dab_alpha as f32 / 255.0) * flow_alpha_scale;
                let c_idx = canvas_row + (x as usize * 4);

                let dst_r = buffer[c_idx + 0] as f32;
                let dst_g = buffer[c_idx + 1] as f32;
                let dst_b = buffer[c_idx + 2] as f32;
                let dst_a = buffer[c_idx + 3] as f32 / 255.0;

                // Standard Porter-Duff "Source Over Destination" compositing formula
                let out_a = src_a + dst_a * (1.0 - src_a);
                if out_a > 0.0 {
                    let inv_src_a = 1.0 - src_a;
                    let dst_weight = dst_a * inv_src_a;

                    let out_r = (br_f * src_a + dst_r * dst_weight) / out_a;
                    let out_g = (bg_f * src_a + dst_g * dst_weight) / out_a;
                    let out_b = (bb_f * src_a + dst_b * dst_weight) / out_a;

                    buffer[c_idx + 0] = out_r.clamp(0.0, 255.0) as u8;
                    buffer[c_idx + 1] = out_g.clamp(0.0, 255.0) as u8;
                    buffer[c_idx + 2] = out_b.clamp(0.0, 255.0) as u8;
                    buffer[c_idx + 3] = (out_a * 255.0).clamp(0.0, 255.0) as u8;
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
        );

        assert_eq!(rect, Some(Rect::new(4, 4, 2, 2)));
        assert_eq!(canvas.get_pixel(4, 4), Some([255, 0, 0, 255]));
        assert_eq!(canvas.get_pixel(5, 5), Some([255, 0, 0, 255]));
        // Untouched neighbor should still be white
        assert_eq!(canvas.get_pixel(3, 3), Some([255, 255, 255, 255]));
    }
}
