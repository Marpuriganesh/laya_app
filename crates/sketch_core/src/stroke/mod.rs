//! Standalone Stroke Trajectory Pipeline
//!
//! Provides decoupled Midpoint Quadratic Bézier Spline interpolation,
//! subpixel Gravesen arc length stepping, and distance preservation.

pub mod event;
pub mod moving_average;
pub mod pull_string;
pub mod stepper;
pub mod trajectory;

pub use event::StrokeEvent;
pub use moving_average::{MovingAverageConfig, MovingAverageStabilizer};
pub use pull_string::{PullStringConfig, PullStringStabilizer};
pub use stepper::StrokeStepper;
pub use trajectory::StrokeTrajectory;
