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
                    antialias: true,
                    blend_mode: sketch_core::brush::ColorBlendMode::Normal,
                    tip_type: sketch_core::brush::tip::BrushTipType::default(),
                    texture: None,
                    texture_by_pressure: false,
                    pressure_lut: None,
                    moving_average: sketch_core::stroke::MovingAverageConfig::default(),
                    pull_string: sketch_core::stroke::PullStringConfig::default(),
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
        antialias: true,
        blend_mode: sketch_core::brush::ColorBlendMode::Normal,
        tip_type: sketch_core::brush::tip::BrushTipType::default(),
        texture: None,
        texture_by_pressure: false,
        pressure_lut: None,
        moving_average: sketch_core::stroke::MovingAverageConfig::default(),
        pull_string: sketch_core::stroke::PullStringConfig::default(),
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
        let _ = session.engine.finish_stroke(&mut session.canvas);
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
}

#[tauri::command]
pub async fn rust_set_workspace_theme(is_dark: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        set_workspace_theme(is_dark);
    }
    Ok(())
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
            sketch_core::brush::ColorBlendMode::Erase
        } else if let Some(ref m) = dto.blend_mode {
            sketch_core::brush::ColorBlendMode::from_str(m)
        } else {
            sketch_core::brush::ColorBlendMode::Normal
        };

        let tip_type = if let (Some(ar), Some(ang)) = (dto.aspect_ratio, dto.angle_radians) {
            sketch_core::brush::tip::BrushTipType::Auto {
                aspect_ratio: ar,
                angle_radians: ang,
            }
        } else {
            sketch_core::brush::tip::BrushTipType::default()
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

        let mut new_config: BrushConfig = config.into();
        new_config.pressure_lut = existing_lut;
        new_config.moving_average = existing_moving_average;
        new_config.pull_string = existing_pull_string;
        new_config.texture = existing_texture;
        new_config.texture_by_pressure = existing_texture_by_pressure;

        // If incoming config did not explicitly provide custom aspect ratio / angle, preserve predefined tip
        if matches!(existing_tip_type, sketch_core::brush::tip::BrushTipType::Predefined { .. })
            && new_config.tip_type == sketch_core::brush::tip::BrushTipType::default()
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextureConfigDto {
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default = "default_strength")]
    pub strength: f32,
    #[serde(default)]
    pub invert: bool,
    #[serde(default)]
    pub brightness: f32,
    #[serde(default = "default_contrast")]
    pub contrast: f32,
    #[serde(default)]
    pub cutoff_left: f32,
    #[serde(default = "default_cutoff_right")]
    pub cutoff_right: f32,
    #[serde(default)]
    pub by_pressure: bool,
}

fn default_scale() -> f32 {
    1.0
}
fn default_strength() -> f32 {
    1.0
}
fn default_contrast() -> f32 {
    1.0
}
fn default_cutoff_right() -> f32 {
    1.0
}

#[tauri::command]
pub async fn rust_brush_set_texture(config: TextureConfigDto) -> Result<(), String> {
    use std::sync::Arc;
    let mode = if let Some(ref m) = config.mode {
        sketch_core::brush::blend::TextureBlendMode::from_str(m)
    } else {
        sketch_core::brush::blend::TextureBlendMode::Multiply
    };
    let pattern = Arc::new(sketch_core::brush::texture::PatternData::from_grayscale(
        config.width,
        config.height,
        config.bytes,
    ));
    let texture = sketch_core::brush::texture::TextureConfig {
        pattern,
        scale: config.scale.max(0.01),
        offset_x: 0,
        offset_y: 0,
        brightness: config.brightness,
        contrast: config.contrast,
        cutoff_left: config.cutoff_left,
        cutoff_right: config.cutoff_right,
        invert: config.invert,
        mode,
        strength: config.strength.clamp(0.0, 1.0),
    };

    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.texture = Some(texture);
        session.engine.config.texture_by_pressure = config.by_pressure;
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear_texture() -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.texture = None;
        session.engine.config.texture_by_pressure = false;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredefinedTipDto {
    pub width: u32,
    pub height: u32,
    pub mask: Vec<u8>,
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default)]
    pub angle_radians: f32,
    #[serde(default)]
    pub invert_gbr: bool,
}

#[tauri::command]
pub async fn rust_brush_set_predefined_tip(tip: PredefinedTipDto) -> Result<(), String> {
    use std::sync::Arc;
    let tip_data = Arc::new(sketch_core::brush::tip::PredefinedTipData::from_gbr_grayscale(
        tip.width,
        tip.height,
        &tip.mask,
        tip.invert_gbr,
    ));
    let tip_type = sketch_core::brush::tip::BrushTipType::Predefined {
        tip_data,
        scale: tip.scale.max(0.01),
        angle_radians: tip.angle_radians,
    };

    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.tip_type = tip_type;
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear_predefined_tip() -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.tip_type = sketch_core::brush::tip::BrushTipType::default();
    }
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_set_moving_average_config(
    enabled: bool,
    window_size: u32,
    velocity_multiplier: f32,
) -> Result<(), String> {
    let mut guard = GLOBAL_SESSION.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.engine.config.moving_average = sketch_core::stroke::MovingAverageConfig {
            enabled,
            window_size: window_size as usize,
            velocity_multiplier,
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
