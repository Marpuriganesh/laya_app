use sketch_core::{BrushConfig, CanvasView, PixelBrushEngine, StrokeEvent};
use std::ffi::CString;
use std::os::raw::c_char;
use std::sync::Mutex;

struct NativeBrushSession {
    canvas: CanvasView,
    engine: PixelBrushEngine,
    stroke_start_time: std::time::Instant,
}

static SESSION: Mutex<Option<NativeBrushSession>> = Mutex::new(None);

unsafe extern "C" {
    fn run_native_cocoa_app(width: i32, height: i32, title: *const c_char) -> i32;
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_native_init(width: u32, height: u32) {
    let mut guard = SESSION.lock().unwrap();
    let config = BrushConfig {
        diameter: 32.0,
        spacing: 0.08,
        softness: 0.55,
        color: [24, 24, 27, 255],
        opacity: 1.0,
        flow: 1.0,
        size_by_pressure: true,
        opacity_by_pressure: false,
        is_erase: false,
    };
    *guard = Some(NativeBrushSession {
        canvas: CanvasView::new(width, height),
        engine: PixelBrushEngine::new(config),
        stroke_start_time: std::time::Instant::now(),
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
pub extern "C" fn rust_native_on_key(key_char: c_char) {
    let ch = key_char as u8 as char;
    let mut guard = SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        match ch {
            'c' | 'C' => {
                session.canvas.clear([255, 255, 255, 255]);
                session.engine.end_stroke();
                println!("🧹 [ACTION] Canvas cleared to white");
            }
            'e' | 'E' => {
                session.engine.config.is_erase = !session.engine.config.is_erase;
                println!(
                    "🔄 [TOOL] Eraser mode: {}",
                    if session.engine.config.is_erase { "ON" } else { "OFF" }
                );
            }
            '[' => {
                session.engine.config.diameter = (session.engine.config.diameter - 4.0).max(2.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            ']' => {
                session.engine.config.diameter = (session.engine.config.diameter + 4.0).min(200.0);
                println!("📏 [SIZE] Brush diameter: {:.1}px", session.engine.config.diameter);
            }
            '1' => {
                session.engine.config.color = [24, 24, 27, 255];
                session.engine.config.is_erase = false;
                println!("🎨 [COLOR] Charcoal Black");
            }
            '2' => {
                session.engine.config.color = [220, 38, 38, 255];
                session.engine.config.is_erase = false;
                println!("🎨 [COLOR] Crimson Red");
            }
            '3' => {
                session.engine.config.color = [37, 99, 235, 255];
                session.engine.config.is_erase = false;
                println!("🎨 [COLOR] Royal Blue");
            }
            '4' => {
                session.engine.config.color = [22, 163, 74, 255];
                session.engine.config.is_erase = false;
                println!("🎨 [COLOR] Forest Green");
            }
            '5' => {
                session.engine.config.color = [147, 51, 234, 255];
                session.engine.config.is_erase = false;
                println!("🎨 [COLOR] Deep Purple");
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
        // 1. Initialize 200x200 canvas
        rust_native_init(200, 200);

        let mut width = 0;
        let mut height = 0;
        let pixels_ptr = rust_native_get_pixels(&mut width, &mut height);
        assert!(!pixels_ptr.is_null());
        assert_eq!(width, 200);
        assert_eq!(height, 200);

        // Verify initial state is white
        let guard = SESSION.lock().unwrap();
        let session = guard.as_ref().unwrap();
        assert_eq!(session.canvas.get_pixel(100, 100), Some([255, 255, 255, 255]));
        drop(guard);

        // 2. Begin stroke with pressure 0.8
        rust_native_begin_stroke(100.0, 100.0, 0.8);

        // Paint to (120.0, 100.0) with pressure 0.5
        rust_native_paint_event(120.0, 100.0, 0.5);
        rust_native_end_stroke();

        // Verify pixels at stroke center were painted dark
        let guard = SESSION.lock().unwrap();
        let session = guard.as_ref().unwrap();
        let center_pixel = session.canvas.get_pixel(100, 100).unwrap();
        assert_ne!(center_pixel, [255, 255, 255, 255], "Dab must paint on canvas");
        assert_eq!(center_pixel[3], 255, "Alpha must be opaque");
    }

    #[test]
    fn test_rust_native_keyboard_shortcuts() {
        rust_native_init(100, 100);

        // Test brush diameter adjustment '[' and ']'
        let initial_diameter = {
            let guard = SESSION.lock().unwrap();
            guard.as_ref().unwrap().engine.config.diameter
        };

        rust_native_on_key(b']' as c_char);
        let increased_diameter = {
            let guard = SESSION.lock().unwrap();
            guard.as_ref().unwrap().engine.config.diameter
        };
        assert_eq!(increased_diameter, initial_diameter + 4.0);

        rust_native_on_key(b'[' as c_char);
        let restored_diameter = {
            let guard = SESSION.lock().unwrap();
            guard.as_ref().unwrap().engine.config.diameter
        };
        assert_eq!(restored_diameter, initial_diameter);

        // Test eraser toggle 'e'
        assert!(!SESSION.lock().unwrap().as_ref().unwrap().engine.config.is_erase);
        rust_native_on_key(b'e' as c_char);
        assert!(SESSION.lock().unwrap().as_ref().unwrap().engine.config.is_erase);
        rust_native_on_key(b'e' as c_char);
        assert!(!SESSION.lock().unwrap().as_ref().unwrap().engine.config.is_erase);

        // Test color selection '2' (Crimson Red)
        rust_native_on_key(b'2' as c_char);
        let color = SESSION.lock().unwrap().as_ref().unwrap().engine.config.color;
        assert_eq!(color, [220, 38, 38, 255]);

        // Test clear canvas 'c'
        rust_native_begin_stroke(50.0, 50.0, 1.0);
        rust_native_end_stroke();
        rust_native_on_key(b'c' as c_char);
        let guard = SESSION.lock().unwrap();
        assert_eq!(guard.as_ref().unwrap().canvas.get_pixel(50, 50), Some([255, 255, 255, 255]));
    }
}
