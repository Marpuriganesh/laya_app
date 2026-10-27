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
    /// Instantaneous motion tangent / stroke drawing angle (-pi to pi mapped to 0.0 to 1.0).
    StrokeDirection,
    /// Initial stroke direction established at stroke inception and locked for stroke duration.
    InitialStrokeDirection,
}

impl SensorType {
    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "pressure" => Self::Pressure,
            "tiltelevation" | "tilt_elevation" | "tilt-elevation" | "elevation" => Self::TiltElevation,
            "tiltazimuth" | "tilt_azimuth" | "tilt-azimuth" | "azimuth" => Self::TiltAzimuth,
            "velocity" | "speed" => Self::Velocity,
            "distance" | "length" => Self::Distance,
            "random" | "jitter" => Self::Random,
            "strokedirection" | "stroke_direction" | "stroke-direction" | "direction" | "drawingangle" | "drawing_angle" | "angle" => Self::StrokeDirection,
            "initialstrokedirection" | "initial_stroke_direction" | "initial-stroke-direction" | "initialdirection" | "initial_direction" | "initial_angle" => Self::InitialStrokeDirection,
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
        stroke_direction_rad: f32,
        initial_stroke_direction_rad: f32,
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
            SensorType::StrokeDirection => {
                let norm = if stroke_direction_rad < 0.0 {
                    (stroke_direction_rad + TAU) / TAU
                } else {
                    stroke_direction_rad / TAU
                };
                norm.clamp(0.0, 1.0)
            }
            SensorType::InitialStrokeDirection => {
                let norm = if initial_stroke_direction_rad < 0.0 {
                    (initial_stroke_direction_rad + TAU) / TAU
                } else {
                    initial_stroke_direction_rad / TAU
                };
                norm.clamp(0.0, 1.0)
            }
        };

        let response = self.curve.sample(raw_sensor);
        self.min_output + response * (self.max_output - self.min_output)
    }
}

/// Combination mode for multiple active sensor curves modulating the same brush property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DynamicsCalculationMode {
    #[default]
    Multiply,
    Add,
    Max,
    Min,
}

impl DynamicsCalculationMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "add" | "addition" => Self::Add,
            "max" | "maximum" => Self::Max,
            "min" | "minimum" => Self::Min,
            _ => Self::Multiply,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Multiply => "multiply",
            Self::Add => "add",
            Self::Max => "max",
            Self::Min => "min",
        }
    }
}

/// Represents a set of active sensor dynamics mappings modulating a single brush property.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PropertyDynamicsConfig {
    pub mappings: Vec<SensorDynamicsMapping>,
    pub calculation_mode: DynamicsCalculationMode,
}

impl PropertyDynamicsConfig {
    /// Returns whether any sensor mapping is currently enabled.
    #[inline]
    pub fn is_active(&self) -> bool {
        self.mappings.iter().any(|m| m.enabled)
    }

    /// Sets or replaces the mapping for a sensor.
    pub fn set_sensor_mapping(&mut self, mapping: SensorDynamicsMapping) {
        if let Some(pos) = self.mappings.iter().position(|m| m.sensor == mapping.sensor) {
            self.mappings[pos] = mapping;
        } else {
            self.mappings.push(mapping);
        }
    }

    /// Enables or disables a sensor mapping without dropping its curve.
    pub fn set_sensor_enabled(&mut self, sensor: SensorType, enabled: bool) {
        if let Some(m) = self.mappings.iter_mut().find(|m| m.sensor == sensor) {
            m.enabled = enabled;
        }
    }

    /// Removes a sensor mapping entirely.
    pub fn remove_sensor(&mut self, sensor: SensorType) {
        self.mappings.retain(|m| m.sensor != sensor);
    }

    /// Queries the mapping for a given sensor if present.
    pub fn get_mapping(&self, sensor: SensorType) -> Option<&SensorDynamicsMapping> {
        self.mappings.iter().find(|m| m.sensor == sensor)
    }

    /// Clears all active mappings and resets calculation mode to multiply.
    pub fn clear(&mut self) {
        self.mappings.clear();
        self.calculation_mode = DynamicsCalculationMode::Multiply;
    }

    /// Evaluates all active sensor mappings according to `calculation_mode`.
    /// Returns a combined modulation multiplier.
    pub fn evaluate(
        &self,
        event: &StrokeEvent,
        velocity_px_sec: f32,
        distance_px: f32,
        stroke_direction_rad: f32,
        initial_stroke_direction_rad: f32,
        random_seed: f32,
    ) -> f32 {
        let active: Vec<&SensorDynamicsMapping> = self.mappings.iter().filter(|m| m.enabled).collect();
        if active.is_empty() {
            return 1.0;
        }

        match self.calculation_mode {
            DynamicsCalculationMode::Multiply => {
                let mut product = 1.0f32;
                for m in active {
                    product *= m.evaluate(event, velocity_px_sec, distance_px, stroke_direction_rad, initial_stroke_direction_rad, random_seed);
                }
                product
            }
            DynamicsCalculationMode::Add => {
                let mut sum = 0.0f32;
                for m in active {
                    sum += m.evaluate(event, velocity_px_sec, distance_px, stroke_direction_rad, initial_stroke_direction_rad, random_seed);
                }
                sum.clamp(0.0, 1.0)
            }
            DynamicsCalculationMode::Max => {
                let mut max_val = f32::MIN;
                for m in active {
                    max_val = max_val.max(m.evaluate(event, velocity_px_sec, distance_px, stroke_direction_rad, initial_stroke_direction_rad, random_seed));
                }
                max_val
            }
            DynamicsCalculationMode::Min => {
                let mut min_val = f32::MAX;
                for m in active {
                    min_val = min_val.min(m.evaluate(event, velocity_px_sec, distance_px, stroke_direction_rad, initial_stroke_direction_rad, random_seed));
                }
                min_val
            }
        }
    }
}

/// Full brush dynamics configuration bundling independent multi-sensor parameter modulations.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BrushDynamicsConfig {
    pub size: PropertyDynamicsConfig,
    pub opacity: PropertyDynamicsConfig,
    pub flow: PropertyDynamicsConfig,
    pub angle: PropertyDynamicsConfig,
    pub jitter: PropertyDynamicsConfig,
    pub softness: PropertyDynamicsConfig,
    pub ratio: PropertyDynamicsConfig,
    pub spacing: PropertyDynamicsConfig,
}

impl BrushDynamicsConfig {
    /// Sets or removes a dynamic sensor mapping for a given brush parameter name.
    pub fn set_mapping(&mut self, param: &str, mapping: Option<SensorDynamicsMapping>) {
        let prop = match param.to_ascii_lowercase().as_str() {
            "size" | "diameter" => &mut self.size,
            "opacity" => &mut self.opacity,
            "flow" => &mut self.flow,
            "angle" | "rotation" => &mut self.angle,
            "jitter" | "scatter" => &mut self.jitter,
            "softness" => &mut self.softness,
            "ratio" | "aspect_ratio" => &mut self.ratio,
            "spacing" => &mut self.spacing,
            _ => return,
        };

        if let Some(m) = mapping {
            prop.set_sensor_mapping(m);
        } else {
            prop.clear();
        }
    }

    /// Sets or updates a specific sensor mapping for a given brush parameter.
    pub fn set_sensor_mapping(
        &mut self,
        param: &str,
        sensor: SensorType,
        enabled: bool,
        min_output: f32,
        max_output: f32,
        curve: DynamicsCurve,
    ) {
        let prop = match param.to_ascii_lowercase().as_str() {
            "size" | "diameter" => &mut self.size,
            "opacity" => &mut self.opacity,
            "flow" => &mut self.flow,
            "angle" | "rotation" => &mut self.angle,
            "jitter" | "scatter" => &mut self.jitter,
            "softness" => &mut self.softness,
            "ratio" | "aspect_ratio" => &mut self.ratio,
            "spacing" => &mut self.spacing,
            _ => return,
        };

        if enabled {
            prop.set_sensor_mapping(SensorDynamicsMapping {
                sensor,
                curve,
                min_output,
                max_output,
                enabled: true,
            });
        } else {
            prop.set_sensor_enabled(sensor, false);
        }
    }

    /// Sets the curves calculation mode (multiply, add, max, min) for a parameter.
    pub fn set_calculation_mode(&mut self, param: &str, mode: DynamicsCalculationMode) {
        let prop = match param.to_ascii_lowercase().as_str() {
            "size" | "diameter" => &mut self.size,
            "opacity" => &mut self.opacity,
            "flow" => &mut self.flow,
            "angle" | "rotation" => &mut self.angle,
            "jitter" | "scatter" => &mut self.jitter,
            "softness" => &mut self.softness,
            "ratio" | "aspect_ratio" => &mut self.ratio,
            "spacing" => &mut self.spacing,
            _ => return,
        };
        prop.calculation_mode = mode;
    }

    /// Clears all dynamic mappings back to static brush behavior.
    pub fn clear(&mut self) {
        self.size.clear();
        self.opacity.clear();
        self.flow.clear();
        self.angle.clear();
        self.jitter.clear();
        self.softness.clear();
        self.ratio.clear();
        self.spacing.clear();
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
        let out = mapping.evaluate(&event, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!((out - 55.0).abs() < 1.0);
    }

    #[test]
    fn test_sensor_dynamics_velocity() {
        let mapping = SensorDynamicsMapping::new(SensorType::Velocity, 0.2, 1.0);
        let event = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        // Half max velocity (1250 / 2500 = 0.5)
        let out = mapping.evaluate(&event, 1250.0, 0.0, 0.0, 0.0, 0.0);
        assert!((out - 0.6).abs() < 0.05);
    }

    #[test]
    fn test_sensor_dynamics_tilt_elevation() {
        let mapping = SensorDynamicsMapping::new(SensorType::TiltElevation, 0.0, 1.0);
        // Stylus perpendicular: tilt_x = 0, tilt_y = 0 -> elevation = pi/2 -> 1.0
        let event_vertical = StrokeEvent::with_tilt(0.0, 0.0, 1.0, 0.0, 0.0, 0.0);
        let out_v = mapping.evaluate(&event_vertical, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!((out_v - 1.0).abs() < 0.01);

        // Stylus tilted flat: tilt_x = 1.0 -> elevation = 0 -> 0.0
        let event_flat = StrokeEvent::with_tilt(0.0, 0.0, 1.0, 0.0, 1.0, 0.0);
        let out_f = mapping.evaluate(&event_flat, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!((out_f - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_sensor_dynamics_stroke_direction_and_initial_direction() {
        let map_dir = SensorDynamicsMapping::new(SensorType::StrokeDirection, 0.0, 1.0);
        let map_init = SensorDynamicsMapping::new(SensorType::InitialStrokeDirection, 0.0, 1.0);
        let event = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);

        // Direction angle 0.0 rad (Right) -> maps to 0.0
        let out_dir = map_dir.evaluate(&event, 0.0, 0.0, 0.0, PI, 0.0);
        assert!((out_dir - 0.0).abs() < 0.02);

        // Direction angle PI/2 rad (Down) -> maps to 0.25
        let out_down = map_dir.evaluate(&event, 0.0, 0.0, std::f32::consts::FRAC_PI_2, PI, 0.0);
        assert!((out_down - 0.25).abs() < 0.02);

        // Initial direction PI rad (Left) -> maps to 0.5
        let out_init = map_init.evaluate(&event, 0.0, 0.0, 0.0, PI, 0.0);
        assert!((out_init - 0.5).abs() < 0.02);
    }

    #[test]
    fn test_brush_dynamics_config_set_mapping_and_clear() {
        let mut config = BrushDynamicsConfig::default();
        assert!(!config.size.is_active());
        assert!(!config.softness.is_active());

        let mapping = SensorDynamicsMapping::new(SensorType::Pressure, 0.2, 1.0);
        config.set_mapping("size", Some(mapping.clone()));
        config.set_mapping("softness", Some(mapping.clone()));
        assert!(config.size.is_active());
        assert!(config.softness.is_active());

        config.set_mapping("size", None);
        assert!(!config.size.is_active());
        assert!(config.softness.is_active());

        config.clear();
        assert!(!config.softness.is_active());
    }

    #[test]
    fn test_multi_sensor_dynamics_combination() {
        let mut prop = PropertyDynamicsConfig::default();
        let pressure_map = SensorDynamicsMapping::new(SensorType::Pressure, 0.5, 1.0);
        let velocity_map = SensorDynamicsMapping::new(SensorType::Velocity, 0.5, 1.0);

        prop.set_sensor_mapping(pressure_map);
        prop.set_sensor_mapping(velocity_map);

        let event = StrokeEvent::new(0.0, 0.0, 1.0, 0.0);
        // Pressure 1.0 -> 1.0; Velocity 1250 (0.5) -> 0.75
        // Multiply: 1.0 * 0.75 = 0.75
        prop.calculation_mode = DynamicsCalculationMode::Multiply;
        let mult = prop.evaluate(&event, 1250.0, 0.0, 0.0, 0.0, 0.0);
        assert!((mult - 0.75).abs() < 0.05);

        // Add: (1.0 + 0.75).min(1.0) = 1.0
        prop.calculation_mode = DynamicsCalculationMode::Add;
        let add = prop.evaluate(&event, 1250.0, 0.0, 0.0, 0.0, 0.0);
        assert!((add - 1.0).abs() < 0.01);
    }
}
