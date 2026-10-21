use crate::brush::blitter::CanvasBlitter;
use crate::brush::canvas::CanvasView;
use crate::brush::config::BrushConfig;
use crate::brush::event::StrokeEvent;
use crate::brush::rasterizer::MaskRasterizer;
use crate::brush::rect::Rect;
use crate::brush::stepper::StrokeStepper;

/// Orchestrates stroke stepping along midpoint quadratic Bézier splines,
/// analytical dab mask generation, and canvas blitting.
#[derive(Debug, Clone)]
pub struct PixelBrushEngine {
    pub config: BrushConfig,
    pub stepper: StrokeStepper,
    pub rasterizer: MaskRasterizer,
    pub blitter: CanvasBlitter,
    pub prev_event: Option<StrokeEvent>,
    pub prev_midpoint: Option<StrokeEvent>,
    pub last_event: Option<StrokeEvent>,
    scratch_mask: Vec<u8>,
}

impl PixelBrushEngine {
    /// Constructs a new `PixelBrushEngine` with the given brush configuration.
    pub fn new(config: BrushConfig) -> Self {
        Self {
            config,
            stepper: StrokeStepper::new(),
            rasterizer: MaskRasterizer::new(),
            blitter: CanvasBlitter::new(),
            prev_event: None,
            prev_midpoint: None,
            last_event: None,
            scratch_mask: Vec::with_capacity(4096),
        }
    }

    /// Begins a new stroke at the given starting event, stamping an initial dab.
    pub fn begin_stroke(
        &mut self,
        start_event: StrokeEvent,
        canvas: &mut CanvasView,
    ) -> Option<Rect> {
        self.stepper.reset();
        self.prev_event = Some(start_event);
        self.prev_midpoint = None;
        self.last_event = Some(start_event);
        self.paint_dab_at(start_event, canvas)
    }

    /// Paints from the current stroke trajectory to `next_event` using continuous
    /// Midpoint Quadratic Bézier Spline interpolation (C¹ smooth tangent continuity).
    pub fn paint_to(&mut self, next_event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        let Some(p_prev) = self.prev_event else {
            return self.begin_stroke(next_event, canvas);
        };

        if (p_prev.x - next_event.x).abs() < 1e-4 && (p_prev.y - next_event.y).abs() < 1e-4 {
            return None;
        }

        let mut dirty_rect: Option<Rect> = None;

        match self.prev_midpoint {
            None => {
                // First movement segment after begin_stroke:
                // Start: P0 (p_prev), Target: P1 (next_event).
                // Interpolate along linear segment from P0 to midpoint M0 = (P0 + P1) / 2.
                let m0 = StrokeEvent::midpoint(&p_prev, &next_event);
                let seg_len = StrokeStepper::linear_length(&p_prev, &m0);

                let mut current_t = 0.0;
                let mut current_dab = p_prev;

                while current_t < 1.0 {
                    let current_diameter = self.compute_diameter(current_dab.pressure);
                    let required_spacing = (current_diameter * self.config.spacing).max(1.0);

                    if let Some(next_t) = self.stepper.get_next_linear_step(seg_len, current_t, required_spacing) {
                        current_t = next_t;
                        current_dab = StrokeEvent::lerp(&p_prev, &m0, current_t);
                        if let Some(r) = self.paint_dab_at(current_dab, canvas) {
                            dirty_rect = match dirty_rect {
                                None => Some(r),
                                Some(d) => Some(d.expand_to_include(Some(&r))),
                            };
                        }
                    } else {
                        break;
                    }
                }

                self.prev_midpoint = Some(m0);
                self.prev_event = Some(next_event);
                self.last_event = Some(next_event);
            }
            Some(m_prev) => {
                // Subsequent movement segments:
                // Start midpoint: M0 (m_prev)
                // Control point: P1 (p_prev)
                // End midpoint: M1 = midpoint(P1, P2) (m_next)
                // Curve: B(t) = (1-t)^2 * M0 + 2*(1-t)*t * P1 + t^2 * M1
                let m_next = StrokeEvent::midpoint(&p_prev, &next_event);
                let curve_len = StrokeStepper::quad_bezier_length(&m_prev, &p_prev, &m_next);

                let mut current_t = 0.0;
                let mut current_dab = m_prev;

                while current_t < 1.0 {
                    let current_diameter = self.compute_diameter(current_dab.pressure);
                    let required_spacing = (current_diameter * self.config.spacing).max(1.0);

                    if let Some(next_t) = self.stepper.get_next_quad_step(curve_len, current_t, required_spacing) {
                        current_t = next_t;
                        current_dab = StrokeEvent::quad_bezier(&m_prev, &p_prev, &m_next, current_t);
                        if let Some(r) = self.paint_dab_at(current_dab, canvas) {
                            dirty_rect = match dirty_rect {
                                None => Some(r),
                                Some(d) => Some(d.expand_to_include(Some(&r))),
                            };
                        }
                    } else {
                        break;
                    }
                }

                self.prev_midpoint = Some(m_next);
                self.prev_event = Some(next_event);
                self.last_event = Some(next_event);
            }
        }

        dirty_rect
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
    pub fn finish_stroke(&mut self, canvas: &mut CanvasView) -> Option<Rect> {
        let mut dirty_rect = None;

        if let (Some(m_prev), Some(p_last)) = (self.prev_midpoint, self.prev_event) {
            let seg_len = StrokeStepper::linear_length(&m_prev, &p_last);
            let mut current_t = 0.0;
            let mut current_dab = m_prev;

            while current_t < 1.0 {
                let current_diameter = self.compute_diameter(current_dab.pressure);
                let required_spacing = (current_diameter * self.config.spacing).max(1.0);

                if let Some(next_t) = self.stepper.get_next_linear_step(seg_len, current_t, required_spacing) {
                    current_t = next_t;
                    current_dab = StrokeEvent::lerp(&m_prev, &p_last, current_t);
                    if let Some(r) = self.paint_dab_at(current_dab, canvas) {
                        dirty_rect = match dirty_rect {
                            None => Some(r),
                            Some(d) => Some(d.expand_to_include(Some(&r))),
                        };
                    }
                } else {
                    break;
                }
            }
        }

        self.end_stroke();
        dirty_rect
    }

    /// Completes the current stroke and clears active trajectory state.
    pub fn end_stroke(&mut self) {
        self.prev_event = None;
        self.prev_midpoint = None;
        self.last_event = None;
        self.stepper.reset();
    }

    /// Computes instantaneous dab diameter accounting for pressure sensitivity.
    pub fn compute_diameter(&self, pressure: f32) -> f32 {
        if self.config.size_by_pressure {
            self.config.diameter * pressure.max(0.05)
        } else {
            self.config.diameter
        }
    }

    /// Paints a single circular dab at the given event coordinates.
    pub fn paint_dab_at(&mut self, event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        let radius = self.compute_diameter(event.pressure) * 0.5;
        let dest_x = (event.x - radius).floor() as i32;
        let dest_y = (event.y - radius).floor() as i32;
        let sub_x = event.x - dest_x as f32;
        let sub_y = event.y - dest_y as f32;

        let (dab_w, dab_h) = self.rasterizer.render_circle_dab_into(
            radius,
            self.config.softness,
            sub_x,
            sub_y,
            &mut self.scratch_mask,
        );

        let mut flow_opacity = self.config.flow * self.config.opacity;
        if self.config.opacity_by_pressure {
            flow_opacity *= event.pressure;
        }

        self.blitter.blit_dab(
            canvas,
            &self.scratch_mask,
            dab_w,
            dab_h,
            dest_x,
            dest_y,
            self.config.color,
            flow_opacity,
            self.config.is_erase,
        )
    }
}
