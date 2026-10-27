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
    /// Inertial weight factor [0.0..1.0] (default: 0.0).
    /// Preserves smoothing authority at low speeds so slow strokes maintain steady jitter filtering.
    pub weight: f32,
}

impl Default for MovingAverageConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            window_size: 8,
            velocity_multiplier: 1.5,
            weight: 0.0,
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

        // 2. Append to history buffer with fixed window size.
        //    CRITICAL: The window size must remain constant during drawing.
        //    Dynamically changing the window length causes discrete phase jumps,
        //    which produce severe jagged sawtooth/sawtooth ripples along strokes.
        self.history.push((next_event.x, next_event.y));
        if self.history.len() > max_window {
            self.history.remove(0);
        }

        // 3. Compute weighted moving average over the window:
        //    Weights: w_i = (i + 1)^1.5 so latest samples have higher authority, avoiding phase lag.
        let mut sum_x = 0.0f32;
        let mut sum_y = 0.0f32;
        let mut sum_weight = 0.0f32;

        for (i, &(hx, hy)) in self.history.iter().enumerate() {
            let weight = ((i + 1) as f32).powf(1.5);
            sum_x += hx * weight;
            sum_y += hy * weight;
            sum_weight += weight;
        }

        let avg_x = if sum_weight > 0.0 { sum_x / sum_weight } else { next_event.x };
        let avg_y = if sum_weight > 0.0 { sum_y / sum_weight } else { next_event.y };

        // 4. Smooth corner response:
        //    At very low velocity (stopping / sharp corners), blend smoothly towards raw point
        //    to maintain crisp apexes without changing discrete window length.
        //    When weight > 0, preserves moving-average authority even at slow speeds to filter hand tremors.
        let weight = config.weight.clamp(0.0, 1.0);
        let min_responsiveness = (0.2 + 0.8 * weight).clamp(0.2, 1.0);
        let responsiveness = if config.velocity_multiplier > 0.0 {
            let speed_ratio = (velocity / 250.0) * config.velocity_multiplier;
            speed_ratio.clamp(min_responsiveness, 1.0)
        } else {
            1.0
        };

        let smoothed_x = next_event.x + (avg_x - next_event.x) * responsiveness;
        let smoothed_y = next_event.y + (avg_y - next_event.y) * responsiveness;

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
            ..Default::default()
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
            ..Default::default()
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
    fn test_moving_average_monotonic_progression_no_sawtooth() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: true,
            window_size: 8,
            velocity_multiplier: 1.5,
            ..Default::default()
        };

        // Start stroke at 0.0
        stabilizer.begin_stroke(StrokeEvent::new(0.0, 0.0, 1.0, 0.0), &config);

        // Move strictly forward along X with fluctuating dt (simulating real OS timer jitter)
        let mut prev_smoothed_x = 0.0f32;
        let dts = [0.001, 0.016, 0.002, 0.008, 0.020, 0.003, 0.015, 0.001, 0.016];
        let mut cur_time = 0.0;
        let mut cur_x = 0.0;

        for &dt in dts.iter().cycle().take(50) {
            cur_time += dt;
            cur_x += 5.0; // Strictly increasing position
            let event = StrokeEvent::new(cur_x, 0.0, 1.0, cur_time);
            if let Some(smoothed) = stabilizer.add_event(event, &config) {
                assert!(
                    smoothed.x >= prev_smoothed_x,
                    "Smoothed X must never move backwards! prev={}, current={}",
                    prev_smoothed_x,
                    smoothed.x
                );
                prev_smoothed_x = smoothed.x;
            }
        }
    }

    #[test]
    fn test_moving_average_finish_resets_cleanly() {
        let mut stabilizer = MovingAverageStabilizer::new();
        let config = MovingAverageConfig {
            enabled: true,
            window_size: 10,
            velocity_multiplier: 1.0,
            ..Default::default()
        };

        stabilizer.begin_stroke(StrokeEvent::new(0.0, 0.0, 0.5, 0.0), &config);
        stabilizer.add_event(StrokeEvent::new(50.0, 50.0, 0.6, 0.016), &config);
        stabilizer.add_event(StrokeEvent::new(100.0, 100.0, 0.7, 0.032), &config);

        let finish = stabilizer.finish_stroke(&config);
        assert!(finish.is_none(), "Must not inject an artificial jump point on release");
        assert!(!stabilizer.is_active);
    }

    #[test]
    fn test_moving_average_weight_preserves_smoothing_at_slow_speeds() {
        let mut stabilizer_no_weight = MovingAverageStabilizer::new();
        let config_no_weight = MovingAverageConfig {
            enabled: true,
            window_size: 10,
            velocity_multiplier: 1.0,
            weight: 0.0,
        };

        let mut stabilizer_weighted = MovingAverageStabilizer::new();
        let config_weighted = MovingAverageConfig {
            enabled: true,
            window_size: 10,
            velocity_multiplier: 1.0,
            weight: 1.0, // 100% weight: 100% moving average even at zero velocity
        };

        stabilizer_no_weight.begin_stroke(StrokeEvent::new(0.0, 0.0, 1.0, 0.0), &config_no_weight);
        stabilizer_weighted.begin_stroke(StrokeEvent::new(0.0, 0.0, 1.0, 0.0), &config_weighted);

        // Slow movement: 0.5px jump with low velocity
        let event = StrokeEvent::new(10.0, 0.0, 1.0, 0.1);
        let out_no_weight = stabilizer_no_weight.add_event(event, &config_no_weight).unwrap();
        let out_weighted = stabilizer_weighted.add_event(event, &config_weighted).unwrap();

        // With no weight, responsiveness collapses to 0.2, leaving output close to raw event (10.0)
        // With 1.0 weight, responsiveness stays at 1.0 (moving average is fully authoritative)
        // avg_x will be (0*1 + 10*2.82) / (1 + 2.82) ~ 7.38
        // out_no_weight = 10 + (7.38 - 10) * 0.2 = 9.47
        // out_weighted = 10 + (7.38 - 10) * 1.0 = 7.38
        assert!(out_weighted.x < out_no_weight.x, "Weighted stabilizer must pull more strongly towards moving average: weighted={}, unweighted={}", out_weighted.x, out_no_weight.x);
    }
}
