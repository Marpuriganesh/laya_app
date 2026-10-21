//! # sketch_core: Digital Painting & Drawing Engine
//!
//! A zero-dependency, pure Rust graphics engine.
//! Contains the standalone Krita pixel brush engine with subpixel dab stepping,
//! analytical radial softness dab generation, and Porter-Duff Over alpha compositing.

pub mod brush;
pub mod wasm;

pub use brush::*;
pub use wasm::*;


#[cfg(test)]
mod tests {
    use super::brush::*;
    use std::f32::consts::PI;

    #[test]
    fn test_s_curve_stroke_simulation() {
        let mut canvas = CanvasView::new(600, 400);
        let config = BrushConfig {
            diameter: 40.0,
            spacing: 0.10,
            softness: 0.6,
            color: [20, 80, 200, 255],
            size_by_pressure: true,
            ..Default::default()
        };
        let mut engine = PixelBrushEngine::new(config);

        let steps = 120;
        let start = StrokeEvent::new(50.0, 100.0, 0.1, 0.0);
        let initial_rect = engine.begin_stroke(start, &mut canvas);
        assert!(initial_rect.is_some());

        let mut total_dirty: Option<Rect> = initial_rect;

        for i in 1..=steps {
            let progress = i as f32 / steps as f32;
            let x = 50.0 + progress * 500.0;
            let y = 200.0 + (progress * PI * 2.0).sin() * 120.0;
            let pressure = (progress * PI).sin() * 0.95 + 0.05;

            let event = StrokeEvent::new(x, y, pressure, progress);
            if let Some(r) = engine.paint_to(event, &mut canvas) {
                total_dirty = match total_dirty {
                    None => Some(r),
                    Some(td) => Some(td.expand_to_include(Some(&r))),
                };
            }
        }

        engine.end_stroke();

        // 1. Verify dirty rect was created and spans the stroke trajectory
        let dirty = total_dirty.expect("Stroke must produce dirty rectangles");
        assert!(dirty.x >= 0 && dirty.x < 100);
        assert!(dirty.w > 400);

        // 2. Verify canvas pixels in the stroke center were painted
        // Around middle: x ~ 300, y ~ 200
        let mid_pixel = canvas.get_pixel(300, 200).expect("Pixel in bounds");
        assert_ne!(mid_pixel, [255, 255, 255, 255], "Stroke center must be painted");
        assert_eq!(mid_pixel[3], 255); // Alpha remains opaque

        // 3. Verify untouched corner remains pure white
        let corner_pixel = canvas.get_pixel(10, 10).expect("Corner pixel in bounds");
        assert_eq!(corner_pixel, [255, 255, 255, 255], "Corner must remain white");
    }

    #[test]
    fn test_midpoint_quadratic_spline_anti_faceting() {
        let mut canvas = CanvasView::new(400, 400);
        let config = BrushConfig {
            diameter: 20.0,
            spacing: 0.1,
            softness: 0.5,
            color: [255, 0, 0, 255],
            size_by_pressure: false,
            ..Default::default()
        };
        let mut engine = PixelBrushEngine::new(config);

        // Turn a sharp 90-degree corner at high speed (events far apart)
        let p0 = StrokeEvent::new(50.0, 50.0, 1.0, 0.0);
        let p1 = StrokeEvent::new(200.0, 50.0, 1.0, 0.05);
        let p2 = StrokeEvent::new(200.0, 200.0, 1.0, 0.10);

        engine.begin_stroke(p0, &mut canvas);
        let r1 = engine.paint_to(p1, &mut canvas);
        assert!(r1.is_some());
        let r2 = engine.paint_to(p2, &mut canvas);
        assert!(r2.is_some());
        let r_finish = engine.finish_stroke(&mut canvas);
        assert!(r_finish.is_some());

        // Verify midpoint quadratic spline rounded through the corner:
        // Midpoint 1 is (125, 50), Midpoint 2 is (200, 125).
        // At t=0.5 along the quadratic curve (m0=(125,50), p1=(200,50), m1=(200,125)):
        // x = 0.25*125 + 0.5*200 + 0.25*200 = 181.25
        // y = 0.25*50 + 0.5*50 + 0.25*125 = 68.75
        // The pixel at (181, 68) must be painted (showing the smooth curvature pulling inwards from the sharp corner (200, 50))!
        let curve_pixel = canvas.get_pixel(181, 68).expect("Pixel in bounds");
        assert_ne!(curve_pixel, [255, 255, 255, 255], "Curve must be smoothly rounded inwards");
    }
}
