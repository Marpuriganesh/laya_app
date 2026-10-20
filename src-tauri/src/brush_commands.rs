use serde::{Deserialize, Serialize};
use sketch_core::{BrushConfig, CanvasView, PixelBrushEngine, Rect, StrokeEvent};
use std::sync::Mutex;
use tauri::State;

/// Shared application state managing the active Rust canvas buffer and brush engine.
pub struct BrushEngineState {
    pub inner: Mutex<BrushSession>,
}

pub struct BrushSession {
    pub canvas: CanvasView,
    pub engine: PixelBrushEngine,
}

impl Default for BrushEngineState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(BrushSession {
                canvas: CanvasView::new(1920, 1080),
                engine: PixelBrushEngine::new(BrushConfig::default()),
            }),
        }
    }
}

/// DTO for incoming pointer/stylus events from the web frontend.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StrokeEventDto {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub time: f32,
}

impl From<StrokeEventDto> for StrokeEvent {
    fn from(dto: StrokeEventDto) -> Self {
        Self::new(dto.x, dto.y, dto.pressure, dto.time)
    }
}

/// DTO for brush configuration updates from the UI.
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
        }
    }
}

/// DTO returning the clipped modified region and its RGBA8 pixel bytes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirtyUpdateDto {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub rgba_bytes: Vec<u8>,
}

fn create_dirty_update(canvas: &CanvasView, rect: Rect) -> Option<DirtyUpdateDto> {
    let rgba_bytes = canvas.extract_sub_rect(&rect)?;
    Some(DirtyUpdateDto {
        x: rect.x,
        y: rect.y,
        width: rect.w as u32,
        height: rect.h as u32,
        rgba_bytes,
    })
}

#[tauri::command]
pub async fn rust_brush_init(
    state: State<'_, BrushEngineState>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let mut session = state.inner.lock().map_err(|e| e.to_string())?;
    session.canvas = CanvasView::new(width, height);
    session.engine.end_stroke();
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_begin_stroke(
    state: State<'_, BrushEngineState>,
    event: StrokeEventDto,
    config: Option<BrushConfigDto>,
) -> Result<Option<DirtyUpdateDto>, String> {
    let mut session = state.inner.lock().map_err(|e| e.to_string())?;
    let BrushSession { canvas, engine } = &mut *session;
    if let Some(cfg) = config {
        engine.config = cfg.into();
    }
    let stroke_event: StrokeEvent = event.into();
    let maybe_rect = engine.begin_stroke(stroke_event, canvas);
    let update = maybe_rect.and_then(|r| create_dirty_update(canvas, r));
    Ok(update)
}

#[tauri::command]
pub async fn rust_brush_paint_coalesced(
    state: State<'_, BrushEngineState>,
    events: Vec<StrokeEventDto>,
) -> Result<Option<DirtyUpdateDto>, String> {
    let mut session = state.inner.lock().map_err(|e| e.to_string())?;
    if events.is_empty() {
        return Ok(None);
    }
    let core_events: Vec<StrokeEvent> = events.into_iter().map(Into::into).collect();
    let BrushSession { canvas, engine } = &mut *session;
    let maybe_rect = engine.paint_coalesced_events(&core_events, canvas);
    let update = maybe_rect.and_then(|r| create_dirty_update(canvas, r));
    Ok(update)
}

#[tauri::command]
pub async fn rust_brush_end_stroke(
    state: State<'_, BrushEngineState>,
) -> Result<(), String> {
    let mut session = state.inner.lock().map_err(|e| e.to_string())?;
    session.engine.end_stroke();
    Ok(())
}

#[tauri::command]
pub async fn rust_brush_clear(
    state: State<'_, BrushEngineState>,
    fill_color: [u8; 4],
) -> Result<(), String> {
    let mut session = state.inner.lock().map_err(|e| e.to_string())?;
    session.canvas.clear(fill_color);
    session.engine.end_stroke();
    Ok(())
}
