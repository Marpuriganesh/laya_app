use crate::brush::blitter::CanvasBlitter;
use crate::brush::canvas::CanvasView;
use crate::brush::config::BrushConfig;
use crate::brush::rasterizer::MaskRasterizer;
use crate::brush::rect::Rect;
use crate::composite::CompositeStack;
use crate::stroke::event::StrokeEvent;
use crate::stroke::moving_average::MovingAverageStabilizer;
use crate::stroke::pull_string::PullStringStabilizer;
use crate::stroke::trajectory::StrokeTrajectory;

/// Orchestrates stroke stepping along midpoint quadratic Bézier splines,
/// analytical dab mask generation, and canvas blitting.
#[derive(Debug, Clone)]
pub struct PixelBrushEngine {
    pub config: BrushConfig,
    pub trajectory: StrokeTrajectory,
    pub moving_average: MovingAverageStabilizer,
    pub pull_string: PullStringStabilizer,
    pub rasterizer: MaskRasterizer,
    pub tip_rasterizer: crate::brush::tip::BrushTipRasterizer,
    pub blitter: CanvasBlitter,
    pub current_velocity: f32,
    pub total_distance: f32,
    prev_raw_event: Option<StrokeEvent>,
    scratch_mask: Vec<u8>,
}

impl PixelBrushEngine {
    /// Constructs a new `PixelBrushEngine` with the given brush configuration.
    pub fn new(config: BrushConfig) -> Self {
        Self {
            config,
            trajectory: StrokeTrajectory::new(),
            moving_average: MovingAverageStabilizer::new(),
            pull_string: PullStringStabilizer::new(),
            rasterizer: MaskRasterizer::new(),
            tip_rasterizer: crate::brush::tip::BrushTipRasterizer::new(),
            blitter: CanvasBlitter::new(),
            current_velocity: 0.0,
            total_distance: 0.0,
            prev_raw_event: None,
            scratch_mask: Vec::with_capacity(4096),
        }
    }

    /// Begins a new stroke at the given starting event, stamping an initial dab.
    pub fn begin_stroke(
        &mut self,
        start_event: StrokeEvent,
        canvas: &mut CanvasView,
    ) -> Option<Rect> {
        let mut dirty: Option<Rect> = None;
        let config = &self.config;
        let tip_rasterizer = &self.tip_rasterizer;
        let blitter = &self.blitter;
        let scratch = &mut self.scratch_mask;

        self.current_velocity = 0.0;
        self.total_distance = 0.0;
        self.prev_raw_event = Some(start_event);

        // Composable smoothing pipeline: Moving Average -> Pull String -> Trajectory
        let event_after_avg = self.moving_average.begin_stroke(start_event, &self.config.moving_average);
        let seed_event = self.pull_string.begin_stroke(event_after_avg, &self.config.pull_string);

        self.trajectory.begin_stroke(seed_event, |dab| {
            dirty = Self::paint_dab_impl(dab, config, tip_rasterizer, blitter, scratch, canvas, 0.0, 0.0);
        });

        dirty
    }

    /// Paints from the current stroke trajectory to `next_event` using continuous
    /// Midpoint Quadratic Bézier Spline interpolation (C¹ smooth tangent continuity).
    pub fn paint_to(&mut self, next_event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        let (velocity, dist_step) = if let Some(p) = self.prev_raw_event {
            let dt = (next_event.time - p.time).max(0.001);
            let dist = ((next_event.x - p.x).powi(2) + (next_event.y - p.y).powi(2)).sqrt();
            ((dist / dt).min(5000.0), dist)
        } else {
            (0.0, 0.0)
        };
        self.current_velocity = velocity;
        self.total_distance += dist_step;
        self.prev_raw_event = Some(next_event);

        let current_velocity = self.current_velocity;
        let current_distance = self.total_distance;

        // Composable smoothing pipeline: Moving Average -> Pull String -> Trajectory
        if let Some(event_after_avg) = self.moving_average.add_event(next_event, &self.config.moving_average) {
            if let Some(stabilized_event) = self.pull_string.add_event(event_after_avg, &self.config.pull_string) {
                let mut dirty_rect: Option<Rect> = None;
                let config = &self.config;
                let tip_rasterizer = &self.tip_rasterizer;
                let blitter = &self.blitter;
                let scratch = &mut self.scratch_mask;

                self.trajectory.add_event(
                    stabilized_event,
                    |dab| Self::compute_diameter_impl(dab, config, current_velocity, current_distance) * config.spacing,
                    |dab| {
                        if let Some(r) = Self::paint_dab_impl(dab, config, tip_rasterizer, blitter, scratch, canvas, current_velocity, current_distance) {
                            dirty_rect = match dirty_rect {
                                None => Some(r),
                                Some(d) => Some(d.expand_to_include(Some(&r))),
                            };
                        }
                    },
                );

                dirty_rect
            } else {
                None
            }
        } else {
            None
        }
    }

    /// Paints an entire batch of coalesced pointer events received in a single frame.
    /// Returns the combined bounding dirty rectangle enclosing all stamped dabs.
    pub fn paint_coalesced_events(
        &mut self,
        events: &[StrokeEvent],
        canvas: &mut CanvasView,
    ) -> Option<Rect> {
        let mut combined_dirty: Option<Rect> = None;

        for event in events {
            if let Some(dirty) = self.paint_to(*event, canvas) {
                combined_dirty = match combined_dirty {
                    None => Some(dirty),
                    Some(curr) => Some(curr.expand_to_include(Some(&dirty))),
                };
            }
        }

        combined_dirty
    }

    /// Finishes the stroke by stamping the final segment from the last midpoint to the final event.
    /// Resets smoothing filter state and cleanly completes the trajectory without artificial snap artifacts.
    pub fn finish_stroke(&mut self, canvas: &mut CanvasView) -> Option<Rect> {
        let mut dirty_rect: Option<Rect> = None;
        let config = &self.config;
        let tip_rasterizer = &self.tip_rasterizer;
        let blitter = &self.blitter;
        let scratch = &mut self.scratch_mask;

        // If pull string stabilizer has connect_to_tip_on_release enabled, bridge remaining leash slack
        if let Some(final_event) = self.pull_string.finish_stroke(&self.config.pull_string) {
            let vel = self.current_velocity;
            let dist = self.total_distance;
            self.trajectory.add_event(
                final_event,
                |dab| Self::compute_diameter_impl(dab, config, vel, dist) * config.spacing,
                |dab| {
                    if let Some(r) = Self::paint_dab_impl(dab, config, tip_rasterizer, blitter, scratch, canvas, vel, dist) {
                        dirty_rect = match dirty_rect {
                            None => Some(r),
                            Some(d) => Some(d.expand_to_include(Some(&r))),
                        };
                    }
                },
            );
        }

        self.moving_average.reset();
        self.pull_string.reset();

        let vel = self.current_velocity;
        let dist = self.total_distance;

        // Finish remaining trajectory segment to the final smoothed event
        self.trajectory.finish_stroke(
            |dab| Self::compute_diameter_impl(dab, config, vel, dist) * config.spacing,
            |dab| {
                if let Some(r) = Self::paint_dab_impl(dab, config, tip_rasterizer, blitter, scratch, canvas, vel, dist) {
                    dirty_rect = match dirty_rect {
                        None => Some(r),
                        Some(d) => Some(d.expand_to_include(Some(&r))),
                    };
                }
            },
        );

        dirty_rect
    }

    /// Completes the current stroke and clears active trajectory state.
    pub fn end_stroke(&mut self) {
        self.moving_average.reset();
        self.pull_string.reset();
        self.trajectory.end_stroke();
        self.current_velocity = 0.0;
        self.total_distance = 0.0;
        self.prev_raw_event = None;
    }

    /// Begins a stroke on the active layer of a composite stack, immediately
    /// updating the display framebuffer's dirty region.
    pub fn begin_stroke_on_stack(
        &mut self,
        start_event: StrokeEvent,
        stack: &mut CompositeStack,
    ) -> Option<Rect> {
        let dirty = if let Some(active_layer) = stack.active_layer_mut() {
            if active_layer.locked || !active_layer.visible {
                return None;
            }
            self.begin_stroke(start_event, &mut active_layer.buffer)
        } else {
            None
        };
        if let Some(ref r) = dirty {
            stack.composite_rect(r);
        }
        dirty
    }

    /// Paints to the active layer of a composite stack, updating the display framebuffer's dirty region.
    pub fn paint_to_stack(
        &mut self,
        next_event: StrokeEvent,
        stack: &mut CompositeStack,
    ) -> Option<Rect> {
        let dirty = if let Some(active_layer) = stack.active_layer_mut() {
            if active_layer.locked || !active_layer.visible {
                return None;
            }
            self.paint_to(next_event, &mut active_layer.buffer)
        } else {
            None
        };
        if let Some(ref r) = dirty {
            stack.composite_rect(r);
        }
        dirty
    }

    /// Finishes the stroke on the active layer of a composite stack.
    pub fn finish_stroke_on_stack(&mut self, stack: &mut CompositeStack) -> Option<Rect> {
        let dirty = if let Some(active_layer) = stack.active_layer_mut() {
            if active_layer.locked || !active_layer.visible {
                return None;
            }
            self.finish_stroke(&mut active_layer.buffer)
        } else {
            None
        };
        if let Some(ref r) = dirty {
            stack.composite_rect(r);
        }
        dirty
    }

    /// Computes instantaneous dab diameter accounting for dynamics and pressure sensitivity.
    pub fn compute_diameter(&self, pressure: f32) -> f32 {
        let dummy_event = StrokeEvent::new(0.0, 0.0, pressure, 0.0);
        Self::compute_diameter_impl(&dummy_event, &self.config, self.current_velocity, self.total_distance)
    }

    #[inline]
    fn map_pressure(pressure: f32, config: &BrushConfig) -> f32 {
        if let Some(ref lut) = config.pressure_lut {
            let idx = ((pressure.clamp(0.0, 1.0) * 255.0).round() as usize).min(255);
            lut[idx]
        } else {
            pressure
        }
    }

    #[inline]
    fn compute_diameter_impl(
        event: &StrokeEvent,
        config: &BrushConfig,
        velocity_px_sec: f32,
        distance_px: f32,
    ) -> f32 {
        if config.dynamics.size.is_active() {
            let out = config.dynamics.size.evaluate(event, velocity_px_sec, distance_px, 0.0);
            (config.diameter * out).max(1.0)
        } else if config.size_by_pressure {
            let mapped = Self::map_pressure(event.pressure, config);
            config.diameter * mapped.max(0.05)
        } else {
            config.diameter
        }
    }

    /// Paints a single circular dab at the given event coordinates.
    pub fn paint_dab_at(&mut self, event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        Self::paint_dab_impl(
            event,
            &self.config,
            &self.tip_rasterizer,
            &self.blitter,
            &mut self.scratch_mask,
            canvas,
            self.current_velocity,
            self.total_distance,
        )
    }

    #[inline]
    fn paint_dab_impl(
        event: StrokeEvent,
        config: &BrushConfig,
        tip_rasterizer: &crate::brush::tip::BrushTipRasterizer,
        blitter: &CanvasBlitter,
        scratch_mask: &mut Vec<u8>,
        canvas: &mut CanvasView,
        velocity_px_sec: f32,
        distance_px: f32,
    ) -> Option<Rect> {
        let diameter = Self::compute_diameter_impl(&event, config, velocity_px_sec, distance_px);
        let radius = diameter * 0.5;
        let dest_x = (event.x - radius).floor() as i32;
        let dest_y = (event.y - radius).floor() as i32;
        let sub_x = event.x - dest_x as f32;
        let sub_y = event.y - dest_y as f32;

        let mut angle_radians = match config.tip_type {
            crate::brush::tip::BrushTipType::Auto { angle_radians, .. } => angle_radians,
            crate::brush::tip::BrushTipType::Predefined { angle_radians, .. } => angle_radians,
        };

        if config.dynamics.angle.is_active() {
            angle_radians += config.dynamics.angle.evaluate(&event, velocity_px_sec, distance_px, 0.0);
        }

        let effective_softness = if config.dynamics.softness.is_active() {
            let scale = config.dynamics.softness.evaluate(&event, velocity_px_sec, distance_px, 0.0);
            (config.softness * scale).clamp(0.0, 1.0)
        } else {
            config.softness
        };

        // 1. Generate dab mask according to tip geometry (Auto ellipse vs Predefined image)
        let (dab_w, dab_h) = match config.tip_type {
            crate::brush::tip::BrushTipType::Auto { aspect_ratio, .. } => {
                tip_rasterizer.render_auto_brush(
                    radius,
                    aspect_ratio,
                    angle_radians,
                    effective_softness,
                    sub_x,
                    sub_y,
                    config.antialias,
                    scratch_mask,
                )
            }
            crate::brush::tip::BrushTipType::Predefined { ref tip_data, scale, .. } => {
                tip_rasterizer.render_predefined_tip(
                    tip_data,
                    diameter * scale,
                    angle_radians,
                    sub_x,
                    sub_y,
                    scratch_mask,
                )
            }
        };

        // 2. Apply paper texture grain modulation in world canvas coordinates if enabled
        if let Some(ref texture_config) = config.texture {
            let dyn_strength = if config.texture_by_pressure {
                Self::map_pressure(event.pressure, config)
            } else {
                1.0
            };
            crate::brush::texture::apply_texture_to_dab(
                &mut scratch_mask[..dab_w * dab_h],
                dab_w,
                dab_h,
                dest_x,
                dest_y,
                texture_config,
                dyn_strength,
            );
        }

        let mut flow_opacity = config.flow * config.opacity;
        if config.dynamics.opacity.is_active() {
            flow_opacity *= config.dynamics.opacity.evaluate(&event, velocity_px_sec, distance_px, 0.0);
        } else if config.opacity_by_pressure {
            flow_opacity *= Self::map_pressure(event.pressure, config);
        }

        if config.dynamics.flow.is_active() {
            flow_opacity *= config.dynamics.flow.evaluate(&event, velocity_px_sec, distance_px, 0.0);
        }

        let mut final_dest_x = dest_x;
        let mut final_dest_y = dest_y;

        if config.dynamics.jitter.is_active() {
            let jitter_eval = config.dynamics.jitter.evaluate(&event, velocity_px_sec, distance_px, 0.5);
            let max_jitter = jitter_eval * radius;
            if max_jitter > 0.01 {
                let seed = ((event.x * 12.9898 + event.y * 78.233).sin() * 43758.5453).fract().abs();
                let jitter_angle = seed * std::f32::consts::TAU;
                let jitter_r = seed * max_jitter;
                final_dest_x += (jitter_angle.cos() * jitter_r).round() as i32;
                final_dest_y += (jitter_angle.sin() * jitter_r).round() as i32;
            }
        }

        let mode = if config.is_erase {
            crate::brush::ColorBlendMode::Erase
        } else {
            config.blend_mode
        };

        blitter.blit_dab(
            canvas,
            scratch_mask,
            dab_w,
            dab_h,
            final_dest_x,
            final_dest_y,
            config.color,
            flow_opacity,
            mode,
        )
    }
}
