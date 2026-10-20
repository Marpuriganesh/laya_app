//! # sketch_core: Digital Painting & Drawing Engine
//!
//! A zero-dependency, pure Rust graphics engine.
//! Contains the standalone Krita pixel brush engine with subpixel dab stepping,
//! analytical radial softness dab generation, and Porter-Duff Over alpha compositing.

pub mod brush;

pub use brush::*;


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
}
