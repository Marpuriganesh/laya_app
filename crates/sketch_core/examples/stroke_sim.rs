use sketch_core::{BrushConfig, CanvasView, PixelBrushEngine, StrokeEvent};
use std::f32::consts::PI;

fn main() {
    println!("Running Rust Krita Pixel Brush Engine Prototype...");
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

    // Simulate an S-curve stroke with varying pressure
    let steps = 120;
    let start = StrokeEvent::new(50.0, 100.0, 0.1, 0.0);
    engine.begin_stroke(start, &mut canvas);

    for i in 1..=steps {
        let progress = i as f32 / steps as f32;
        let x = 50.0 + progress * 500.0;
        let y = 200.0 + (progress * PI * 2.0).sin() * 120.0;
        let pressure = (progress * PI).sin() * 0.95 + 0.05;

        let event = StrokeEvent::new(x, y, pressure, progress);
        engine.paint_to(event, &mut canvas);
    }

    engine.end_stroke();

    let output_path = "rust_output_stroke.ppm";
    canvas.save_as_ppm(output_path).expect("Failed to save PPM");
    println!("Successfully rendered test stroke to {}", output_path);
}
