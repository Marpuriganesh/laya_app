//! Standalone Krita Pixel Brush Engine
//!
//! Subsystems:
//! - [`Rect`]: 2D bounding boxes and dirty region expansion.
//! - [`BrushConfig`]: Brush geometry, softness, color, dynamics, spacing, and anti-aliasing.
//! - [`CanvasView`]: RGBA8 contiguous pixel buffer with PPM export.
//! - [`MaskRasterizer`]: Radial analytical softness dab alpha mask generator with subpixel anti-aliasing.
//! - [`CanvasBlitter`]: Porter-Duff Over alpha compositing into canvas memory.
//! - [`PixelBrushEngine`]: High-level orchestrator connecting stepping, rasterization, and blitting.

pub mod blend;
pub mod blitter;
pub mod canvas;
pub mod config;
pub mod engine;
pub mod rasterizer;
pub mod rect;
pub mod texture;
pub mod tip;

pub use blend::{
    blend_channel_add, blend_channel_color_burn, blend_channel_color_dodge, blend_channel_darken,
    blend_channel_difference, blend_channel_divide, blend_channel_exclusion,
    blend_channel_hard_light, blend_channel_hard_mix, blend_channel_inverse_subtract,
    blend_channel_lighten, blend_channel_linear_burn, blend_channel_linear_light,
    blend_channel_multiply, blend_channel_normal, blend_channel_overlay, blend_channel_pin_light,
    blend_channel_screen, blend_channel_soft_light, blend_channel_subtract,
    blend_channel_vivid_light, blend_rgb, composite_pixel, modulate_texture_alpha,
    ColorBlendMode, TextureBlendMode,
};
pub use blitter::CanvasBlitter;
pub use canvas::CanvasView;
pub use config::BrushConfig;
pub use engine::PixelBrushEngine;
pub use rasterizer::MaskRasterizer;
pub use rect::Rect;
pub use texture::{apply_texture_to_dab, PatternData, TextureConfig};
pub use tip::{BrushTipRasterizer, BrushTipType, PredefinedTipData};

// Re-export stroke pipeline types for contract compatibility
pub use crate::stroke::{StrokeEvent, StrokeStepper, StrokeTrajectory};
