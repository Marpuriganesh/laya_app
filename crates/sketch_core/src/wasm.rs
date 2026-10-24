use wasm_bindgen::prelude::*;
use crate::brush::canvas::CanvasView;
use crate::brush::config::BrushConfig;
use crate::brush::engine::PixelBrushEngine;
use crate::brush::rect::Rect;
use crate::stroke::StrokeEvent;

/// WebAssembly binding for the Krita pixel brush engine.
/// Exposes stroke stepping along continuous midpoint quadratic Bézier splines,
/// analytical dab softness rasterization, and direct pixel buffer access.
#[wasm_bindgen]
pub struct WasmBrushEngine {
    engine: PixelBrushEngine,
    canvas: CanvasView,
}

#[wasm_bindgen]
impl WasmBrushEngine {
    /// Creates a new `WasmBrushEngine` with an initial canvas dimension.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        let config = BrushConfig::default();
        let canvas = CanvasView::with_color(width, height, [0, 0, 0, 0]);
        let engine = PixelBrushEngine::new(config);
        Self { engine, canvas }
    }

    /// Re-initializes or resizes the canvas with the specified dimensions and fill RGBA color.
    pub fn init_canvas(&mut self, width: u32, height: u32, r: u8, g: u8, b: u8, a: u8) {
        self.canvas = CanvasView::with_color(width, height, [r, g, b, a]);
    }

    /// Fills the entire canvas with a solid RGBA color.
    pub fn clear(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.canvas.clear([r, g, b, a]);
    }

    /// Configures the active brush tip geometry, softness, color, and dynamics.
    #[allow(clippy::too_many_arguments)]
    pub fn set_brush_config(
        &mut self,
        diameter: f32,
        spacing: f32,
        softness: f32,
        r: u8,
        g: u8,
        b: u8,
        a: u8,
        opacity: f32,
        flow: f32,
        size_by_pressure: bool,
        opacity_by_pressure: bool,
        is_erase: bool,
        antialias: bool,
    ) {
        let existing_lut = self.engine.config.pressure_lut.take();
        let existing_moving_average = self.engine.config.moving_average;
        let existing_pull_string = self.engine.config.pull_string;
        let existing_blend_mode = self.engine.config.blend_mode;
        self.engine.config = BrushConfig {
            diameter,
            spacing,
            softness,
            color: [r, g, b, a],
            opacity,
            flow,
            size_by_pressure,
            opacity_by_pressure,
            is_erase,
            antialias,
            blend_mode: if is_erase {
                crate::brush::ColorBlendMode::Erase
            } else {
                existing_blend_mode
            },
            pressure_lut: existing_lut,
            moving_average: existing_moving_average,
            pull_string: existing_pull_string,
        };
    }

    /// Sets the color blend mode (e.g. "normal", "multiply", "screen", "overlay", "add", "subtract", etc.).
    pub fn set_brush_blend_mode(&mut self, mode_name: &str) {
        self.engine.config.blend_mode = crate::brush::ColorBlendMode::from_str(mode_name);
    }

    /// Configures the dynamic moving average line art stroke stabilizer.
    pub fn set_moving_average_config(
        &mut self,
        enabled: bool,
        window_size: u32,
        velocity_multiplier: f32,
    ) {
        self.engine.config.moving_average = crate::stroke::MovingAverageConfig {
            enabled,
            window_size: window_size as usize,
            velocity_multiplier,
        };
    }

    /// Configures the dynamic pulled string (leash) stroke stabilizer.
    pub fn set_pull_string_config(
        &mut self,
        enabled: bool,
        max_string_length: f32,
        velocity_multiplier: f32,
        catch_up_speed: f32,
        base_deadzone: f32,
        connect_to_tip_on_release: bool,
        pressure_smoothing: f32,
    ) {
        self.engine.config.pull_string = crate::stroke::PullStringConfig {
            enabled,
            max_string_length,
            velocity_multiplier,
            catch_up_speed,
            base_deadzone,
            connect_to_tip_on_release,
            pressure_smoothing,
        };
    }

    /// Configures the 256-sample pressure response curve lookup table.
    /// If slice is empty or not 256 samples, clears the custom LUT (reverting to linear 1:1).
    pub fn set_pressure_lut(&mut self, lut: &[f32]) {
        if lut.len() == 256 {
            let mut arr = [0.0f32; 256];
            arr.copy_from_slice(lut);
            self.engine.config.pressure_lut = Some(Box::new(arr));
        } else {
            self.engine.config.pressure_lut = None;
        }
    }

    /// Begins a stroke at (x, y) with pressure and optional timestamp in seconds.
    /// Returns [x, y, w, h] dirty rect as Int32Array, or undefined if no pixels modified.
    pub fn begin_stroke(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::new(x, y, pressure, time.unwrap_or(0.0));
        self.engine.begin_stroke(event, &mut self.canvas).map(rect_to_boxed_slice)
    }

    /// Extends a stroke to (x, y) with pressure and optional timestamp in seconds using midpoint quadratic Bézier splines.
    /// Returns [x, y, w, h] dirty rect as Int32Array, or undefined if no dabs stamped.
    pub fn paint_to(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::new(x, y, pressure, time.unwrap_or(0.0));
        self.engine.paint_to(event, &mut self.canvas).map(rect_to_boxed_slice)
    }

    /// Paints a batch of coalesced pointer events flatly laid out as [x0, y0, p0, ...], or [x0, y0, p0, t0, ...].
    /// Returns the combined bounding dirty rectangle enclosing all stamped dabs.
    pub fn paint_batch(&mut self, flat_events: &[f32]) -> Option<Box<[i32]>> {
        let mut combined: Option<Rect> = None;
        let stride = if !flat_events.is_empty() && flat_events.len() % 4 == 0 {
            4
        } else {
            3
        };
        let count = flat_events.len() / stride;
        for i in 0..count {
            let offset = i * stride;
            let x = flat_events[offset];
            let y = flat_events[offset + 1];
            let p = flat_events[offset + 2];
            let t = if stride == 4 { flat_events[offset + 3] } else { 0.0 };
            let event = StrokeEvent::new(x, y, p, t);
            if let Some(r) = self.engine.paint_to(event, &mut self.canvas) {
                combined = match combined {
                    None => Some(r),
                    Some(c) => Some(c.expand_to_include(Some(&r))),
                };
            }
        }
        combined.map(rect_to_boxed_slice)
    }

    /// Finishes the stroke trajectory to the final event and resets trajectory state.
    pub fn finish_stroke(&mut self) -> Option<Box<[i32]>> {
        self.engine.finish_stroke(&mut self.canvas).map(rect_to_boxed_slice)
    }

    /// Completes the stroke and clears trajectory state without stamping trailing dab.
    pub fn end_stroke(&mut self) {
        self.engine.end_stroke();
    }

    /// Returns the current smoothed tip coordinates [x, y] or undefined if not active.
    pub fn get_smoothed_tip(&self) -> Option<Box<[f32]>> {
        if self.engine.config.pull_string.enabled {
            if let Some((x, y)) = self.engine.pull_string.smoothed_tip {
                return Some(Box::new([x, y]));
            }
        }
        if let Some(m) = self.engine.trajectory.prev_midpoint {
            return Some(Box::new([m.x, m.y]));
        }
        if let Some(e) = self.engine.trajectory.prev_event {
            return Some(Box::new([e.x, e.y]));
        }
        None
    }

    /// Returns a raw pointer to the canvas RGBA8 pixel buffer in WebAssembly memory.
    pub fn get_pixel_buffer_ptr(&self) -> *const u8 {
        self.canvas.buffer.as_ptr()
    }

    /// Returns the total byte length of the canvas RGBA8 pixel buffer.
    pub fn get_pixel_buffer_len(&self) -> usize {
        self.canvas.buffer.len()
    }

    /// Copies a sub-rectangle `[x, y, w, h]` from the canvas buffer into a caller-provided buffer.
    pub fn copy_sub_rect(&self, x: i32, y: i32, w: i32, h: i32, out_buffer: &mut [u8]) -> bool {
        if w <= 0 || h <= 0 {
            return false;
        }
        let (w_u, h_u) = (w as usize, h as usize);
        if out_buffer.len() < w_u * h_u * 4 {
            return false;
        }

        let canvas_w = self.canvas.width as i32;
        let canvas_h = self.canvas.height as i32;
        let stride = self.canvas.stride;

        for row in 0..h {
            let cy = y + row;
            let out_row_start = (row as usize) * w_u * 4;
            if cy < 0 || cy >= canvas_h {
                out_buffer[out_row_start..out_row_start + w_u * 4].fill(0);
                continue;
            }

            for col in 0..w {
                let cx = x + col;
                let out_col_start = out_row_start + (col as usize * 4);
                if cx < 0 || cx >= canvas_w {
                    out_buffer[out_col_start..out_col_start + 4].fill(0);
                } else {
                    let in_idx = (cy as usize * stride) + (cx as usize * 4);
                    out_buffer[out_col_start..out_col_start + 4]
                        .copy_from_slice(&self.canvas.buffer[in_idx..in_idx + 4]);
                }
            }
        }
        true
    }

    pub fn width(&self) -> u32 {
        self.canvas.width
    }

    pub fn height(&self) -> u32 {
        self.canvas.height
    }
}

fn rect_to_boxed_slice(r: Rect) -> Box<[i32]> {
    Box::new([r.x, r.y, r.w, r.h])
}
