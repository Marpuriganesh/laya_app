use sketch_core::{BrushConfig, CanvasView, MovingAverageConfig, PixelBrushEngine, PullStringConfig, StrokeEvent};
use std::ffi::CString;
use std::os::raw::c_char;
use std::sync::Mutex;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct NativeBrushInfo {
    pub diameter: f32,
    pub softness: f32,
    pub spacing: f32,
    pub opacity: f32,
    pub flow: f32,
    pub size_by_pressure: bool,
    pub opacity_by_pressure: bool,
    pub is_erase: bool,
    pub color_r: u8,
    pub color_g: u8,
    pub color_b: u8,
    pub preset_index: u8,
}

struct NativeBrushSession {
    canvas: CanvasView,
    engine: PixelBrushEngine,
    stroke_start_time: std::time::Instant,
    preset_index: u8,
    color_index: usize,
}

static PALETTE: &[[u8; 4]] = &[
    [24, 24, 27, 255],     // Charcoal Black
    [220, 38, 38, 255],    // Crimson Red
    [37, 99, 235, 255],    // Royal Blue
    [22, 163, 74, 255],    // Forest Green
    [147, 51, 234, 255],   // Deep Purple
    [234, 88, 12, 255],    // Sunset Orange
    [202, 138, 4, 255],    // Warm Amber
    [13, 148, 136, 255],   // Teal
];

static SESSION: Mutex<Option<NativeBrushSession>> = Mutex::new(None);

unsafe extern "C" {
    fn run_native_cocoa_app(width: i32, height: i32, title: *const c_char) -> i32;
}

fn apply_preset(session: &mut NativeBrushSession, index: u8) {
    session.preset_index = index;
    match index {
        1 => {
            // Fine Pencil / Technical Pen
            session.engine.config.diameter = 8.0;
            session.engine.config.softness = 0.15;
            session.engine.config.spacing = 0.05;
            session.engine.config.opacity = 0.95;
            session.engine.config.flow = 0.85;
            session.engine.config.size_by_pressure = true;
            session.engine.config.opacity_by_pressure = true;
            session.engine.config.is_erase = false;
            session.engine.config.color = PALETTE[0];
            println!("✏️  [PRESET 1] Fine Pencil: 8px, crisp softness 0.15, size+alpha dynamics");
        }
        2 => {
            // Classic Round Inking Pen
            session.engine.config.diameter = 32.0;
            session.engine.config.softness = 0.45;
            session.engine.config.spacing = 0.08;
            session.engine.config.opacity = 1.0;
            session.engine.config.flow = 1.0;
            session.engine.config.size_by_pressure = true;
            session.engine.config.opacity_by_pressure = false;
            session.engine.config.is_erase = false;
            session.engine.config.color = PALETTE[0];
            println!("🖋️  [PRESET 2] Classic Ink Pen: 32px, smooth softness 0.45, size dynamics");
        }
        3 => {
            // Soft Airbrush
            session.engine.config.diameter = 85.0;
            session.engine.config.softness = 0.95;
            session.engine.config.spacing = 0.08;
            session.engine.config.opacity = 0.40;
            session.engine.config.flow = 0.30;
            session.engine.config.size_by_pressure = true;
            session.engine.config.opacity_by_pressure = true;
            session.engine.config.is_erase = false;
            session.engine.config.color = PALETTE[2]; // Royal Blue
            println!("💨 [PRESET 3] Soft Airbrush: 85px, radial softness 0.95, 40% opacity flow");
        }
        4 => {
            // Calligraphy / Chisel Marker
            session.engine.config.diameter = 50.0;
            session.engine.config.softness = 0.05;
            session.engine.config.spacing = 0.03;
            session.engine.config.opacity = 1.0;
            session.engine.config.flow = 0.95;
            session.engine.config.size_by_pressure = true;
            session.engine.config.opacity_by_pressure = false;
            session.engine.config.is_erase = false;
            session.engine.config.color = PALETTE[1]; // Crimson Red
            println!("✒️  [PRESET 4] Chisel Marker: 50px, dense 3% spacing, hard edge 0.05");
        }
        5 => {
            // Large Watercolor / Chalk Blending Dab
            session.engine.config.diameter = 130.0;
            session.engine.config.softness = 0.70;
            session.engine.config.spacing = 0.12;
            session.engine.config.opacity = 0.55;
            session.engine.config.flow = 0.45;
            session.engine.config.size_by_pressure = true;
            session.engine.config.opacity_by_pressure = true;
            session.engine.config.is_erase = false;
            session.engine.config.color = PALETTE[3]; // Forest Green
            println!("🎨 [PRESET 5] Blending Wash / Chalk: 130px, softness 0.70, wash flow");
        }
        _ => {}
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_init(width: u32, height: u32) {
    let mut guard = SESSION.lock().unwrap();
    let config = BrushConfig {
        diameter: 32.0,
        spacing: 0.08,
        softness: 0.45,
        color: PALETTE[0],
        opacity: 1.0,
        flow: 1.0,
        size_by_pressure: true,
        opacity_by_pressure: false,
        is_erase: false,
        antialias: true,
        pressure_lut: None,
        pull_string: PullStringConfig::default(),
        moving_average: MovingAverageConfig::default(),
    };
    *guard = Some(NativeBrushSession {
        canvas: CanvasView::new(width, height),
        engine: PixelBrushEngine::new(config),
        stroke_start_time: std::time::Instant::now(),
        preset_index: 2,
        color_index: 0,
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_begin_stroke(x: f32, y: f32, pressure: f32) {
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stroke_start_time = std::time::Instant::now();
        let event = StrokeEvent::new(x, y, pressure, 0.0);
        let _dirty_rect = session.engine.begin_stroke(event, &mut session.canvas);
        println!(
            "🖊️  [STROKE START] pos: ({:.1}, {:.1}) | pressure: {:.3} ({:.1}%)",
            x,
            y,
            pressure,
            pressure * 100.0
        );
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_paint_event(x: f32, y: f32, pressure: f32) {
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let time_sec = session.stroke_start_time.elapsed().as_secs_f32();
        let event = StrokeEvent::new(x, y, pressure, time_sec);
        let _dirty_rect = session.engine.paint_to(event, &mut session.canvas);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_end_stroke() {
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.end_stroke();
        println!("🏁 [STROKE END]");
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_get_pixels(out_width: *mut i32, out_height: *mut i32) -> *const u8 {
    let guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_ref() {
        if !out_width.is_null() {
            unsafe { *out_width = session.canvas.width as i32 };
        }
        if !out_height.is_null() {
            unsafe { *out_height = session.canvas.height as i32 };
        }
        session.canvas.as_slice().as_ptr()
    } else {
        std::ptr::null()
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_get_brush_info(out_info: *mut NativeBrushInfo) {
    if out_info.is_null() {
        return;
    }
    let guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_ref() {
        let cfg = &session.engine.config;
        unsafe {
            *out_info = NativeBrushInfo {
                diameter: cfg.diameter,
                softness: cfg.softness,
                spacing: cfg.spacing,
                opacity: cfg.opacity,
                flow: cfg.flow,
                size_by_pressure: cfg.size_by_pressure,
                opacity_by_pressure: cfg.opacity_by_pressure,
                is_erase: cfg.is_erase,
                color_r: cfg.color[0],
                color_g: cfg.color[1],
                color_b: cfg.color[2],
                preset_index: session.preset_index,
            };
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_set_preset(preset_index: u8) {
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        apply_preset(session, preset_index);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_on_key(key_char: c_char) {
    let ch = key_char as u8 as char;
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        match ch {
            // Preset selection 1..=5
            '1'..='5' => {
                let idx = (ch as u8 - b'0') as u8;
                apply_preset(session, idx);
            }
            // Fine brush diameter adjustment '[' and ']'
            '[' => {
                session.engine.config.diameter = (session.engine.config.diameter - 3.0).max(1.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            ']' => {
                session.engine.config.diameter = (session.engine.config.diameter + 3.0).min(300.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            // Coarse brush diameter adjustment '-' and '+'
            '-' => {
                session.engine.config.diameter = (session.engine.config.diameter - 15.0).max(1.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            '+' | '=' => {
                session.engine.config.diameter = (session.engine.config.diameter + 15.0).min(300.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            // Softness adjustment: 's' decreases, 'S' increases
            's' => {
                session.engine.config.softness = (session.engine.config.softness - 0.05).max(0.0);
                println!("☁️  [SOFTNESS] {:.2} (Harder)", session.engine.config.softness);
            }
            'S' => {
                session.engine.config.softness = (session.engine.config.softness + 0.05).min(1.0);
                println!("☁️  [SOFTNESS] {:.2} (Softer)", session.engine.config.softness);
            }
            // Spacing adjustment: 'd' decreases (denser), 'D' increases (dotted)
            'd' => {
                session.engine.config.spacing = (session.engine.config.spacing - 0.01).max(0.01);
                println!("🎯 [SPACING] {:.2} (Denser dabs)", session.engine.config.spacing);
            }
            'D' => {
                session.engine.config.spacing = (session.engine.config.spacing + 0.02).min(0.50);
                println!("🎯 [SPACING] {:.2} (More spaced)", session.engine.config.spacing);
            }
            // Opacity adjustment: 'o' decreases, 'O' increases
            'o' => {
                session.engine.config.opacity = (session.engine.config.opacity - 0.10).max(0.10);
                println!("💧 [OPACITY] {:.0}%", session.engine.config.opacity * 100.0);
            }
            'O' => {
                session.engine.config.opacity = (session.engine.config.opacity + 0.10).min(1.00);
                println!("💧 [OPACITY] {:.0}%", session.engine.config.opacity * 100.0);
            }
            // Size Dynamics toggle
            'p' | 'P' => {
                session.engine.config.size_by_pressure = !session.engine.config.size_by_pressure;
                println!(
                    "⚡ [DYNAMICS] Size by pressure: {}",
                    if session.engine.config.size_by_pressure { "ON" } else { "OFF" }
                );
            }
            // Opacity Dynamics toggle
            'a' | 'A' => {
                session.engine.config.opacity_by_pressure = !session.engine.config.opacity_by_pressure;
                println!(
                    "⚡ [DYNAMICS] Opacity by pressure: {}",
                    if session.engine.config.opacity_by_pressure { "ON" } else { "OFF" }
                );
            }
            // Eraser mode toggle
            'e' | 'E' => {
                session.engine.config.is_erase = !session.engine.config.is_erase;
                println!(
                    "🔄 [TOOL] Eraser mode: {}",
                    if session.engine.config.is_erase { "ON" } else { "OFF" }
                );
            }
            // Cycle Color Palette: 'k' or 'K'
            'k' | 'K' => {
                session.color_index = (session.color_index + 1) % PALETTE.len();
                session.engine.config.color = PALETTE[session.color_index];
                session.engine.config.is_erase = false;
                println!(
                    "🎨 [PALETTE] Swatch #{} [R:{}, G:{}, B:{}]",
                    session.color_index + 1,
                    session.engine.config.color[0],
                    session.engine.config.color[1],
                    session.engine.config.color[2]
                );
            }
            // Clear Canvas
            'c' | 'C' => {
                session.canvas.clear([255, 255, 255, 255]);
                session.engine.end_stroke();
                println!("🧹 [ACTION] Canvas cleared to pure white");
            }
            _ => {}
        }
    }
}

fn main() {
    const WINDOW_WIDTH: u32 = 1400;
    const WINDOW_HEIGHT: u32 = 900;

    rust_native_init(WINDOW_WIDTH, WINDOW_HEIGHT);

    let title = CString::new("Sketch App — High-Performance Native Rust Canvas").unwrap();
    unsafe {
        run_native_cocoa_app(WINDOW_WIDTH as i32, WINDOW_HEIGHT as i32, title.as_ptr());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rust_native_lifecycle_and_drawing() {
        rust_native_init(200, 200);

        let mut width = 0;
        let mut height = 0;
        let pixels_ptr = rust_native_get_pixels(&mut width, &mut height);
        assert!(!pixels_ptr.is_null());
        assert_eq!(width, 200);
        assert_eq!(height, 200);

        let guard = SESSION.lock().unwrap();
        let session = guard.as_ref().unwrap();
        assert_eq!(session.canvas.get_pixel(100, 100), Some([255, 255, 255, 255]));
        drop(guard);

        rust_native_begin_stroke(100.0, 100.0, 0.8);
        rust_native_paint_event(120.0, 100.0, 0.5);
        rust_native_end_stroke();

        let guard = SESSION.lock().unwrap();
        let session = guard.as_ref().unwrap();
        let center_pixel = session.canvas.get_pixel(100, 100).unwrap();
        assert_ne!(center_pixel, [255, 255, 255, 255], "Dab must paint on canvas");
        assert_eq!(center_pixel[3], 255, "Alpha must be opaque");
    }

    #[test]
    fn test_rust_native_presets_and_controls() {
        rust_native_init(100, 100);

        // Test Preset 1 (Pencil)
        rust_native_on_key(b'1' as c_char);
        let mut info = NativeBrushInfo {
            diameter: 0.0,
            softness: 0.0,
            spacing: 0.0,
            opacity: 0.0,
            flow: 0.0,
            size_by_pressure: false,
            opacity_by_pressure: false,
            is_erase: false,
            color_r: 0,
            color_g: 0,
            color_b: 0,
            preset_index: 0,
        };
        rust_native_get_brush_info(&mut info);
        assert_eq!(info.preset_index, 1);
        assert_eq!(info.diameter, 8.0);
        assert!(info.size_by_pressure);
        assert!(info.opacity_by_pressure);

        // Test Preset 3 (Airbrush)
        rust_native_on_key(b'3' as c_char);
        rust_native_get_brush_info(&mut info);
        assert_eq!(info.preset_index, 3);
        assert_eq!(info.diameter, 85.0);
        assert_eq!(info.softness, 0.95);

        // Test Softness adjust 's' and 'S'
        rust_native_on_key(b's' as c_char);
        rust_native_get_brush_info(&mut info);
        assert_eq!(info.softness, 0.90);

        // Test Dynamics toggle 'p'
        rust_native_on_key(b'p' as c_char);
        rust_native_get_brush_info(&mut info);
        assert!(!info.size_by_pressure);
    }
}
