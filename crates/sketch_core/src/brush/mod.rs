//! Standalone Krita Pixel Brush Engine
//!
//! Subsystems:
//! - [`Rect`]: 2D bounding boxes and dirty region expansion.
//! - [`BrushConfig`]: Brush geometry, softness, color, dynamics, spacing, and anti-aliasing.
//! - [`CanvasView`]: RGBA8 contiguous pixel buffer with PPM export.
//! - [`MaskRasterizer`]: Radial analytical softness dab alpha mask generator with subpixel anti-aliasing.
//! - [`CanvasBlitter`]: Porter-Duff Over alpha compositing into canvas memory.
//! - [`PixelBrushEngine`]: High-level orchestrator connecting stepping, rasterization, and blitting.

pub mod blitter;
pub mod canvas;
pub mod config;
pub mod engine;
pub mod rasterizer;
pub mod rect;

pub use blitter::CanvasBlitter;
pub use canvas::CanvasView;
pub use config::BrushConfig;
pub use engine::PixelBrushEngine;
pub use rasterizer::MaskRasterizer;
pub use rect::Rect;

// Re-export stroke pipeline types for contract compatibility
pub use crate::stroke::{StrokeEvent, StrokeStepper, StrokeTrajectory};
