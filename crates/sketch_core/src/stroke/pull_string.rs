use crate::stroke::event::StrokeEvent;

/// Configuration parameters for the dynamic pulled string (leash) stroke stabilizer.
///
/// Implements a velocity-driven elastic leash:
/// - Fast movements expand the string up to `max_string_length`, granting heavy stabilization on broad sweeps.
/// - Slowing down or stopping smoothly contracts the string to zero at `catch_up_speed`,
///   allowing tight, sharp corners and natural zero-lag precision.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PullStringConfig {
    /// Whether dynamic pull string smoothing is enabled.
    pub enabled: bool,
    /// Maximum leash length in canvas pixels [10.0..250.0] (default: 60.0).
    pub max_string_length: f32,
    /// Velocity dynamic scaling multiplier [0.0..10.0] (default: 3.0).
    /// Target leash length = min(max_string_length, velocity * velocity_multiplier).
    pub velocity_multiplier: f32,
    /// Leash catch-up responsiveness rate [0.05..1.0] (default: 0.20).
    /// Dictates how rapidly the leash contracts to zero when slowing down or stopping.
    pub catch_up_speed: f32,
    /// Base deadzone radius in pixels (default: 0.0).
    pub base_deadzone: f32,
    /// Whether the stroke automatically completes the remaining leash segment to the
    /// exact stylus lift position on stroke release, guaranteeing zero gaps.
    pub connect_to_tip_on_release: bool,
    /// Pressure response smoothing factor [0.0..1.0] (default: 0.35).
    /// 0.0 = raw 1:1 stylus pressure; higher values filter out jitter and pressure steps.
    pub pressure_smoothing: f32,
}

impl Default for PullStringConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_string_length: 60.0,
            velocity_multiplier: 3.0,
            catch_up_speed: 0.20,
            base_deadzone: 0.0,
            connect_to_tip_on_release: true,
            pressure_smoothing: 0.35,
        }
    }
}

/// Standalone, engine-agnostic Dynamic Pulled String stroke stabilizer.
///
/// Decoupled from any specific brush rasterizer or pixel engine, operating purely
/// on continuous streams of `StrokeEvent`.
///
/// Simulation Pipeline:
/// 1. Instantaneous Cursor Velocity:
///    v = ||cursor - prev_cursor|| / dt (normalized to nominal 60Hz frame delta)
/// 2. Target Leash Length:
///    L_target = clamp(v * velocity_multiplier, base_deadzone, max_string_length)
/// 3. Elastic Catch-Up Interpolation:
///    L_current += (L_target - L_current) * catch_up_speed
/// 4. Dynamic Pulled String Calculation:
///    If ||cursor - smoothed_tip|| > L_current:
///      pull_factor = (dist - L_current) / dist
///      smoothed_tip += (cursor - smoothed_tip) * pull_factor
/// 5. On finish_stroke: smoothed_tip connects to final cursor lift position.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PullStringStabilizer {
    /// Current virtual brush tip position (smoothedTip).
    pub smoothed_tip: Option<(f32, f32)>,
    /// Previous raw stylus position (prevCursor).
    pub prev_cursor: Option<(f32, f32)>,
    /// Current dynamic string length that interpolates towards target string length.
    pub current_string_length: f32,
    /// Previous event timestamp in seconds.
    pub last_time: f32,
    /// Last received / smoothed pressure.
    pub last_pressure: f32,
    /// Smoothed pressure accumulator.
    pub smoothed_pressure: f32,
    /// Whether a stroke is currently active.
    pub is_active: bool,
}

impl PullStringStabilizer {
    /// Constructs a new, idle `PullStringStabilizer`.
    pub fn new() -> Self {
        Self {
            smoothed_tip: None,
            prev_cursor: None,
            current_string_length: 0.0,
            last_time: 0.0,
            last_pressure: 1.0,
            smoothed_pressure: 1.0,
            is_active: false,
        }
    }

    /// Resets all internal stabilizer tracking for a clean new stroke.
    pub fn reset(&mut self) {
        self.smoothed_tip = None;
        self.prev_cursor = None;
        self.current_string_length = 0.0;
        self.last_time = 0.0;
        self.last_pressure = 1.0;
        self.smoothed_pressure = 1.0;
        self.is_active = false;
    }

    /// Begins a new stroke at `start_event`.
    /// Immediately anchors the virtual brush tip to the initial stylus touch.
    pub fn begin_stroke(&mut self, start_event: StrokeEvent, _config: &PullStringConfig) -> StrokeEvent {
        let pos = (start_event.x, start_event.y);
        self.smoothed_tip = Some(pos);
        self.prev_cursor = Some(pos);
        self.current_string_length = 0.0;
        self.last_time = start_event.time;
        self.last_pressure = start_event.pressure;
        self.smoothed_pressure = start_event.pressure;
        self.is_active = true;

        start_event
    }

    /// Processes an incoming raw `StrokeEvent`.
    ///
    /// - Dynamically scales string length with instantaneous cursor velocity.
    /// - Smoothly contracts string length when slowing down, guiding the tip into corners.
    /// - When distance exceeds the dynamic leash length: pulls the brush tip and returns `Some(stabilized_event)`.
    pub fn add_event(&mut self, event: StrokeEvent, config: &PullStringConfig) -> Option<StrokeEvent> {
        if !self.is_active {
            return Some(self.begin_stroke(event, config));
        }

        let current_cursor = (event.x, event.y);
        let prev = self.prev_cursor.unwrap_or(current_cursor);
        let dt = event.time - self.last_time;
        let effective_dt = if dt > 0.002 && dt < 0.5 { dt } else { 0.00833 };

        // 1. Calculate Cursor Velocity & Target String Length
        let vx = current_cursor.0 - prev.0;
        let vy = current_cursor.1 - prev.1;
        let dist = (vx * vx + vy * vy).sqrt();
        let frame_scale = 0.01667 / effective_dt;
        let velocity = dist * frame_scale;

        self.prev_cursor = Some(current_cursor);
        self.last_time = event.time;

        // Smooth pressure response (independent of whether spatial string leash is enabled)
        let smoothed_p = if config.pressure_smoothing > 0.001 {
            let p_rate = ((1.0 - config.pressure_smoothing.clamp(0.0, 0.98)) * (effective_dt / 0.01667)).clamp(0.02, 1.0);
            self.smoothed_pressure += (event.pressure - self.smoothed_pressure) * p_rate;
            self.smoothed_pressure
        } else {
            self.smoothed_pressure = event.pressure;
            event.pressure
        };
        self.last_pressure = smoothed_p;

        if !config.enabled || config.max_string_length <= 0.0 {
            self.smoothed_tip = Some(current_cursor);
            self.current_string_length = 0.0;
            return Some(StrokeEvent::new(current_cursor.0, current_cursor.1, smoothed_p, event.time));
        }

        let target_string_length = (velocity * config.velocity_multiplier)
            .clamp(config.base_deadzone, config.max_string_length);

        // 2. Smoothly Interpolate String Length (Catch-Up Mechanics)
        let rate = (config.catch_up_speed * (effective_dt / 0.01667)).clamp(0.05, 0.95);
        self.current_string_length += (target_string_length - self.current_string_length) * rate;

        // 3. Dynamic Pulled String Calculation
        let (tip_x, tip_y) = self.smoothed_tip.unwrap_or(current_cursor);
        let dx = current_cursor.0 - tip_x;
        let dy = current_cursor.1 - tip_y;
        let dist_to_cursor = (dx * dx + dy * dy).sqrt();

        if dist_to_cursor > self.current_string_length && dist_to_cursor > 0.0001 {
            let pull_factor = (dist_to_cursor - self.current_string_length) / dist_to_cursor;
            let new_tip_x = tip_x + dx * pull_factor;
            let new_tip_y = tip_y + dy * pull_factor;

            self.smoothed_tip = Some((new_tip_x, new_tip_y));

            Some(StrokeEvent::new(new_tip_x, new_tip_y, smoothed_p, event.time))
        } else {
            None
        }
    }

    /// Finishes the stroke.
    /// If `connect_to_tip_on_release` is true and there is remaining string slack,
    /// emits a final event at the exact stylus position to guarantee full connection.
    pub fn finish_stroke(&mut self, config: &PullStringConfig) -> Option<StrokeEvent> {
        if !self.is_active {
            return None;
        }

        let mut final_event: Option<StrokeEvent> = None;

        if config.connect_to_tip_on_release {
            if let (Some((tx, ty)), Some((cx, cy))) = (self.smoothed_tip, self.prev_cursor) {
                let dx = cx - tx;
                let dy = cy - ty;
                if dx * dx + dy * dy > 0.01 {
                    final_event = Some(StrokeEvent::new(cx, cy, self.last_pressure, self.last_time));
                    self.smoothed_tip = Some((cx, cy));
                }
            }
        }

        self.current_string_length = 0.0;
        self.is_active = false;
        final_event
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_begin_stroke_anchors_tip() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig::default();

        let p0 = StrokeEvent::new(100.0, 200.0, 0.8, 0.0);
        let start = stabilizer.begin_stroke(p0, &config);

        assert_eq!(start.x, 100.0);
        assert_eq!(start.y, 200.0);
        assert_eq!(stabilizer.smoothed_tip, Some((100.0, 200.0)));
        assert!(stabilizer.is_active);
    }

    #[test]
    fn test_dynamic_string_contracts_when_slowing_down() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig {
            enabled: true,
            max_string_length: 50.0,
            velocity_multiplier: 2.0,
            catch_up_speed: 0.5,
            ..Default::default()
        };

        let p0 = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        stabilizer.begin_stroke(p0, &config);

        // Fast move: 100px in 16.6ms -> high velocity, string expands
        let p1 = StrokeEvent::new(100.0, 0.0, 1.0, 0.01667);
        let out1 = stabilizer.add_event(p1, &config);
        assert!(out1.is_some());
        let string_len_fast = stabilizer.current_string_length;
        assert!(string_len_fast > 10.0, "String length should expand at high speed");

        // Slow move: 1px in 16.6ms -> low velocity, string contracts
        let p2 = StrokeEvent::new(101.0, 0.0, 1.0, 0.03334);
        stabilizer.add_event(p2, &config);
        let string_len_slow = stabilizer.current_string_length;
        assert!(string_len_slow < string_len_fast, "String length should contract when slowing down");
    }

    #[test]
    fn test_finish_stroke_connects_to_tip() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig {
            enabled: true,
            max_string_length: 40.0,
            velocity_multiplier: 3.0,
            connect_to_tip_on_release: true,
            pressure_smoothing: 0.0,
            ..Default::default()
        };

        let p0 = StrokeEvent::new(0.0, 0.0, 0.75, 0.0);
        stabilizer.begin_stroke(p0, &config);

        let p1 = StrokeEvent::new(80.0, 0.0, 0.85, 0.01667);
        stabilizer.add_event(p1, &config);

        // On finish, stabilizer connects the remaining leash distance directly to stylus lift point
        let final_event = stabilizer.finish_stroke(&config).expect("Must emit connecting event");
        assert_eq!(final_event.x, 80.0);
        assert_eq!(final_event.y, 0.0);
        assert_eq!(final_event.pressure, 0.85);
        assert_eq!(stabilizer.smoothed_tip, Some((80.0, 0.0)));
    }

    #[test]
    fn test_disabled_smoothing_passes_raw_events() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig {
            enabled: false,
            max_string_length: 50.0,
            ..Default::default()
        };

        let p0 = StrokeEvent::new(10.0, 10.0, 1.0, 0.0);
        stabilizer.begin_stroke(p0, &config);

        let p1 = StrokeEvent::new(12.0, 12.0, 0.9, 0.01667);
        let out = stabilizer.add_event(p1, &config).expect("Must pass raw event when disabled");
        assert_eq!(out.x, 12.0);
        assert_eq!(out.y, 12.0);
    }

    #[test]
    fn test_pressure_smoothing_filters_spikes() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig {
            enabled: true,
            max_string_length: 50.0,
            pressure_smoothing: 0.5,
            ..Default::default()
        };

        // Start at 0.2 pressure
        let p0 = StrokeEvent::new(0.0, 0.0, 0.2, 0.0);
        stabilizer.begin_stroke(p0, &config);

        // Instant pressure jump to 1.0
        let p1 = StrokeEvent::new(100.0, 0.0, 1.0, 0.01667);
        let out1 = stabilizer.add_event(p1, &config).expect("Must emit stabilized event");

        // Smoothed pressure should not jump to 1.0 instantly; it should be damped
        assert!(out1.pressure > 0.2 && out1.pressure < 1.0, "Pressure should be smoothly damped: got {}", out1.pressure);
        assert!((out1.pressure - 0.6).abs() < 0.15, "Expected around ~0.6, got {}", out1.pressure);
    }

    #[test]
    fn test_pressure_smoothing_active_when_spatial_leash_disabled() {
        let mut stabilizer = PullStringStabilizer::new();
        let config = PullStringConfig {
            enabled: false, // Spatial leash OFF
            max_string_length: 50.0,
            pressure_smoothing: 0.5,
            ..Default::default()
        };

        let p0 = StrokeEvent::new(0.0, 0.0, 0.2, 0.0);
        stabilizer.begin_stroke(p0, &config);

        // Instant pressure jump to 1.0 at raw position (20.0, 20.0)
        let p1 = StrokeEvent::new(20.0, 20.0, 1.0, 0.01667);
        let out1 = stabilizer.add_event(p1, &config).expect("Must emit event");

        // Position must be raw (1:1, no leash lag)
        assert_eq!(out1.x, 20.0);
        assert_eq!(out1.y, 20.0);
        // Pressure must still be smoothly filtered!
        assert!(out1.pressure > 0.2 && out1.pressure < 1.0, "Pressure smoothing must work with leash disabled: got {}", out1.pressure);
    }
}
