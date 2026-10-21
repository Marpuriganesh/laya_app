/// Represents a continuous stylus or mouse input event.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokeEvent {
    /// Screen or canvas X coordinate.
    pub x: f32,
    /// Screen or canvas Y coordinate.
    pub y: f32,
    /// Hardware or normalized pressure from 0.0 to 1.0.
    pub pressure: f32,
    /// Timestamp in seconds.
    pub time: f32,
}

impl StrokeEvent {
    /// Creates a new `StrokeEvent`.
    pub fn new(x: f32, y: f32, pressure: f32, time: f32) -> Self {
        Self {
            x,
            y,
            pressure,
            time,
        }
    }

    /// Linearly interpolate all properties between event A and event B by factor `t`.
    pub fn lerp(a: &StrokeEvent, b: &StrokeEvent, t: f32) -> Self {
        Self {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y),
            pressure: a.pressure + t * (b.pressure - a.pressure),
            time: a.time + t * (b.time - a.time),
        }
    }

    /// Computes the exact midpoint between two events.
    pub fn midpoint(a: &StrokeEvent, b: &StrokeEvent) -> Self {
        Self {
            x: 0.5 * (a.x + b.x),
            y: 0.5 * (a.y + b.y),
            pressure: 0.5 * (a.pressure + b.pressure),
            time: 0.5 * (a.time + b.time),
        }
    }

    /// Evaluates a point along a quadratic Bézier curve defined by start midpoint `m0`,
    /// control point `p1`, and end midpoint `m1` for parametric factor `t` in `[0.0, 1.0]`.
    /// Formula: B(t) = (1-t)^2 * m0 + 2*(1-t)*t * p1 + t^2 * m1
    pub fn quad_bezier(m0: &StrokeEvent, p1: &StrokeEvent, m1: &StrokeEvent, t: f32) -> Self {
        let u = 1.0 - t;
        let w0 = u * u;
        let w1 = 2.0 * u * t;
        let w2 = t * t;

        Self {
            x: w0 * m0.x + w1 * p1.x + w2 * m1.x,
            y: w0 * m0.y + w1 * p1.y + w2 * m1.y,
            pressure: w0 * m0.pressure + w1 * p1.pressure + w2 * m1.pressure,
            time: w0 * m0.time + w1 * p1.time + w2 * m1.time,
        }
    }
}

impl Default for StrokeEvent {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            time: 0.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stroke_event_lerp() {
        let a = StrokeEvent::new(0.0, 10.0, 0.2, 1.0);
        let b = StrokeEvent::new(100.0, 50.0, 0.8, 2.0);
        let mid = StrokeEvent::lerp(&a, &b, 0.5);

        assert_eq!(mid.x, 50.0);
        assert_eq!(mid.y, 30.0);
        assert_eq!(mid.pressure, 0.5);
        assert_eq!(mid.time, 1.5);
    }

    #[test]
    fn test_stroke_event_midpoint() {
        let a = StrokeEvent::new(10.0, 20.0, 0.4, 0.0);
        let b = StrokeEvent::new(30.0, 60.0, 0.8, 1.0);
        let mid = StrokeEvent::midpoint(&a, &b);

        assert_eq!(mid.x, 20.0);
        assert_eq!(mid.y, 40.0);
        assert_eq!(mid.pressure, 0.6);
    }

    #[test]
    fn test_stroke_event_quad_bezier_endpoints_and_midpoint() {
        let m0 = StrokeEvent::new(0.0, 0.0, 0.2, 0.0);
        let p1 = StrokeEvent::new(50.0, 100.0, 0.5, 0.5);
        let m1 = StrokeEvent::new(100.0, 0.0, 0.8, 1.0);

        // At t = 0: must equal m0
        let start = StrokeEvent::quad_bezier(&m0, &p1, &m1, 0.0);
        assert!((start.x - m0.x).abs() < 1e-5);
        assert!((start.y - m0.y).abs() < 1e-5);

        // At t = 1: must equal m1
        let end = StrokeEvent::quad_bezier(&m0, &p1, &m1, 1.0);
        assert!((end.x - m1.x).abs() < 1e-5);
        assert!((end.y - m1.y).abs() < 1e-5);

        // At t = 0.5: B(0.5) = 0.25*m0 + 0.5*p1 + 0.25*m1 = 0 + 25 + 25 = 50 for x, 0 + 50 + 0 = 50 for y
        let mid = StrokeEvent::quad_bezier(&m0, &p1, &m1, 0.5);
        assert!((mid.x - 50.0).abs() < 1e-5);
        assert!((mid.y - 50.0).abs() < 1e-5);
        assert!((mid.pressure - 0.5).abs() < 1e-5);
    }
}
