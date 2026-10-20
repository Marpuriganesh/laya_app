use crate::brush::blitter::CanvasBlitter;
use crate::brush::canvas::CanvasView;
use crate::brush::config::BrushConfig;
use crate::brush::event::StrokeEvent;
use crate::brush::rasterizer::MaskRasterizer;
use crate::brush::rect::Rect;
use crate::brush::stepper::StrokeStepper;

/// Orchestrates stroke stepping, dab mask generation, and canvas blitting.
#[derive(Debug, Clone)]
pub struct PixelBrushEngine {
    pub config: BrushConfig,
    pub stepper: StrokeStepper,
    pub rasterizer: MaskRasterizer,
    pub blitter: CanvasBlitter,
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
        self.last_event = Some(start_event);
        self.paint_dab_at(start_event, canvas)
    }

    /// Paints from the last known stroke position to `next_event`, generating all intermediate dabs
    /// according to the brush spacing setting.
    pub fn paint_to(&mut self, next_event: StrokeEvent, canvas: &mut CanvasView) -> Option<Rect> {
        let Some(mut current_p1) = self.last_event else {
            return self.begin_stroke(next_event, canvas);
        };

        let target_p2 = next_event;
        let mut dirty_rect: Option<Rect> = None;

        loop {
            let current_diameter = self.compute_diameter(current_p1.pressure);
            let required_spacing = (current_diameter * self.config.spacing).max(1.0);

            let Some(t) = self.stepper.get_next_step(&current_p1, &target_p2, required_spacing) else {
                break;
            };

            let dab_event = StrokeEvent::lerp(&current_p1, &target_p2, t);
            let dab_rect = self.paint_dab_at(dab_event, canvas);

            dirty_rect = match (dirty_rect, dab_rect) {
                (None, r) => r,
                (Some(d), Some(r)) => Some(d.expand_to_include(Some(&r))),
                (Some(d), None) => Some(d),
            };

            current_p1 = dab_event;
        }

        self.last_event = Some(next_event);
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

    /// Completes the current stroke and clears active trajectory state.
    pub fn end_stroke(&mut self) {
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
