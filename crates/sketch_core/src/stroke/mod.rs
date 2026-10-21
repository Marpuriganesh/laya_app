//! Standalone Stroke Trajectory Pipeline
//!
//! Provides decoupled Midpoint Quadratic Bézier Spline interpolation,
//! subpixel Gravesen arc length stepping, and distance preservation.

pub mod event;
pub mod stepper;
pub mod trajectory;

pub use event::StrokeEvent;
pub use stepper::StrokeStepper;
pub use trajectory::StrokeTrajectory;
