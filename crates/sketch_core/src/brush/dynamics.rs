use crate::stroke::StrokeEvent;
use std::f32::consts::{FRAC_PI_2, PI, TAU};

/// The physical or synthetic sensor feeding brush modulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SensorType {
    /// Stylus tip pressure (0.0 to 1.0).
    Pressure,
    /// Stylus tilt elevation angle relative to the surface (0.0 = flat, 1.0 = perpendicular).
    TiltElevation,
    /// Stylus tilt azimuth direction around the compass (0.0 to 1.0 representing 0 to 360 deg).
    TiltAzimuth,
    /// Instantaneous stroke velocity in pixels per second.
    Velocity,
    /// Continuous distance traveled along the stroke trajectory.
    Distance,
    /// Uniform pseudo-random noise for organic scattering.
    Random,
}

impl SensorType {
    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "pressure" => Self::Pressure,
            "tiltelevation" | "tilt_elevation" | "tilt-elevation" | "elevation" => Self::TiltElevation,
            "tiltazimuth" | "tilt_azimuth" | "tilt-azimuth" | "azimuth" | "direction" => Self::TiltAzimuth,
            "velocity" | "speed" => Self::Velocity,
            "distance" | "length" => Self::Distance,
            "random" | "jitter" => Self::Random,
            _ => Self::Pressure,
        }
    }
}

/// A precomputed 256-entry lookup table for $O(1)$ dynamics response evaluation.
#[derive(Debug, Clone, PartialEq)]
pub struct DynamicsCurve {
    pub lut: Box<[f32; 256]>,
}

impl DynamicsCurve {
    /// Creates a 1:1 linear response curve ($y = x$).
    pub fn linear() -> Self {
        let mut arr = [0.0f32; 256];
        for i in 0..256 {
            arr[i] = i as f32 / 255.0;
        }
        Self { lut: Box::new(arr) }
    }

    /// Creates an inverted linear curve ($y = 1.0 - x$).
    pub fn inverted() -> Self {
        let mut arr = [0.0f32; 256];
        for i in 0..256 {
            arr[i] = 1.0 - (i as f32 / 255.0);
        }
        Self { lut: Box::new(arr) }
    }

    /// Creates a smooth cubic Hermite / S-curve response.
    pub fn soft_s_curve() -> Self {
        let mut arr = [0.0f32; 256];
        for i in 0..256 {
            let t = i as f32 / 255.0;
            arr[i] = t * t * (3.0 - 2.0 * t);
        }
        Self { lut: Box::new(arr) }
    }

    /// Creates a curve from a raw 256-float array.
    pub fn from_lut(lut: [f32; 256]) -> Self {
        Self { lut: Box::new(lut) }
    }

    /// Evaluates the curve for any normalized input in $[0.0, 1.0]$ in $O(1)$ time.
    #[inline]
    pub fn sample(&self, input: f32) -> f32 {
        let idx = ((input.clamp(0.0, 1.0) * 255.0).round() as usize).min(255);
        self.lut[idx]
    }
}

impl Default for DynamicsCurve {
    fn default() -> Self {
        Self::linear()
    }
}

/// Maps a sensor input through a transfer curve to an output range.
#[derive(Debug, Clone, PartialEq)]
pub struct SensorDynamicsMapping {
    pub sensor: SensorType,
    pub curve: DynamicsCurve,
    pub min_output: f32,
    pub max_output: f32,
    pub enabled: bool,
}

impl SensorDynamicsMapping {
    /// Creates a new mapping for a sensor type with linear response between min and max output.
    pub fn new(sensor: SensorType, min_output: f32, max_output: f32) -> Self {
        Self {
            sensor,
            curve: DynamicsCurve::linear(),
            min_output,
            max_output,
            enabled: true,
        }
    }

    /// Evaluates the mapped output value given the current stroke context.
    pub fn evaluate(
        &self,
        event: &StrokeEvent,
        velocity_px_sec: f32,
        distance_px: f32,
        random_seed: f32,
    ) -> f32 {
        if !self.enabled {
            return self.max_output;
        }

        let raw_sensor = match self.sensor {
            SensorType::Pressure => event.pressure,
            SensorType::TiltElevation => {
                // event.tilt_elevation() returns [0, pi/2]
                (event.tilt_elevation() / FRAC_PI_2).clamp(0.0, 1.0)
            }
            SensorType::TiltAzimuth => {
                // event.tilt_azimuth() returns [-pi, pi] -> map to [0.0, 1.0]
                ((event.tilt_azimuth() + PI) / TAU).clamp(0.0, 1.0)
            }
            SensorType::Velocity => {
                // Map 0 to 2500 px/sec to [0.0, 1.0]
                (velocity_px_sec / 2500.0).clamp(0.0, 1.0)
            }
            SensorType::Distance => (distance_px / 500.0).fract(),
            SensorType::Random => random_seed.clamp(0.0, 1.0),
        };

        let response = self.curve.sample(raw_sensor);
        self.min_output + response * (self.max_output - self.min_output)
    }
}

/// Full brush dynamics configuration bundling independent parameter modulations.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BrushDynamicsConfig {
    pub size: Option<SensorDynamicsMapping>,
    pub opacity: Option<SensorDynamicsMapping>,
    pub flow: Option<SensorDynamicsMapping>,
    pub angle: Option<SensorDynamicsMapping>,
    pub jitter: Option<SensorDynamicsMapping>,
    pub softness: Option<SensorDynamicsMapping>,
}

impl BrushDynamicsConfig {
    /// Sets or removes a dynamic sensor mapping for a given brush parameter name.
    pub fn set_mapping(&mut self, param: &str, mapping: Option<SensorDynamicsMapping>) {
        match param.to_ascii_lowercase().as_str() {
            "size" | "diameter" => self.size = mapping,
            "opacity" => self.opacity = mapping,
            "flow" => self.flow = mapping,
            "angle" | "rotation" => self.angle = mapping,
            "jitter" | "scatter" => self.jitter = mapping,
            "softness" => self.softness = mapping,
            _ => {}
        }
    }

    /// Clears all dynamic mappings back to static brush behavior.
    pub fn clear(&mut self) {
        self.size = None;
        self.opacity = None;
        self.flow = None;
        self.angle = None;
        self.jitter = None;
        self.softness = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamics_curve_linear() {
        let curve = DynamicsCurve::linear();
        assert_eq!(curve.sample(0.0), 0.0);
        assert!((curve.sample(0.5) - 0.5).abs() < 0.01);
        assert_eq!(curve.sample(1.0), 1.0);
    }

    #[test]
    fn test_dynamics_curve_inverted() {
        let curve = DynamicsCurve::inverted();
        assert_eq!(curve.sample(0.0), 1.0);
        assert!((curve.sample(0.5) - 0.5).abs() < 0.01);
        assert_eq!(curve.sample(1.0), 0.0);
    }

    #[test]
    fn test_dynamics_curve_soft_s_curve() {
        let curve = DynamicsCurve::soft_s_curve();
        assert_eq!(curve.sample(0.0), 0.0);
        assert!((curve.sample(0.5) - 0.5).abs() < 0.01);
        assert_eq!(curve.sample(1.0), 1.0);
        // S-curve derivative is lower at boundaries
        assert!(curve.sample(0.1) < 0.1);
        assert!(curve.sample(0.9) > 0.9);
    }

    #[test]
    fn test_sensor_dynamics_pressure_scaling() {
        let mapping = SensorDynamicsMapping::new(SensorType::Pressure, 10.0, 100.0);
        let event = StrokeEvent::new(0.0, 0.0, 0.5, 0.0);
        let out = mapping.evaluate(&event, 0.0, 0.0, 0.0);
        assert!((out - 55.0).abs() < 1.0);
    }

    #[test]
    fn test_sensor_dynamics_velocity() {
        let mapping = SensorDynamicsMapping::new(SensorType::Velocity, 0.2, 1.0);
        let event = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        // Half max velocity (1250 / 2500 = 0.5)
        let out = mapping.evaluate(&event, 1250.0, 0.0, 0.0);
        assert!((out - 0.6).abs() < 0.05);
    }

    #[test]
    fn test_sensor_dynamics_tilt_elevation() {
        let mapping = SensorDynamicsMapping::new(SensorType::TiltElevation, 0.0, 1.0);
        // Stylus perpendicular: tilt_x = 0, tilt_y = 0 -> elevation = pi/2 -> 1.0
        let event_vertical = StrokeEvent::with_tilt(0.0, 0.0, 1.0, 0.0, 0.0, 0.0);
        let out_v = mapping.evaluate(&event_vertical, 0.0, 0.0, 0.0);
        assert!((out_v - 1.0).abs() < 0.01);

        // Stylus tilted flat: tilt_x = 1.0 -> elevation = 0 -> 0.0
        let event_flat = StrokeEvent::with_tilt(0.0, 0.0, 1.0, 0.0, 1.0, 0.0);
        let out_f = mapping.evaluate(&event_flat, 0.0, 0.0, 0.0);
        assert!((out_f - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_brush_dynamics_config_set_mapping_and_clear() {
        let mut config = BrushDynamicsConfig::default();
        assert!(config.size.is_none());
        assert!(config.softness.is_none());

        let mapping = SensorDynamicsMapping::new(SensorType::Pressure, 0.2, 1.0);
        config.set_mapping("size", Some(mapping.clone()));
        config.set_mapping("softness", Some(mapping.clone()));
        assert!(config.size.is_some());
        assert!(config.softness.is_some());

        config.set_mapping("size", None);
        assert!(config.size.is_none());
        assert!(config.softness.is_some());

        config.clear();
        assert!(config.softness.is_none());
    }
}
