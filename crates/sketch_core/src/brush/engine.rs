use crate::brush::blitter::CanvasBlitter;
use crate::brush::canvas::CanvasView;
use crate::brush::config::BrushConfig;
use crate::brush::rasterizer::MaskRasterizer;
use crate::brush::rect::Rect;
use crate::stroke::event::StrokeEvent;
use crate::stroke::pull_string::PullStringStabilizer;
use crate::stroke::trajectory::StrokeTrajectory;

/// Orchestrates stroke stepping along midpoint quadratic Bézier splines,
/// analytical dab mask generation, and canvas blitting.
#[derive(Debug, Clone)]
pub struct PixelBrushEngine {
    pub config: BrushConfig,
    pub trajectory: StrokeTrajectory,
    pub pull_string: PullStringStabilizer,
    pub rasterizer: MaskRasterizer,
    pub blitter: CanvasBlitter,
    scratch_mask: Vec<u8>,
}

impl PixelBrushEngine {
    /// Constructs a new `PixelBrushEngine` with the given brush configuration.
    pub fn new(config: BrushConfig) -> Self {
        Self {
            config,
            trajectory: StrokeTrajectory::new(),
            pull_string: PullStringStabilizer::new(),
            rasterizer: MaskRasterizer::new(),
            blitter: CanvasBlitter::new(),
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
        let rasterizer = &self.rasterizer;
        let blitter = &self.blitter;
        let scratch = &mut self.scratch_mask;

        let seed_event = self.pull_string.begin_stroke(start_event, &self.config.pull_string);

        self.trajectory.begin_stroke(seed_event, |dab| {
            dirty = Self::paint_dab_impl(dab, config, rasterizer, blitter, scratch, canvas);
        });

        dirty
    }

    /// Paints from the current stroke trajectory to `next_event` using continuous
    /// Midpoint Quadratic Bézier Spline interpolation (C¹ smooth tangent continuity).
    pub fn paint_to(&mut self, next_event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        if let Some(stabilized_event) = self.pull_string.add_event(next_event, &self.config.pull_string) {
            let mut dirty_rect: Option<Rect> = None;
            let config = &self.config;
            let rasterizer = &self.rasterizer;
            let blitter = &self.blitter;
            let scratch = &mut self.scratch_mask;

            self.trajectory.add_event(
                stabilized_event,
                |dab| Self::compute_diameter_impl(dab.pressure, config) * config.spacing,
                |dab| {
                    if let Some(r) = Self::paint_dab_impl(dab, config, rasterizer, blitter, scratch, canvas) {
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
    /// If pull string smoothing is enabled and tip connection is active, advances the brush tip
    /// to the exact stylus release position before sealing the trajectory.
    pub fn finish_stroke(&mut self, canvas: &mut CanvasView) -> Option<Rect> {
        let mut dirty_rect: Option<Rect> = None;
        let config = &self.config;
        let rasterizer = &self.rasterizer;
        let blitter = &self.blitter;
        let scratch = &mut self.scratch_mask;

        // 1. If pull string has remaining slack, advance stroke to the final stylus position
        if let Some(final_event) = self.pull_string.finish_stroke(&self.config.pull_string) {
            self.trajectory.add_event(
                final_event,
                |dab| Self::compute_diameter_impl(dab.pressure, config) * config.spacing,
                |dab| {
                    if let Some(r) = Self::paint_dab_impl(dab, config, rasterizer, blitter, scratch, canvas) {
                        dirty_rect = match dirty_rect {
                            None => Some(r),
                            Some(d) => Some(d.expand_to_include(Some(&r))),
                        };
                    }
                },
            );
        }

        // 2. Finish remaining trajectory segment to the final event
        self.trajectory.finish_stroke(
            |dab| Self::compute_diameter_impl(dab.pressure, config) * config.spacing,
            |dab| {
                if let Some(r) = Self::paint_dab_impl(dab, config, rasterizer, blitter, scratch, canvas) {
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
        self.pull_string.reset();
        self.trajectory.end_stroke();
    }

    /// Computes instantaneous dab diameter accounting for pressure sensitivity.
    pub fn compute_diameter(&self, pressure: f32) -> f32 {
        Self::compute_diameter_impl(pressure, &self.config)
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
    fn compute_diameter_impl(pressure: f32, config: &BrushConfig) -> f32 {
        if config.size_by_pressure {
            let mapped = Self::map_pressure(pressure, config);
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
            &self.rasterizer,
            &self.blitter,
            &mut self.scratch_mask,
            canvas,
        )
    }

    #[inline]
    fn paint_dab_impl(
        event: StrokeEvent,
        config: &BrushConfig,
        rasterizer: &MaskRasterizer,
        blitter: &CanvasBlitter,
        scratch_mask: &mut Vec<u8>,
        canvas: &mut CanvasView,
    ) -> Option<Rect> {
        let radius = Self::compute_diameter_impl(event.pressure, config) * 0.5;
        let dest_x = (event.x - radius).floor() as i32;
        let dest_y = (event.y - radius).floor() as i32;
        let sub_x = event.x - dest_x as f32;
        let sub_y = event.y - dest_y as f32;

        let (dab_w, dab_h) = rasterizer.render_circle_dab_into(
            radius,
            config.softness,
            sub_x,
            sub_y,
            config.antialias,
            scratch_mask,
        );

        let mut flow_opacity = config.flow * config.opacity;
        if config.opacity_by_pressure {
            flow_opacity *= Self::map_pressure(event.pressure, config);
        }

        blitter.blit_dab(
            canvas,
            scratch_mask,
            dab_w,
            dab_h,
            dest_x,
            dest_y,
            config.color,
            flow_opacity,
            config.is_erase,
        )
    }
}
