use crate::stroke::event::StrokeEvent;

/// Tracks distance traveled along linear segments and quadratic Bézier splines,
/// computing exact subpixel dab placement intervals with sub-millimeter distance preservation.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct StrokeStepper {
    /// Accumulated distance (in pixels) carried over from previous segments.
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

    /// Calculates Euclidean distance between two stroke events.
    pub fn linear_length(p1: &StrokeEvent, p2: &StrokeEvent) -> f32 {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        (dx * dx + dy * dy).sqrt()
    }

    /// Computes Gravesen's arc length approximation for a quadratic Bézier curve
    /// defined by start midpoint `m0`, control point `p1`, and end midpoint `m1`.
    /// Formula: L ≈ (2 * ||m1 - m0|| + ||p1 - m0|| + ||m1 - p1||) / 3.0
    pub fn quad_bezier_length(m0: &StrokeEvent, p1: &StrokeEvent, m1: &StrokeEvent) -> f32 {
        let chord_dx = m1.x - m0.x;
        let chord_dy = m1.y - m0.y;
        let d_chord = (chord_dx * chord_dx + chord_dy * chord_dy).sqrt();

        let leg1_dx = p1.x - m0.x;
        let leg1_dy = p1.y - m0.y;
        let d_leg1 = (leg1_dx * leg1_dx + leg1_dy * leg1_dy).sqrt();

        let leg2_dx = m1.x - p1.x;
        let leg2_dy = m1.y - p1.y;
        let d_leg2 = (leg2_dx * leg2_dx + leg2_dy * leg2_dy).sqrt();

        (2.0 * d_chord + d_leg1 + d_leg2) / 3.0
    }

    /// Computes the next parametric factor `t` in `(current_t, 1.0]` along a quadratic Bézier curve.
    /// Returns `Some(t)` if a dab should be placed at parameter `t`, or `None` if the remaining curve length
    /// is insufficient to satisfy `required_spacing` (in which case the unused distance is accumulated).
    pub fn get_next_quad_step(
        &mut self,
        curve_length: f32,
        current_t: f32,
        required_spacing: f32,
    ) -> Option<f32> {
        if curve_length <= 0.0001 || current_t >= 1.0 {
            return None;
        }

        let remaining_length = (1.0 - current_t) * curve_length;
        let distance_needed = required_spacing - self.accum_distance;

        if distance_needed <= remaining_length {
            let delta_t = (distance_needed / curve_length).min(1.0 - current_t);
            let next_t = current_t + delta_t;
            self.accum_distance = 0.0;
            Some(next_t)
        } else {
            self.accum_distance += remaining_length;
            None
        }
    }

    /// Computes the next parametric factor `t` in `(current_t, 1.0]` along a linear segment.
    pub fn get_next_linear_step(
        &mut self,
        segment_length: f32,
        current_t: f32,
        required_spacing: f32,
    ) -> Option<f32> {
        if segment_length <= 0.0001 || current_t >= 1.0 {
            return None;
        }

        let remaining_length = (1.0 - current_t) * segment_length;
        let distance_needed = required_spacing - self.accum_distance;

        if distance_needed <= remaining_length {
            let delta_t = (distance_needed / segment_length).min(1.0 - current_t);
            let next_t = current_t + delta_t;
            self.accum_distance = 0.0;
            Some(next_t)
        } else {
            self.accum_distance += remaining_length;
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
        // A linear segment of length 10.0, spacing required is 4.0
        let seg_len = 10.0;
        let t1 = stepper.get_next_linear_step(seg_len, 0.0, 4.0);
        assert_eq!(t1, Some(0.4));

        let t2 = stepper.get_next_linear_step(seg_len, 0.4, 4.0);
        assert_eq!(t2, Some(0.8));

        // Remaining distance on segment from t=0.8 to 1.0 is 2.0 (insufficient for 4.0)
        let t3 = stepper.get_next_linear_step(seg_len, 0.8, 4.0);
        assert_eq!(t3, None);
        assert!((stepper.accum_distance - 2.0).abs() < 1e-4);

        // Next segment of length 5.0, requires 4.0 (2.0 already accumulated, so only 2.0 needed)
        let t4 = stepper.get_next_linear_step(5.0, 0.0, 4.0);
        assert_eq!(t4, Some(0.4)); // 2.0 / 5.0 = 0.4
        assert_eq!(stepper.accum_distance, 0.0);
    }

    #[test]
    fn test_stroke_stepper_quadratic_curve_length() {
        let m0 = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        let p1 = StrokeEvent::new(50.0, 50.0, 1.0, 0.0);
        let m1 = StrokeEvent::new(100.0, 0.0, 1.0, 0.0);

        let len = StrokeStepper::quad_bezier_length(&m0, &p1, &m1);
        // Chord = 100, legs = 2 * sqrt(50^2 + 50^2) ≈ 2 * 70.71 = 141.42
        // Gravesen: (200 + 141.42) / 3 ≈ 113.8
        assert!(len > 100.0);
        assert!(len < 142.0);
        assert!((len - 113.8).abs() < 1.0);
    }

    #[test]
    fn test_stroke_stepper_quadratic_step_accumulation() {
        let mut stepper = StrokeStepper::new();
        let curve_len = 100.0;
        let spacing = 30.0;

        let t1 = stepper.get_next_quad_step(curve_len, 0.0, spacing);
        assert_eq!(t1, Some(0.3));

        let t2 = stepper.get_next_quad_step(curve_len, 0.3, spacing);
        assert_eq!(t2, Some(0.6));

        let t3 = stepper.get_next_quad_step(curve_len, 0.6, spacing);
        assert!((t3.unwrap() - 0.9).abs() < 1e-5);

        let t4 = stepper.get_next_quad_step(curve_len, 0.9, spacing);
        assert_eq!(t4, None);
        assert!((stepper.accum_distance - 10.0).abs() < 1e-4);
    }
}
