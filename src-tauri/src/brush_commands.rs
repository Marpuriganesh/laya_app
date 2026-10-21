use serde::{Deserialize, Serialize};
use sketch_core::{BrushConfig, CanvasView, PixelBrushEngine, StrokeEvent};
use std::sync::Mutex;

/// Shared application state managing the active Rust canvas buffer and brush engine.
pub struct BrushEngineState {
    pub inner: Mutex<BrushSession>,
}

pub struct BrushSession {
    pub canvas: CanvasView,
    pub engine: PixelBrushEngine,
    pub stroke_start_time: std::time::Instant,
}

impl Default for BrushEngineState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(BrushSession {
                canvas: CanvasView::new(1920, 1080),
                engine: PixelBrushEngine::new(BrushConfig {
                    diameter: 32.0,
                    spacing: 0.08,
                    softness: 0.45,
                    color: [24, 24, 27, 255],
                    opacity: 1.0,
                    flow: 1.0,
                    size_by_pressure: true,
                    opacity_by_pressure: false,
                    is_erase: false,
                }),
                stroke_start_time: std::time::Instant::now(),
            }),
        }
    }
}

// Global reference for native Cocoa C FFI callbacks
static GLOBAL_SESSION: Mutex<Option<BrushSession>> = Mutex::new(None);

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_init(width: u32, height: u32) {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    let config = guard.as_ref().map(|s| s.engine.config.clone()).unwrap_or_else(|| BrushConfig {
        diameter: 32.0,
        spacing: 0.08,
        softness: 0.45,
        color: [24, 24, 27, 255],
        opacity: 1.0,
        flow: 1.0,
        size_by_pressure: true,
        opacity_by_pressure: false,
        is_erase: false,
    });
    // Transparent background: the React artboard paper div provides the white/checkerboard
    // surface behind the ink. The native canvas only holds painted stroke pixels.
    *guard = Some(BrushSession {
        canvas: CanvasView::with_color(width, height, [0, 0, 0, 0]),
        engine: PixelBrushEngine::new(config),
        stroke_start_time: std::time::Instant::now(),
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_begin_stroke(x: f32, y: f32, pressure: f32) {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stroke_start_time = std::time::Instant::now();
        let event = StrokeEvent::new(x, y, pressure, 0.0);
        let _ = session.engine.begin_stroke(event, &mut session.canvas);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_paint_event(x: f32, y: f32, pressure: f32) {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let time_sec = session.stroke_start_time.elapsed().as_secs_f32();
        let event = StrokeEvent::new(x, y, pressure, time_sec);
        let _ = session.engine.paint_to(event, &mut session.canvas);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_end_stroke() {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.end_stroke();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_get_pixels(out_width: *mut i32, out_height: *mut i32) -> *const u8 {
    let guard = GLOBAL_SESSION.lock().unwrap();
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
pub extern "C" fn rust_overlay_get_diameter() -> f32 {
    let guard = GLOBAL_SESSION.lock().unwrap();
    guard.as_ref().map(|s| s.engine.config.diameter).unwrap_or(32.0)
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_get_size_dynamics() -> bool {
    let guard = GLOBAL_SESSION.lock().unwrap();
    guard.as_ref().map(|s| s.engine.config.size_by_pressure).unwrap_or(true)
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    pub fn setup_native_canvas_overlay(ns_window_ptr: *mut std::ffi::c_void, ns_view_ptr: *mut std::ffi::c_void);
    pub fn set_native_overlay_modal_open(is_open: bool);
    pub fn set_native_overlay_pan_active(is_panning: bool);
    pub fn update_canvas_artboard_rect(x: f32, y: f32, width: f32, height: f32);
    pub fn trigger_native_overlay_repaint();
    pub fn set_ui_blocking_rects(rects: *const f32, count: u32);
}

#[tauri::command]
pub async fn rust_set_ui_blocking_rects(rects: Vec<[f32; 4]>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let flattened: Vec<f32> = rects.iter().flat_map(|r| r.iter().copied()).collect();
        set_ui_blocking_rects(flattened.as_ptr(), rects.len() as u32);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_update_artboard_rect(x: f32, y: f32, width: f32, height: f32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        update_canvas_artboard_rect(x, y, width, height);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_pan_active(is_panning: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_native_overlay_pan_active(is_panning);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_set_document_size(width: u32, height: u32) -> Result<(), String> {
    rust_overlay_init(width, height);
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

/// DTO for brush configuration updates from the React UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrushConfigDto {
    pub diameter: f32,
    pub spacing: f32,
    pub softness: f32,
    pub color: [u8; 4],
    pub opacity: f32,
    pub flow: f32,
    pub size_by_pressure: bool,
    pub opacity_by_pressure: bool,
    #[serde(default)]
    pub is_erase: bool,
}

impl From<BrushConfigDto> for BrushConfig {
    fn from(dto: BrushConfigDto) -> Self {
        Self {
            diameter: dto.diameter,
            spacing: dto.spacing,
            softness: dto.softness,
            color: dto.color,
            opacity: dto.opacity,
            flow: dto.flow,
            size_by_pressure: dto.size_by_pressure,
            opacity_by_pressure: dto.opacity_by_pressure,
            is_erase: dto.is_erase,
        }
    }
}

#[tauri::command]
pub async fn rust_brush_set_config(config: BrushConfigDto) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config = config.into();
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_modal_open(is_open: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_native_overlay_modal_open(is_open);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear(
    fill_color: Option<[u8; 4]>,
) -> Result<(), String> {
    // Default to fully transparent so the React artboard paper shows through.
    let fill = fill_color.unwrap_or([0, 0, 0, 0]);
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.canvas.clear(fill);
        session.engine.end_stroke();
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}
