use serde::{Deserialize, Serialize};
use sketch_core::{
    parse_gbr, parse_pat, BrushConfig, BrushTipType, ColorBlendMode, CompositeStack,
    PatternData, PatternRegistry, PixelBrushEngine, PredefinedTipData, StrokeEvent,
    TextureBlendMode, TextureConfig, TipRegistry,
};
use std::sync::Mutex;

/// Shared application state managing the active Rust composite canvas stack and brush engine.
pub struct BrushEngineState {
    pub inner: Mutex<BrushSession>,
}

pub struct BrushSession {
    pub stack: CompositeStack,
    pub engine: PixelBrushEngine,
    pub tip_registry: TipRegistry,
    pub pattern_registry: PatternRegistry,
    pub stroke_start_time: std::time::Instant,
}

impl Default for BrushEngineState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(BrushSession {
                stack: CompositeStack::with_background(1920, 1080, [255, 255, 255, 255], true),
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
                    antialias: true,
                    blend_mode: ColorBlendMode::Normal,
                    tip_type: BrushTipType::default(),
                    texture: None,
                    texture_by_pressure: false,
                    pressure_lut: None,
                    moving_average: sketch_core::stroke::MovingAverageConfig::default(),
                    pull_string: sketch_core::stroke::PullStringConfig::default(),
                    dynamics: sketch_core::brush::BrushDynamicsConfig::default(),
                }),
                tip_registry: TipRegistry::new(),
                pattern_registry: PatternRegistry::new(),
                stroke_start_time: std::time::Instant::now(),
            }),
        }
    }
}

// Global reference for native Cocoa C FFI callbacks
static GLOBAL_SESSION: Mutex<Option<BrushSession>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StrokeTelemetryDto {
    pub is_drawing: bool,
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub tilt_x: f32,
    pub tilt_y: f32,
    pub tilt_elevation: f32,
    pub tilt_azimuth: f32,
    pub velocity: f32,
    pub total_distance: f32,
    pub stroke_direction: f32,
    pub initial_direction: f32,
    pub event_count: u64,
}

static LAST_TELEMETRY: Mutex<Option<StrokeTelemetryDto>> = Mutex::new(None);
static NATIVE_EVENT_COUNT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

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
        antialias: true,
        blend_mode: ColorBlendMode::Normal,
        tip_type: BrushTipType::default(),
        texture: None,
        texture_by_pressure: false,
        pressure_lut: None,
        moving_average: sketch_core::stroke::MovingAverageConfig::default(),
        pull_string: sketch_core::stroke::PullStringConfig::default(),
        dynamics: sketch_core::brush::BrushDynamicsConfig::default(),
    });

    let (tips, patterns) = if let Some(s) = guard.as_ref() {
        (s.tip_registry.clone(), s.pattern_registry.clone())
    } else {
        (TipRegistry::new(), PatternRegistry::new())
    };

    *guard = Some(BrushSession {
        stack: CompositeStack::with_background(width, height, [255, 255, 255, 255], true),
        engine: PixelBrushEngine::new(config),
        tip_registry: tips,
        pattern_registry: patterns,
        stroke_start_time: std::time::Instant::now(),
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_begin_stroke(x: f32, y: f32, pressure: f32) {
    let _ = rust_overlay_begin_stroke_dirty(x, y, pressure, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_begin_stroke_dirty(
    x: f32,
    y: f32,
    pressure: f32,
    out_x: *mut i32,
    out_y: *mut i32,
    out_w: *mut i32,
    out_h: *mut i32,
) -> bool {
    rust_overlay_begin_stroke_tilt_dirty(x, y, pressure, 0.0, 0.0, out_x, out_y, out_w, out_h)
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_begin_stroke_tilt_dirty(
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
    out_x: *mut i32,
    out_y: *mut i32,
    out_w: *mut i32,
    out_h: *mut i32,
) -> bool {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stroke_start_time = std::time::Instant::now();
        let event = StrokeEvent::with_tilt(x, y, pressure, 0.0, tilt_x, tilt_y);
        let count = NATIVE_EVENT_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        if let Ok(mut telem_guard) = LAST_TELEMETRY.lock() {
            *telem_guard = Some(StrokeTelemetryDto {
                is_drawing: true,
                x,
                y,
                pressure,
                tilt_x,
                tilt_y,
                tilt_elevation: event.tilt_elevation(),
                tilt_azimuth: event.tilt_azimuth(),
                velocity: 0.0,
                total_distance: 0.0,
                stroke_direction: 0.0,
                initial_direction: 0.0,
                event_count: count,
            });
        }
        if let Some(r) = session.engine.begin_stroke_on_stack(event, &mut session.stack) {
            if !out_x.is_null() && !out_y.is_null() && !out_w.is_null() && !out_h.is_null() {
                unsafe {
                    *out_x = r.x;
                    *out_y = r.y;
                    *out_w = r.w;
                    *out_h = r.h;
                }
            }
            return true;
        }
    }
    false
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_paint_event(x: f32, y: f32, pressure: f32) {
    let _ = rust_overlay_paint_event_dirty(x, y, pressure, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_paint_event_dirty(
    x: f32,
    y: f32,
    pressure: f32,
    out_x: *mut i32,
    out_y: *mut i32,
    out_w: *mut i32,
    out_h: *mut i32,
) -> bool {
    rust_overlay_paint_event_tilt_dirty(x, y, pressure, 0.0, 0.0, out_x, out_y, out_w, out_h)
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_paint_event_tilt_dirty(
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
    out_x: *mut i32,
    out_y: *mut i32,
    out_w: *mut i32,
    out_h: *mut i32,
) -> bool {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let time_sec = session.stroke_start_time.elapsed().as_secs_f32();
        let event = StrokeEvent::with_tilt(x, y, pressure, time_sec, tilt_x, tilt_y);
        let count = NATIVE_EVENT_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        let vel = session.engine.current_velocity;
        let dist = session.engine.total_distance;
        let dir = session.engine.current_stroke_direction;
        let init_dir = session.engine.initial_stroke_direction;
        if let Ok(mut telem_guard) = LAST_TELEMETRY.lock() {
            *telem_guard = Some(StrokeTelemetryDto {
                is_drawing: true,
                x,
                y,
                pressure,
                tilt_x,
                tilt_y,
                tilt_elevation: event.tilt_elevation(),
                tilt_azimuth: event.tilt_azimuth(),
                velocity: vel,
                total_distance: dist,
                stroke_direction: dir,
                initial_direction: init_dir,
                event_count: count,
            });
        }
        if let Some(r) = session.engine.paint_to_stack(event, &mut session.stack) {
            if !out_x.is_null() && !out_y.is_null() && !out_w.is_null() && !out_h.is_null() {
                unsafe {
                    *out_x = r.x;
                    *out_y = r.y;
                    *out_w = r.w;
                    *out_h = r.h;
                }
            }
            return true;
        }
    }
    false
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_end_stroke() {
    let _ = rust_overlay_end_stroke_dirty(std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_end_stroke_dirty(
    out_x: *mut i32,
    out_y: *mut i32,
    out_w: *mut i32,
    out_h: *mut i32,
) -> bool {
    if let Ok(mut telem_guard) = LAST_TELEMETRY.lock() {
        if let Some(t) = telem_guard.as_mut() {
            t.is_drawing = false;
        }
    }
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let dirty = session.engine.finish_stroke_on_stack(&mut session.stack);
        session.engine.end_stroke();
        if let Some(r) = dirty {
            if !out_x.is_null() && !out_y.is_null() && !out_w.is_null() && !out_h.is_null() {
                unsafe {
                    *out_x = r.x;
                    *out_y = r.y;
                    *out_w = r.w;
                    *out_h = r.h;
                }
            }
            return true;
        }
    }
    false
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_get_pixels(out_width: *mut i32, out_height: *mut i32) -> *const u8 {
    let guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_ref() {
        if !out_width.is_null() {
            unsafe { *out_width = session.stack.width as i32 };
        }
        if !out_height.is_null() {
            unsafe { *out_height = session.stack.height as i32 };
        }
        session.stack.get_display_pixels().as_ptr()
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

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_get_smoothed_tip(out_x: *mut f32, out_y: *mut f32) -> bool {
    let guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(ref session) = *guard {
        if session.engine.config.pull_string.enabled {
            if let Some((x, y)) = session.engine.pull_string.smoothed_tip {
                if !out_x.is_null() && !out_y.is_null() {
                    unsafe {
                        *out_x = x;
                        *out_y = y;
                    }
                    return true;
                }
            }
        }
        if let Some(m) = session.engine.trajectory.prev_midpoint {
            if !out_x.is_null() && !out_y.is_null() {
                unsafe {
                    *out_x = m.x;
                    *out_y = m.y;
                }
                return true;
            }
        }
        if let Some(e) = session.engine.trajectory.prev_event {
            if !out_x.is_null() && !out_y.is_null() {
                unsafe {
                    *out_x = e.x;
                    *out_y = e.y;
                }
                return true;
            }
        }
    }
    false
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_overlay_get_brush_color(out_rgba: *mut u8) {
    let guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(ref session) = *guard {
        if !out_rgba.is_null() {
            let color = session.engine.config.color;
            unsafe {
                *out_rgba.add(0) = color[0];
                *out_rgba.add(1) = color[1];
                *out_rgba.add(2) = color[2];
                *out_rgba.add(3) = color[3];
            }
        }
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    pub fn setup_native_canvas_overlay(ns_window_ptr: *mut std::ffi::c_void, ns_view_ptr: *mut std::ffi::c_void);
    pub fn set_native_overlay_modal_open(is_open: bool);
    pub fn set_native_overlay_pan_active(is_panning: bool);
    pub fn update_canvas_artboard_rect(x: f32, y: f32, width: f32, height: f32);
    pub fn trigger_native_overlay_repaint();
    pub fn set_ui_blocking_rects(rects: *const f32, count: u32);
    pub fn set_workspace_theme(is_dark: bool);
    pub fn set_native_pressure_lut(lut: *const f32, count: i32);
    pub fn set_native_app_dock_icon(bytes: *const u8, length: u32);
}

#[tauri::command]
pub async fn rust_set_workspace_theme(is_dark: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_workspace_theme(is_dark);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = is_dark;
    Ok(())
}

#[tauri::command]
pub async fn rust_set_ui_blocking_rects(rects: Vec<[f32; 4]>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let flattened: Vec<f32> = rects.iter().flat_map(|r| r.iter().copied()).collect();
        set_ui_blocking_rects(flattened.as_ptr(), rects.len() as u32);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = rects;
    Ok(())
}

#[tauri::command]
pub async fn rust_update_artboard_rect(x: f32, y: f32, width: f32, height: f32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        update_canvas_artboard_rect(x, y, width, height);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (x, y, width, height);
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_pan_active(is_panning: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_native_overlay_pan_active(is_panning);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = is_panning;
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

// ============================================================================
// Layer Management Tauri IPC Commands
// ============================================================================

#[tauri::command]
pub async fn rust_layer_add(id: String, name: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.add_layer(id, name)?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_add_vector(id: String, name: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.add_vector_layer(id, name)?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_vector_erase_at(
    id: String,
    x: f32,
    y: f32,
    radius: f32,
    erase_to_intersection: bool,
) -> Result<Option<[i32; 4]>, String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    let dirty = if let Some(session) = guard.as_mut() {
        session.stack.vector_erase_at(&id, x, y, radius, erase_to_intersection)
    } else {
        None
    };
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(dirty.map(|r| [r.x, r.y, r.w, r.h]))
}

#[tauri::command]
pub async fn rust_layer_adjust_vector_line_width(
    id: String,
    factor: f32,
) -> Result<Option<[i32; 4]>, String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    let dirty = if let Some(session) = guard.as_mut() {
        session.stack.adjust_vector_line_width(&id, factor)
    } else {
        None
    };
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(dirty.map(|r| [r.x, r.y, r.w, r.h]))
}

#[tauri::command]
pub async fn rust_layer_delete(id: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.remove_layer(&id)?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_duplicate(
    source_id: String,
    new_id: String,
    new_name: String,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.duplicate_layer(&source_id, new_id, new_name)?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_active(id: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        if !session.stack.set_active_layer(&id) {
            return Err(format!("Layer '{}' not found", id));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_opacity(id: String, opacity: f32) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_opacity(&id, opacity);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_blend_mode(id: String, blend_mode: String) -> Result<(), String> {
    let mode = ColorBlendMode::from_str(&blend_mode);
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_blend_mode(&id, mode);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_visibility(id: String, visible: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_visibility(&id, visible);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_alpha_lock(id: String, locked: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_alpha_lock(&id, locked);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_clipped(id: String, clipped: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_clipped(&id, clipped);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_add_mask(id: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.add_layer_mask(&id);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_delete_mask(id: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.remove_layer_mask(&id);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_mask_enabled(id: String, enabled: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_mask_enabled(&id, enabled);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_mask_inverted(id: String, inverted: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_mask_inverted(&id, inverted);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_set_edit_target(id: String, target: String) -> Result<(), String> {
    let edit_target = if target.eq_ignore_ascii_case("mask") {
        sketch_core::composite::EditTarget::Mask
    } else {
        sketch_core::composite::EditTarget::Pixels
    };
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_layer_edit_target(&id, edit_target);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_reorder(ordered_ids: Vec<String>) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.reorder_layers(&ordered_ids)?;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_layer_clear_active() -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.clear_active_layer();
        session.engine.end_stroke();
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_set_background_color(r: u8, g: u8, b: u8, a: u8) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_background_color([r, g, b, a]);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_set_background_visible(visible: bool) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.set_background_visible(visible);
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

// ============================================================================
// Resource Management Tauri IPC Commands
// ============================================================================

#[tauri::command]
pub async fn rust_resource_register_tip_gbr(id: String, bytes: Vec<u8>) -> Result<String, String> {
    let (tip, name) = parse_gbr(&bytes)?;
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.tip_registry.register(id, name.clone(), tip);
    }
    Ok(name)
}

#[tauri::command]
pub async fn rust_resource_register_tip_mask(
    id: String,
    name: String,
    width: u32,
    height: u32,
    mask: Vec<u8>,
    invert: bool,
) -> Result<(), String> {
    let tip = if mask.len() == (width * height * 4) as usize {
        PredefinedTipData::from_rgba(width, height, &mask)
    } else {
        PredefinedTipData::from_gbr_grayscale(width, height, &mask, invert)
    };
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.tip_registry.register(id, name, tip);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_resource_set_active_tip(
    tip_id: Option<String>,
    scale: f32,
    angle_radians: f32,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        if let Some(ref id) = tip_id {
            if let Some(tip_data) = session.tip_registry.get(id) {
                session.engine.config.tip_type = BrushTipType::Predefined {
                    tip_data,
                    scale: scale.max(0.01),
                    angle_radians,
                };
            } else {
                return Err(format!("Tip '{}' not found in registry", id));
            }
        } else {
            session.engine.config.tip_type = BrushTipType::default();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_resource_register_pattern_pat(
    id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let (pat, name) = parse_pat(&bytes)?;
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.pattern_registry.register(id, name.clone(), pat);
    }
    Ok(name)
}

#[tauri::command]
pub async fn rust_resource_register_pattern_grayscale(
    id: String,
    name: String,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let pat = PatternData::from_grayscale(width, height, bytes);
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.pattern_registry.register(id, name, pat);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_resource_register_pattern_rgba(
    id: String,
    name: String,
    width: u32,
    height: u32,
    rgba_bytes: Vec<u8>,
) -> Result<(), String> {
    let pat = PatternData::from_rgba(width, height, &rgba_bytes);
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.pattern_registry.register(id, name, pat);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_resource_set_active_pattern(
    pattern_id: Option<String>,
    scale: f32,
    mode: String,
    strength: f32,
    invert: bool,
    brightness: f32,
    contrast: f32,
    by_pressure: bool,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        if let Some(ref id) = pattern_id {
            if let Some(pattern) = session.pattern_registry.get(id) {
                let blend_mode = TextureBlendMode::from_str(&mode);
                session.engine.config.texture = Some(TextureConfig {
                    pattern,
                    scale: scale.max(0.01),
                    offset_x: 0,
                    offset_y: 0,
                    brightness,
                    contrast,
                    cutoff_left: 0.0,
                    cutoff_right: 1.0,
                    invert,
                    mode: blend_mode,
                    strength: strength.clamp(0.0, 1.0),
                });
                session.engine.config.texture_by_pressure = by_pressure;
            } else {
                return Err(format!("Pattern '{}' not found in registry", id));
            }
        } else {
            session.engine.config.texture = None;
            session.engine.config.texture_by_pressure = false;
        }
    }
    Ok(())
}

// ============================================================================
// Brush Configuration DTO & Handlers
// ============================================================================

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
    #[serde(default = "default_true")]
    pub antialias: bool,
    #[serde(default)]
    pub blend_mode: Option<String>,
    #[serde(default)]
    pub aspect_ratio: Option<f32>,
    #[serde(default)]
    pub angle_radians: Option<f32>,
    #[serde(default)]
    pub texture_by_pressure: Option<bool>,
}

fn default_true() -> bool {
    true
}

impl From<BrushConfigDto> for BrushConfig {
    fn from(dto: BrushConfigDto) -> Self {
        let blend_mode = if dto.is_erase {
            ColorBlendMode::Erase
        } else if let Some(ref m) = dto.blend_mode {
            ColorBlendMode::from_str(m)
        } else {
            ColorBlendMode::Normal
        };

        let tip_type = if let (Some(ar), Some(ang)) = (dto.aspect_ratio, dto.angle_radians) {
            BrushTipType::Auto {
                aspect_ratio: ar,
                angle_radians: ang,
            }
        } else {
            BrushTipType::default()
        };

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
            antialias: dto.antialias,
            blend_mode,
            tip_type,
            texture: None,
            texture_by_pressure: dto.texture_by_pressure.unwrap_or(false),
            pressure_lut: None,
            moving_average: sketch_core::stroke::MovingAverageConfig::default(),
            pull_string: sketch_core::stroke::PullStringConfig::default(),
            dynamics: sketch_core::brush::BrushDynamicsConfig::default(),
        }
    }
}

#[tauri::command]
pub async fn rust_brush_set_config(config: BrushConfigDto) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let existing_lut = session.engine.config.pressure_lut.take();
        let existing_moving_average = session.engine.config.moving_average;
        let existing_pull_string = session.engine.config.pull_string;
        let existing_texture = session.engine.config.texture.clone();
        let existing_texture_by_pressure = session.engine.config.texture_by_pressure;
        let existing_tip_type = session.engine.config.tip_type.clone();
        let existing_blend_mode = session.engine.config.blend_mode;
        let existing_dynamics = session.engine.config.dynamics.clone();
        let preserve_blend_mode = config.blend_mode.is_none() && !config.is_erase;

        let mut new_config: BrushConfig = config.into();
        new_config.pressure_lut = existing_lut;
        new_config.moving_average = existing_moving_average;
        new_config.pull_string = existing_pull_string;
        new_config.texture = existing_texture;
        new_config.texture_by_pressure = existing_texture_by_pressure;
        new_config.dynamics = existing_dynamics;

        if preserve_blend_mode {
            new_config.blend_mode = existing_blend_mode;
        }

        if matches!(existing_tip_type, BrushTipType::Predefined { .. })
            && new_config.tip_type == BrushTipType::default()
        {
            new_config.tip_type = existing_tip_type;
        }

        session.engine.config = new_config;
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_blend_mode(mode: String) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.blend_mode = ColorBlendMode::from_str(&mode);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_moving_average_config(
    enabled: bool,
    window_size: u32,
    velocity_multiplier: f32,
    weight: Option<f32>,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.moving_average = sketch_core::stroke::MovingAverageConfig {
            enabled,
            window_size: window_size as usize,
            velocity_multiplier,
            weight: weight.unwrap_or(0.0),
        };
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_pull_string_config(
    enabled: bool,
    max_string_length: f32,
    velocity_multiplier: f32,
    catch_up_speed: f32,
    base_deadzone: f32,
    connect_to_tip_on_release: bool,
    pressure_smoothing: Option<f32>,
    weight: Option<f32>,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.pull_string = sketch_core::stroke::PullStringConfig {
            enabled,
            max_string_length,
            velocity_multiplier,
            catch_up_speed,
            base_deadzone,
            connect_to_tip_on_release,
            pressure_smoothing: pressure_smoothing.unwrap_or(0.35),
            weight: weight.unwrap_or(0.0),
        };
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_pressure_lut(lut: Vec<f32>) -> Result<(), String> {
    {
        let mut guard = GLOBAL_SESSION.lock().unwrap();
        if let Some(session) = guard.as_mut() {
            if lut.len() == 256 {
                let mut arr = [0.0f32; 256];
                arr.copy_from_slice(&lut);
                session.engine.config.pressure_lut = Some(Box::new(arr));
            } else {
                session.engine.config.pressure_lut = None;
            }
        }
    }
    #[cfg(target_os = "macos")]
    unsafe {
        if lut.len() == 256 {
            set_native_pressure_lut(lut.as_ptr(), 256);
        } else {
            set_native_pressure_lut(std::ptr::null(), 0);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_dynamics_mapping(
    param: String,
    enabled: bool,
    sensor: String,
    min_output: f32,
    max_output: f32,
    lut: Vec<f32>,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let sensor_type = sketch_core::brush::SensorType::from_str(&sensor);
        if enabled && lut.len() == 256 {
            let mut arr = [0.0f32; 256];
            arr.copy_from_slice(&lut);
            let curve = sketch_core::brush::DynamicsCurve::from_lut(arr);
            session.engine.config.dynamics.set_sensor_mapping(
                &param,
                sensor_type,
                true,
                min_output,
                max_output,
                curve,
            );
        } else {
            let curve = sketch_core::brush::DynamicsCurve::linear();
            session.engine.config.dynamics.set_sensor_mapping(
                &param,
                sensor_type,
                false,
                min_output,
                max_output,
                curve,
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_dynamics_calculation_mode(
    param: String,
    mode: String,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        let calc_mode = sketch_core::brush::DynamicsCalculationMode::from_str(&mode);
        session.engine.config.dynamics.set_calculation_mode(&param, calc_mode);
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear_dynamics() -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.dynamics.clear();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_modal_open(is_open: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_native_overlay_modal_open(is_open);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = is_open;
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear(
    _fill_color: Option<[u8; 4]>,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.stack.clear_active_layer();
        session.engine.end_stroke();
    }
    #[cfg(target_os = "macos")]
    unsafe {
        trigger_native_overlay_repaint();
    }
    Ok(())
}

#[tauri::command]
pub fn rust_brush_get_telemetry() -> Option<StrokeTelemetryDto> {
    if let Ok(guard) = LAST_TELEMETRY.lock() {
        guard.clone()
    } else {
        None
    }
}
