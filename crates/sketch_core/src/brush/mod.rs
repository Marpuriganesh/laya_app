//! Standalone Krita Pixel Brush Engine
//!
//! Subsystems:
//! - [`StrokeEvent`]: Stylus/mouse telemetry and subpixel linear interpolation.
//! - [`Rect`]: 2D bounding boxes and dirty region expansion.
//! - [`BrushConfig`]: Brush geometry, softness, color, dynamics, and spacing.
//! - [`CanvasView`]: RGBA8 contiguous pixel buffer with PPM export.
//! - [`StrokeStepper`]: Subpixel distance tracking and dab interval calculation.
//! - [`MaskRasterizer`]: Radial analytical softness dab alpha mask generator.
//! - [`CanvasBlitter`]: Porter-Duff Over alpha compositing into canvas memory.
//! - [`PixelBrushEngine`]: High-level orchestrator connecting stepping, rasterization, and blitting.

pub mod blitter;
pub mod canvas;
pub mod config;
pub mod engine;
pub mod event;
pub mod rasterizer;
pub mod rect;
pub mod stepper;

pub use blitter::CanvasBlitter;
pub use canvas::CanvasView;
pub use config::BrushConfig;
pub use engine::PixelBrushEngine;
pub use event::StrokeEvent;
pub use rasterizer::MaskRasterizer;
pub use rect::Rect;
pub use stepper::StrokeStepper;
