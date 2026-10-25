use wasm_bindgen::prelude::*;
use crate::brush::config::BrushConfig;
use crate::brush::engine::PixelBrushEngine;
use crate::brush::rect::Rect;
use crate::brush::resource::{parse_gbr, parse_pat, PatternRegistry, TipRegistry};
use crate::brush::texture::{PatternData, TextureConfig};
use crate::brush::tip::{BrushTipType, PredefinedTipData};
use crate::composite::CompositeStack;
use crate::stroke::StrokeEvent;

/// WebAssembly binding for the Krita pixel brush engine and multi-layer compositor.
/// Exposes stroke stepping along continuous midpoint quadratic Bézier splines,
/// multi-layer compositing, real brush tip raster masks, and seamless paper textures.
#[wasm_bindgen]
pub struct WasmBrushEngine {
    engine: PixelBrushEngine,
    stack: CompositeStack,
    tip_registry: TipRegistry,
    pattern_registry: PatternRegistry,
}

#[wasm_bindgen]
impl WasmBrushEngine {
    /// Creates a new `WasmBrushEngine` with an initial canvas dimension.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        let config = BrushConfig::default();
        let stack = CompositeStack::with_background(width, height, [255, 255, 255, 255], false);
        let engine = PixelBrushEngine::new(config);
        Self {
            engine,
            stack,
            tip_registry: TipRegistry::new(),
            pattern_registry: PatternRegistry::new(),
        }
    }

    /// Re-initializes or resizes the canvas with the specified dimensions and fill RGBA color.
    pub fn init_canvas(&mut self, width: u32, height: u32, r: u8, g: u8, b: u8, a: u8) {
        let mut stack = CompositeStack::with_background(width, height, [r, g, b, a], false);
        if let Some(active) = stack.active_layer_mut() {
            active.clear([r, g, b, a]);
        }
        stack.composite_all();
        self.stack = stack;
    }

    /// Fills the active layer (or entire canvas if cleared) with a solid RGBA color.
    pub fn clear(&mut self, r: u8, g: u8, b: u8, a: u8) {
        if let Some(active) = self.stack.active_layer_mut() {
            active.clear([r, g, b, a]);
        }
        self.stack.composite_all();
    }

    // ========================================================================
    // Layer Compositor Controls
    // ========================================================================

    /// Adds a new layer and makes it active.
    pub fn add_layer(&mut self, id: String, name: String) -> Result<(), JsValue> {
        self.stack
            .add_layer(id, name)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Removes a layer by ID.
    pub fn remove_layer(&mut self, id: &str) -> Result<(), JsValue> {
        self.stack
            .remove_layer(id)
            .map(|_| ())
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Duplicates an existing layer.
    pub fn duplicate_layer(
        &mut self,
        source_id: &str,
        new_id: String,
        new_name: String,
    ) -> Result<(), JsValue> {
        self.stack
            .duplicate_layer(source_id, new_id, new_name)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Sets the active layer.
    pub fn set_active_layer(&mut self, id: &str) -> bool {
        self.stack.set_active_layer(id)
    }

    /// Sets layer opacity in `[0.0, 1.0]`.
    pub fn set_layer_opacity(&mut self, id: &str, opacity: f32) -> bool {
        self.stack.set_layer_opacity(id, opacity)
    }

    /// Sets layer blend mode (e.g. "normal", "multiply", "screen", "parallel", etc.).
    pub fn set_layer_blend_mode(&mut self, id: &str, mode_name: &str) -> bool {
        let mode = crate::brush::ColorBlendMode::from_str(mode_name);
        self.stack.set_layer_blend_mode(id, mode)
    }

    /// Sets layer visibility.
    pub fn set_layer_visibility(&mut self, id: &str, visible: bool) -> bool {
        self.stack.set_layer_visibility(id, visible)
    }

    /// Sets the canvas paper background color.
    pub fn set_background_color(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.stack.set_background_color([r, g, b, a]);
    }

    /// Toggles background canvas paper visibility.
    pub fn set_background_visible(&mut self, visible: bool) {
        self.stack.set_background_visible(visible);
    }

    // ========================================================================
    // Resource Management (Brush Tips & Patterns)
    // ========================================================================

    /// Registers a GBR brush tip raster mask from file bytes.
    pub fn register_tip_gbr(&mut self, id: String, bytes: &[u8]) -> Result<String, JsValue> {
        let (tip, name) = parse_gbr(bytes).map_err(|e| JsValue::from_str(&e))?;
        self.tip_registry.register(id, name.clone(), tip);
        Ok(name)
    }

    /// Registers a grayscale predefined tip mask or RGBA pixel buffer.
    pub fn register_tip_mask(
        &mut self,
        id: String,
        name: String,
        width: u32,
        height: u32,
        mask: &[u8],
        invert: bool,
    ) {
        let tip = if mask.len() == (width * height * 4) as usize {
            PredefinedTipData::from_rgba(width, height, mask)
        } else {
            PredefinedTipData::from_gbr_grayscale(width, height, mask, invert)
        };
        self.tip_registry.register(id, name, tip);
    }

    /// Sets the active brush tip to a registered predefined raster stamp.
    pub fn set_brush_predefined_tip(&mut self, tip_id: &str, scale: f32, angle_radians: f32) -> bool {
        if let Some(tip_data) = self.tip_registry.get(tip_id) {
            self.engine.config.tip_type = BrushTipType::Predefined {
                tip_data,
                scale: scale.max(0.01),
                angle_radians,
            };
            true
        } else {
            false
        }
    }

    /// Resets brush tip to default Auto circle.
    pub fn clear_brush_predefined_tip(&mut self) {
        self.engine.config.tip_type = BrushTipType::default();
    }

    /// Registers a PAT seamless pattern texture from file bytes.
    pub fn register_pattern_pat(&mut self, id: String, bytes: &[u8]) -> Result<String, JsValue> {
        let (pattern, name) = parse_pat(bytes).map_err(|e| JsValue::from_str(&e))?;
        self.pattern_registry.register(id, name.clone(), pattern);
        Ok(name)
    }

    /// Registers a pattern from grayscale luminance bytes.
    pub fn register_pattern_grayscale(
        &mut self,
        id: String,
        name: String,
        width: u32,
        height: u32,
        bytes: &[u8],
    ) {
        let pattern = PatternData::from_grayscale(width, height, bytes.to_vec());
        self.pattern_registry.register(id, name, pattern);
    }

    /// Registers a pattern from RGBA interleaved pixels.
    pub fn register_pattern_rgba(
        &mut self,
        id: String,
        name: String,
        width: u32,
        height: u32,
        rgba_bytes: &[u8],
    ) {
        let pattern = PatternData::from_rgba(width, height, rgba_bytes);
        self.pattern_registry.register(id, name, pattern);
    }

    /// Configures paper texture modulation from a registered pattern resource.
    #[allow(clippy::too_many_arguments)]
    pub fn set_brush_texture_resource(
        &mut self,
        pattern_id: &str,
        scale: f32,
        mode_str: &str,
        strength: f32,
        invert: bool,
        brightness: f32,
        contrast: f32,
        by_pressure: bool,
    ) -> bool {
        if let Some(pattern) = self.pattern_registry.get(pattern_id) {
            let mode = crate::brush::blend::TextureBlendMode::from_str(mode_str);
            self.engine.config.texture = Some(TextureConfig {
                pattern,
                scale: scale.max(0.01),
                offset_x: 0,
                offset_y: 0,
                brightness,
                contrast,
                cutoff_left: 0.0,
                cutoff_right: 1.0,
                invert,
                mode,
                strength: strength.clamp(0.0, 1.0),
            });
            self.engine.config.texture_by_pressure = by_pressure;
            true
        } else {
            false
        }
    }

    /// Clears any active paper grain texture.
    pub fn clear_brush_texture(&mut self) {
        self.engine.config.texture = None;
        self.engine.config.texture_by_pressure = false;
    }

    // ========================================================================
    // Brush Configuration & Dynamics
    // ========================================================================

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
        let existing_tip_type = self.engine.config.tip_type.clone();
        let existing_texture = self.engine.config.texture.clone();
        let existing_texture_by_pressure = self.engine.config.texture_by_pressure;
        let existing_dynamics = self.engine.config.dynamics.clone();

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
            tip_type: existing_tip_type,
            texture: existing_texture,
            texture_by_pressure: existing_texture_by_pressure,
            pressure_lut: existing_lut,
            moving_average: existing_moving_average,
            pull_string: existing_pull_string,
            dynamics: existing_dynamics,
        };
    }

    /// Sets the color blend mode (e.g. "normal", "multiply", "screen", "parallel", etc.).
    pub fn set_brush_blend_mode(&mut self, mode_name: &str) {
        self.engine.config.blend_mode = crate::brush::ColorBlendMode::from_str(mode_name);
    }

    /// Configures AutoBrush elliptical geometry (aspect ratio and rotation angle in radians).
    pub fn set_brush_auto_tip(&mut self, aspect_ratio: f32, angle_radians: f32) {
        self.engine.config.tip_type = BrushTipType::Auto {
            aspect_ratio,
            angle_radians,
        };
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
    pub fn set_pressure_lut(&mut self, lut: &[f32]) {
        if lut.len() == 256 {
            let mut arr = [0.0f32; 256];
            arr.copy_from_slice(lut);
            self.engine.config.pressure_lut = Some(Box::new(arr));
        } else {
            self.engine.config.pressure_lut = None;
        }
    }

    /// Sets or clears a dynamic sensor mapping and transfer curve for a brush property.
    pub fn set_dynamics_mapping(
        &mut self,
        param: &str,
        enabled: bool,
        sensor: &str,
        min_output: f32,
        max_output: f32,
        lut: &[f32],
    ) {
        let sensor_type = crate::brush::dynamics::SensorType::from_str(sensor);
        if enabled && lut.len() == 256 {
            let mut arr = [0.0f32; 256];
            arr.copy_from_slice(lut);
            let curve = crate::brush::dynamics::DynamicsCurve::from_lut(arr);
            self.engine.config.dynamics.set_sensor_mapping(
                param,
                sensor_type,
                true,
                min_output,
                max_output,
                curve,
            );
        } else {
            let curve = crate::brush::dynamics::DynamicsCurve::linear();
            self.engine.config.dynamics.set_sensor_mapping(
                param,
                sensor_type,
                false,
                min_output,
                max_output,
                curve,
            );
        }
    }

    /// Sets the calculation mode for combining multiple sensor dynamics on a brush property (multiply, add, max, min).
    pub fn set_dynamics_calculation_mode(&mut self, param: &str, mode: &str) {
        let calc_mode = crate::brush::dynamics::DynamicsCalculationMode::from_str(mode);
        self.engine.config.dynamics.set_calculation_mode(param, calc_mode);
    }

    /// Clears all dynamic sensor modulations back to static defaults.
    pub fn clear_dynamics(&mut self) {
        self.engine.config.dynamics.clear();
    }

    // ========================================================================
    // Stroke Execution
    // ========================================================================

    /// Begins a stroke at (x, y) with pressure and optional timestamp in seconds.
    pub fn begin_stroke(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::new(x, y, pressure, time.unwrap_or(0.0));
        self.engine
            .begin_stroke_on_stack(event, &mut self.stack)
            .map(rect_to_boxed_slice)
    }

    /// Begins a stroke at (x, y) with pressure, timestamp, and stylus tilt angles.
    pub fn begin_stroke_with_tilt(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
        tilt_x: Option<f32>,
        tilt_y: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::with_tilt(
            x,
            y,
            pressure,
            time.unwrap_or(0.0),
            tilt_x.unwrap_or(0.0),
            tilt_y.unwrap_or(0.0),
        );
        self.engine
            .begin_stroke_on_stack(event, &mut self.stack)
            .map(rect_to_boxed_slice)
    }

    /// Extends a stroke to (x, y) with pressure and optional timestamp using quadratic Bézier splines.
    pub fn paint_to(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::new(x, y, pressure, time.unwrap_or(0.0));
        self.engine
            .paint_to_stack(event, &mut self.stack)
            .map(rect_to_boxed_slice)
    }

    /// Extends a stroke to (x, y) with pressure, timestamp, and stylus tilt angles.
    pub fn paint_to_with_tilt(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        time: Option<f32>,
        tilt_x: Option<f32>,
        tilt_y: Option<f32>,
    ) -> Option<Box<[i32]>> {
        let event = StrokeEvent::with_tilt(
            x,
            y,
            pressure,
            time.unwrap_or(0.0),
            tilt_x.unwrap_or(0.0),
            tilt_y.unwrap_or(0.0),
        );
        self.engine
            .paint_to_stack(event, &mut self.stack)
            .map(rect_to_boxed_slice)
    }

    /// Paints a batch of coalesced pointer events flatly laid out as [x0, y0, p0, ...].
    pub fn paint_batch(&mut self, flat_events: &[f32]) -> Option<Box<[i32]>> {
        let mut combined: Option<Rect> = None;
        let stride = if !flat_events.is_empty() && flat_events.len() % 6 == 0 {
            6
        } else if !flat_events.is_empty() && flat_events.len() % 4 == 0 {
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
            let t = if stride >= 4 { flat_events[offset + 3] } else { 0.0 };
            let (tx, ty) = if stride == 6 {
                (flat_events[offset + 4], flat_events[offset + 5])
            } else {
                (0.0, 0.0)
            };
            let event = StrokeEvent::with_tilt(x, y, p, t, tx, ty);
            if let Some(r) = self.engine.paint_to_stack(event, &mut self.stack) {
                combined = match combined {
                    None => Some(r),
                    Some(c) => Some(c.expand_to_include(Some(&r))),
                };
            }
        }
        combined.map(rect_to_boxed_slice)
    }

    /// Finishes the stroke trajectory and composites final dirty region.
    pub fn finish_stroke(&mut self) -> Option<Box<[i32]>> {
        self.engine
            .finish_stroke_on_stack(&mut self.stack)
            .map(rect_to_boxed_slice)
    }

    /// Completes the stroke and clears trajectory state.
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

    /// Returns a raw pointer to the composited RGBA8 display framebuffer in WebAssembly memory.
    pub fn get_pixel_buffer_ptr(&self) -> *const u8 {
        self.stack.get_display_pixels().as_ptr()
    }

    /// Returns the total byte length of the display framebuffer.
    pub fn get_pixel_buffer_len(&self) -> usize {
        self.stack.get_display_pixels().len()
    }

    /// Copies a sub-rectangle `[x, y, w, h]` from the composited display buffer into caller buffer.
    pub fn copy_sub_rect(&self, x: i32, y: i32, w: i32, h: i32, out_buffer: &mut [u8]) -> bool {
        if w <= 0 || h <= 0 {
            return false;
        }
        let (w_u, h_u) = (w as usize, h as usize);
        if out_buffer.len() < w_u * h_u * 4 {
            return false;
        }

        let canvas_w = self.stack.width as i32;
        let canvas_h = self.stack.height as i32;
        let stride = self.stack.display_framebuffer.stride;
        let buffer = self.stack.get_display_pixels();

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
                        .copy_from_slice(&buffer[in_idx..in_idx + 4]);
                }
            }
        }
        true
    }

    pub fn width(&self) -> u32 {
        self.stack.width
    }

    pub fn height(&self) -> u32 {
        self.stack.height
    }
}

fn rect_to_boxed_slice(r: Rect) -> Box<[i32]> {
    Box::new([r.x, r.y, r.w, r.h])
}
