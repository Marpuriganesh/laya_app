use crate::brush::blend::ColorBlendMode;
use crate::brush::canvas::CanvasView;

/// Represents an individual raster layer in the drawing canvas.
///
/// Each layer owns its RGBA8 pixel buffer (`CanvasView`), an opacity factor,
/// a color blend mode, visibility, and lock flags.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub buffer: CanvasView,
    pub opacity: f32,
    pub blend_mode: ColorBlendMode,
    pub visible: bool,
    pub locked: bool,
}

impl Layer {
    /// Creates a new transparent layer initialized to `[0, 0, 0, 0]`.
    pub fn new(id: String, name: String, width: u32, height: u32) -> Self {
        Self {
            id,
            name,
            buffer: CanvasView::with_color(width, height, [0, 0, 0, 0]),
            opacity: 1.0,
            blend_mode: ColorBlendMode::Normal,
            visible: true,
            locked: false,
        }
    }

    /// Creates a layer with a specific initial fill color.
    pub fn with_color(id: String, name: String, width: u32, height: u32, fill: [u8; 4]) -> Self {
        Self {
            id,
            name,
            buffer: CanvasView::with_color(width, height, fill),
            opacity: 1.0,
            blend_mode: ColorBlendMode::Normal,
            visible: true,
            locked: false,
        }
    }

    /// Creates a duplicate of this layer with a new identifier and name.
    pub fn duplicate(&self, new_id: String, new_name: String) -> Self {
        Self {
            id: new_id,
            name: new_name,
            buffer: self.buffer.clone(),
            opacity: self.opacity,
            blend_mode: self.blend_mode,
            visible: self.visible,
            locked: false,
        }
    }

    /// Clears the layer's pixel buffer to transparent `[0, 0, 0, 0]` or a specified fill color.
    pub fn clear(&mut self, color: [u8; 4]) {
        self.buffer.clear(color);
    }

    /// Sets layer opacity in `[0.0, 1.0]`.
    pub fn set_opacity(&mut self, opacity: f32) {
        self.opacity = opacity.clamp(0.0, 1.0);
    }

    /// Sets the layer's color blend mode.
    pub fn set_blend_mode(&mut self, mode: ColorBlendMode) {
        self.blend_mode = mode;
    }

    /// Sets layer visibility.
    pub fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
    }

    /// Sets layer lock status.
    pub fn set_locked(&mut self, locked: bool) {
        self.locked = locked;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layer_creation_and_defaults() {
        let layer = Layer::new("layer-1".into(), "Layer 1".into(), 100, 100);
        assert_eq!(layer.id, "layer-1");
        assert_eq!(layer.name, "Layer 1");
        assert_eq!(layer.buffer.width, 100);
        assert_eq!(layer.buffer.height, 100);
        assert_eq!(layer.opacity, 1.0);
        assert_eq!(layer.blend_mode, ColorBlendMode::Normal);
        assert!(layer.visible);
        assert!(!layer.locked);
        assert_eq!(layer.buffer.get_pixel(0, 0), Some([0, 0, 0, 0]));
    }

    #[test]
    fn test_layer_duplicate() {
        let mut layer = Layer::new("orig".into(), "Original".into(), 10, 10);
        layer.set_opacity(0.75);
        layer.set_blend_mode(ColorBlendMode::Multiply);
        layer.buffer.as_mut_slice()[0..4].copy_from_slice(&[255, 0, 0, 255]);

        let dup = layer.duplicate("dup-1".into(), "Copy".into());
        assert_eq!(dup.id, "dup-1");
        assert_eq!(dup.name, "Copy");
        assert_eq!(dup.opacity, 0.75);
        assert_eq!(dup.blend_mode, ColorBlendMode::Multiply);
        assert_eq!(dup.buffer.get_pixel(0, 0), Some([255, 0, 0, 255]));
    }
}
