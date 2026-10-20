use crate::brush::event::StrokeEvent;

/// Tracks distance traveled between input events and computes subpixel dab intervals.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct StrokeStepper {
    pub accum_distance: f32,
}

impl StrokeStepper {
    /// Constructs a new `StrokeStepper`.
    pub fn new() -> Self {
        Self {
            accum_distance: 0.0,
        }
    }

    /// Resets the accumulated distance for a new stroke.
    pub fn reset(&mut self) {
        self.accum_distance = 0.0;
    }

    /// Computes the parametric interpolation factor `t` in `[0.0, 1.0]` for the next dab along the segment `(p1, p2)`.
    /// Returns `None` if the cursor did not move far enough to trigger a new dab.
    pub fn get_next_step(
        &mut self,
        p1: &StrokeEvent,
        p2: &StrokeEvent,
        required_spacing: f32,
    ) -> Option<f32> {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let drag_length = (dx * dx + dy * dy).sqrt();

        if drag_length <= 0.0 {
            return None;
        }

        let distance_needed = required_spacing - self.accum_distance;

        if distance_needed <= drag_length {
            let t = (distance_needed / drag_length).max(0.0);
            self.accum_distance = 0.0;
            Some(t)
        } else {
            self.accum_distance += drag_length;
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stroke_stepper_spacing() {
        let mut stepper = StrokeStepper::new();
        let p1 = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        let p2 = StrokeEvent::new(100.0, 0.0, 1.0, 0.1);

        // Required spacing: 20 pixels
        let t1 = stepper.get_next_step(&p1, &p2, 20.0);
        assert_eq!(t1, Some(0.2));

        // Next point starting from t=0.2 (x=20)
        let dab1 = StrokeEvent::lerp(&p1, &p2, 0.2);
        let t2 = stepper.get_next_step(&dab1, &p2, 20.0);
        // Distance needed: 20 / remaining 80 = 0.25
        assert!((t2.unwrap() - 0.25).abs() < 1e-5);
    }
}
