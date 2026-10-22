use crate::stroke::event::StrokeEvent;
use crate::stroke::stepper::StrokeStepper;

/// Coordinates smooth Midpoint Quadratic Bézier Spline trajectory generation.
/// Decouples curve interpolation, subpixel arc-length stepping, and distance preservation
/// from specific brush payload stamping (pixel brushes, smudge/wet mixers, vector lines).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct StrokeTrajectory {
    pub stepper: StrokeStepper,
    pub prev_event: Option<StrokeEvent>,
    pub prev_midpoint: Option<StrokeEvent>,
    pub last_event: Option<StrokeEvent>,
}

impl StrokeTrajectory {
    /// Constructs a new `StrokeTrajectory`.
    pub fn new() -> Self {
        Self {
            stepper: StrokeStepper::new(),
            prev_event: None,
            prev_midpoint: None,
            last_event: None,
        }
    }

    /// Resets all internal state and clears accumulated step distance.
    pub fn reset(&mut self) {
        self.stepper.reset();
        self.prev_event = None;
        self.prev_midpoint = None;
        self.last_event = None;
    }

    /// Begins a new stroke at `start_event` and yields the initial dab event.
    pub fn begin_stroke<F>(&mut self, start_event: StrokeEvent, mut yield_dab: F)
    where
        F: FnMut(StrokeEvent),
    {
        self.reset();
        self.prev_event = Some(start_event);
        self.last_event = Some(start_event);
        yield_dab(start_event);
    }

    /// Steps the trajectory to `next_event` along continuous Midpoint Quadratic Bézier Splines.
    ///
    /// For each dab step:
    /// - Evaluates `spacing_fn(&current_dab)` to query required dab spacing in pixels.
    /// - Emits `yield_dab(current_dab)` for each step placed along the curve.
    pub fn add_event<S, F>(
        &mut self,
        next_event: StrokeEvent,
        mut spacing_fn: S,
        mut yield_dab: F,
    ) where
        S: FnMut(&StrokeEvent) -> f32,
        F: FnMut(StrokeEvent),
    {
        let Some(p_prev) = self.prev_event else {
            self.begin_stroke(next_event, yield_dab);
            return;
        };

        if (p_prev.x - next_event.x).abs() < 1e-4 && (p_prev.y - next_event.y).abs() < 1e-4 {
            return;
        }

        match self.prev_midpoint {
            None => {
                // First movement segment after begin_stroke:
                // Start: P0 (p_prev), Target: P1 (next_event).
                // Step along linear lead-in from P0 to midpoint M0 = (P0 + P1) / 2.
                let m0 = StrokeEvent::midpoint(&p_prev, &next_event);
                let seg_len = StrokeStepper::linear_length(&p_prev, &m0);

                let mut current_t = 0.0;
                let mut current_dab = p_prev;

                while current_t < 1.0 {
                    let required_spacing = spacing_fn(&current_dab).max(1.0);
                    if let Some(next_t) = self.stepper.get_next_linear_step(seg_len, current_t, required_spacing) {
                        current_t = next_t;
                        current_dab = StrokeEvent::lerp(&p_prev, &m0, current_t);
                        yield_dab(current_dab);
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
                    let required_spacing = spacing_fn(&current_dab).max(1.0);
                    if let Some(next_t) = self.stepper.get_next_quad_step(curve_len, current_t, required_spacing) {
                        current_t = next_t;
                        current_dab = StrokeEvent::quad_bezier(&m_prev, &p_prev, &m_next, current_t);
                        yield_dab(current_dab);
                    } else {
                        break;
                    }
                }

                self.prev_midpoint = Some(m_next);
                self.prev_event = Some(next_event);
                self.last_event = Some(next_event);
            }
        }
    }

    /// Finishes the stroke by stepping from the last midpoint to the final event.
    /// Always ensures the final dab at the exact brush tip (release position) is stamped.
    pub fn finish_stroke<S, F>(&mut self, mut spacing_fn: S, mut yield_dab: F)
    where
        S: FnMut(&StrokeEvent) -> f32,
        F: FnMut(StrokeEvent),
    {
        let mut last_dab_pos: Option<(f32, f32)> = None;

        if let (Some(m_prev), Some(p_last)) = (self.prev_midpoint, self.prev_event) {
            let seg_len = StrokeStepper::linear_length(&m_prev, &p_last);
            let mut current_t = 0.0;
            let mut current_dab = m_prev;

            while current_t < 1.0 {
                let required_spacing = spacing_fn(&current_dab).max(1.0);
                if let Some(next_t) = self.stepper.get_next_linear_step(seg_len, current_t, required_spacing) {
                    current_t = next_t;
                    current_dab = StrokeEvent::lerp(&m_prev, &p_last, current_t);
                    yield_dab(current_dab);
                    last_dab_pos = Some((current_dab.x, current_dab.y));
                } else {
                    break;
                }
            }

            // Always ensure the final dab at the exact brush tip (p_last) is stamped on release
            let should_stamp_tip = match last_dab_pos {
                Some((lx, ly)) => {
                    let dx = p_last.x - lx;
                    let dy = p_last.y - ly;
                    dx * dx + dy * dy > 0.01
                }
                None => true,
            };

            if should_stamp_tip {
                yield_dab(p_last);
            }
        } else if let Some(p_last) = self.prev_event {
            yield_dab(p_last);
        }

        self.end_stroke();
    }

    /// Completes the stroke and clears trajectory state.
    pub fn end_stroke(&mut self) {
        self.prev_event = None;
        self.prev_midpoint = None;
        self.last_event = None;
        self.stepper.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trajectory_lifecycle() {
        let mut traj = StrokeTrajectory::new();
        let mut dabs = Vec::new();

        // 1. Begin stroke
        let p0 = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        traj.begin_stroke(p0, |d| dabs.push(d));
        assert_eq!(dabs.len(), 1);
        assert_eq!(dabs[0].x, 0.0);

        // 2. Add next event at (100, 0) with fixed 20px spacing
        let p1 = StrokeEvent::new(100.0, 0.0, 1.0, 0.1);
        traj.add_event(p1, |_| 20.0, |d| dabs.push(d));
        // First segment interpolates from (0,0) to midpoint (50,0) -> 50px len / 20px spacing = 2 dabs at 20px and 40px
        assert_eq!(dabs.len(), 3);
        assert!((dabs[1].x - 20.0).abs() < 1e-3);
        assert!((dabs[2].x - 40.0).abs() < 1e-3);

        // 3. Add corner event at (100, 100)
        let p2 = StrokeEvent::new(100.0, 100.0, 1.0, 0.2);
        traj.add_event(p2, |_| 20.0, |d| dabs.push(d));
        assert!(dabs.len() > 3);

        // 4. Finish stroke
        traj.finish_stroke(|_| 20.0, |d| dabs.push(d));
        assert!(traj.prev_event.is_none());
        assert_eq!(traj.stepper.accum_distance, 0.0);
        // Verify the final release dab at the brush tip (100, 100) is guaranteed to be stamped
        let last_dab = dabs.last().unwrap();
        assert!((last_dab.x - 100.0).abs() < 1e-3);
        assert!((last_dab.y - 100.0).abs() < 1e-3);
    }
}
