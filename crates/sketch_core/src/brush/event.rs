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
        let b = StrokeEvent::new(100.0, 50.0, 0.8, 3.0);

        let mid = StrokeEvent::lerp(&a, &b, 0.5);
        assert!((mid.x - 50.0).abs() < 1e-5);
        assert!((mid.y - 30.0).abs() < 1e-5);
        assert!((mid.pressure - 0.5).abs() < 1e-5);
        assert!((mid.time - 2.0).abs() < 1e-5);
    }
}
