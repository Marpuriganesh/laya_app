use crate::stroke::event::StrokeEvent;

/// Configuration parameters for the Dynamic Moving Average stroke stabilizer.
///
/// Designed primarily for clean, jitter-free line art over rough sketches:
/// - Fast sweeping strokes expand the effective window up to `window_size`, eliminating
///   digitizer sensor noise, micro-tremors, and hand jitter.
/// - Slowing down or coming to a stop dynamically shrinks the effective window to zero/one,
///   guaranteeing crisp sharp corners, tight apexes, and zero trailing lag.
/// - Weighted averaging favors recent points ($w_i = (i + 1)^{1.5}$), minimizing phase lag.
/// - Pressure is passed through untouched to preserve 1:1 stylus response (pressure smoothing
///   is handled separately by the pull-string stabilizer).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MovingAverageConfig {
    /// Whether dynamic moving average smoothing is active.
    pub enabled: bool,
    /// Maximum sample window size [2..24] (default: 8).
    pub window_size: usize,
    /// Velocity dynamic scaling multiplier [0.0..5.0] (default: 1.5).
    /// At higher speeds, increases the window up to `window_size`.
    pub velocity_multiplier: f32,
}

impl Default for MovingAverageConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            window_size: 8,
            velocity_multiplier: 1.5,
        }
    }
}

/// Standalone, engine-agnostic Dynamic Moving Average stroke stabilizer.
///
/// Operates as a pure stream filter on `StrokeEvent` without any dependency on
/// canvas or brush rasterization.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MovingAverageStabilizer {
    /// History buffer of recent raw stroke positions (x, y).
    pub history: Vec<(f32, f32)>,
    /// Previous raw stylus position.
    pub prev_raw: Option<(f32, f32)>,
    /// Previous event timestamp in seconds.
    pub last_time: f32,
    /// Last processed raw event (saved for exact lift-off connection).
    pub last_raw_event: Option<StrokeEvent>,
    /// Whether a stroke is currently active.
    pub is_active: bool,
}

impl MovingAverageStabilizer {
    /// Constructs a new, idle `MovingAverageStabilizer`.
    pub fn new() -> Self {
        Self {
            history: Vec::with_capacity(32),
            prev_raw: None,
            last_time: 0.0,
            last_raw_event: None,
            is_active: false,
        }
    }

    /// Resets internal tracking for a new stroke.
    pub fn reset(&mut self) {
        self.history.clear();
        self.prev_raw = None;
        self.last_time = 0.0;
        self.last_raw_event = None;
        self.is_active = false;
    }

    /// Initializes a new stroke with the seed event.
    /// If smoothing is disabled, returns `start_event` untouched.
    pub fn begin_stroke(
        &mut self,
        start_event: StrokeEvent,
        config: &MovingAverageConfig,
    ) -> StrokeEvent {
        self.reset();
        self.is_active = true;
        self.prev_raw = Some((start_event.x, start_event.y));
        self.last_time = start_event.time;
        self.last_raw_event = Some(start_event);

        if !config.enabled {
            return start_event;
        }

        self.history.push((start_event.x, start_event.y));
        start_event
    }

    /// Processes an incoming raw `StrokeEvent`, applying dynamic velocity-weighted averaging.
    /// Returns the filtered `StrokeEvent` with smoothed $(x, y)$ coordinates and preserved pressure.
    pub fn add_event(
        &mut self,
        next_event: StrokeEvent,
        config: &MovingAverageConfig,
    ) -> Option<StrokeEvent> {
        if !self.is_active {
            return Some(next_event);
        }

        self.last_raw_event = Some(next_event);

        if !config.enabled {
            self.prev_raw = Some((next_event.x, next_event.y));
            self.last_time = next_event.time;
            return Some(next_event);
        }

        let max_window = config.window_size.clamp(2, 32);

        // 1. Calculate instantaneous velocity (pixels per second)
        let raw_dt = next_event.time - self.last_time;
        let dt = if raw_dt > 0.002 {
            raw_dt.min(0.1)
        } else {
            // When events arrive unclocked or with identical coalesced timestamps,
            // assume standard ~120Hz interval (0.0083s) to prevent artificial velocity explosion
            0.00833
        };
        let velocity = if let Some((px, py)) = self.prev_raw {
            let dx = next_event.x - px;
            let dy = next_event.y - py;
            (dx * dx + dy * dy).sqrt() / dt
        } else {
            0.0
        };

        self.prev_raw = Some((next_event.x, next_event.y));
        self.last_time = next_event.time;

        // 2. Compute dynamic effective window size:
        //    At near-zero velocity (stopping / tight corners), effective window contracts down to 1.
        //    At normal to high velocity, window expands proportionally up to `max_window`.
        let speed_ratio = (velocity / 400.0) * config.velocity_multiplier;
        let dynamic_window = (1.0 + (max_window as f32 - 1.0) * speed_ratio.clamp(0.0, 1.0)).round() as usize;
        let effective_window = dynamic_window.clamp(1, max_window);

        // 3. Append to history buffer and trim to max needed capacity
        self.history.push((next_event.x, next_event.y));
        if self.history.len() > max_window * 2 {
            let drain_count = self.history.len() - max_window;
            self.history.drain(0..drain_count);
        }

        // 4. Calculate weighted moving average over the last `effective_window` samples:
        //    Weights: w_i = (i + 1)^1.5 so latest samples have higher authority, avoiding phase lag.
        let available = self.history.len();
        let take_count = effective_window.min(available);
        let start_idx = available - take_count;

        let mut sum_x = 0.0f32;
        let mut sum_y = 0.0f32;
        let mut sum_weight = 0.0f32;

        for (i, &(hx, hy)) in self.history[start_idx..].iter().enumerate() {
            // Quadratic/exponential weighting favoring recent points
            let weight = ((i + 1) as f32).powf(1.5);
            sum_x += hx * weight;
            sum_y += hy * weight;
            sum_weight += weight;
        }

        let smoothed_x = if sum_weight > 0.0 { sum_x / sum_weight } else { next_event.x };
        let smoothed_y = if sum_weight > 0.0 { sum_y / sum_weight } else { next_event.y };

        // Pressure and timestamp are preserved untouched
        Some(StrokeEvent::new(smoothed_x, smoothed_y, next_event.pressure, next_event.time))
    }

    /// Resets internal stabilizer tracking for a concluded stroke.
    /// Does not inject an artificial jump to raw cursor coordinates, preventing snap-on-release artifacts.
    pub fn finish_stroke(&mut self, _config: &MovingAverageConfig) -> Option<StrokeEvent> {
        self.reset();
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_moving_average_disabled_passthrough() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: false,
            ..Default::default()
        };

        let start = StrokeEvent::new(10.0, 20.0, 0.5, 0.0);
        let s0 = stabilizer.begin_stroke(start, &config);
        assert_eq!((s0.x, s0.y), (10.0, 20.0));
        assert_eq!(s0.pressure, 0.5);

        let next = StrokeEvent::new(50.0, 60.0, 0.8, 0.016);
        let s1 = stabilizer.add_event(next, &config).expect("Event passed through");
        assert_eq!((s1.x, s1.y), (50.0, 60.0));
        assert_eq!(s1.pressure, 0.8);
    }

    #[test]
    fn test_moving_average_smooths_jitter() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: true,
            window_size: 8,
            velocity_multiplier: 2.0,
        };

        let start = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        stabilizer.begin_stroke(start, &config);

        // Feed points moving along X with high-frequency Y jitter (+- 10px)
        let mut last_smoothed = start;
        for i in 1..=10 {
            let x = i as f32 * 20.0;
            let y_jitter = if i % 2 == 0 { 10.0 } else { -10.0 };
            let event = StrokeEvent::new(x, y_jitter, 1.0, i as f32 * 0.016);
            if let Some(smoothed) = stabilizer.add_event(event, &config) {
                last_smoothed = smoothed;
            }
        }

        // The smoothed Y should be substantially less than the extreme +-10.0 jitter
        assert!(last_smoothed.y.abs() < 6.0, "Jitter must be filtered: got y={}", last_smoothed.y);
        // Pressure must remain untouched
        assert_eq!(last_smoothed.pressure, 1.0);
    }

    #[test]
    fn test_moving_average_velocity_contraction_in_corners() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: true,
            window_size: 8,
            velocity_multiplier: 1.5,
        };

        // Fast sweep
        stabilizer.begin_stroke(StrokeEvent::new(0.0, 0.0, 1.0, 0.0), &config);
        stabilizer.add_event(StrokeEvent::new(50.0, 0.0, 1.0, 0.016), &config);
        stabilizer.add_event(StrokeEvent::new(100.0, 0.0, 1.0, 0.032), &config);

        // Near stop (velocity ~ 0) at corner point (100.0, 0.0)
        let corner = StrokeEvent::new(100.0, 0.0, 1.0, 0.500);
        let s_corner = stabilizer.add_event(corner, &config).expect("Corner point");

        // Effective window contracts at near-zero velocity, pulling close to corner
        assert!((s_corner.x - 100.0).abs() < 15.0);
    }

    #[test]
    fn test_moving_average_finish_resets_cleanly() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: true,
            window_size: 10,
            velocity_multiplier: 1.0,
        };

        stabilizer.begin_stroke(StrokeEvent::new(0.0, 0.0, 0.5, 0.0), &config);
        stabilizer.add_event(StrokeEvent::new(50.0, 50.0, 0.6, 0.016), &config);
        stabilizer.add_event(StrokeEvent::new(100.0, 100.0, 0.7, 0.032), &config);

        let finish = stabilizer.finish_stroke(&config);
        assert!(finish.is_none(), "Must not inject an artificial jump point on release");
        assert!(!stabilizer.is_active);
    }
}
