use crate::brush::blend::ColorBlendMode;
use crate::brush::canvas::CanvasView;

/// Distinguishes the functional behavior and storage backend of a layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayerKind {
    Raster,
    Vector,
    Group,
}

/// Identifies whether stylus painting targets the layer's pixel buffer or its mask.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditTarget {
    Pixels,
    Mask,
}

/// Represents a non-destructive layer mask channel attached to a layer.
///
/// The mask buffer stores grayscale luminance where 255 = fully visible,
/// 0 = fully transparent/hidden, and intermediate values represent partial opacity.
#[derive(Debug, Clone, PartialEq)]
pub struct LayerMask {
    pub buffer: CanvasView,
    pub enabled: bool,
    pub inverted: bool,
}

impl LayerMask {
    /// Creates a new layer mask filled with opaque white (`[255, 255, 255, 255]`).
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            buffer: CanvasView::with_color(width, height, [255, 255, 255, 255]),
            enabled: true,
            inverted: false,
        }
    }
}

/// Represents an individual raster or vector layer in the drawing canvas.
///
/// Each layer owns its RGBA8 pixel buffer (`CanvasView`), an opacity factor,
/// a color blend mode, visibility, lock flags, clipping mask status, and optional layer mask.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub buffer: CanvasView,
    pub opacity: f32,
    pub blend_mode: ColorBlendMode,
    pub visible: bool,
    pub locked: bool,
    pub alpha_locked: bool,
    pub is_clipped: bool,
    pub kind: LayerKind,
    pub mask: Option<LayerMask>,
    pub edit_target: EditTarget,
    pub vector_data: Option<crate::vector::VectorLayerData>,
}

impl Layer {
    /// Creates a new transparent raster layer initialized to `[0, 0, 0, 0]`.
    pub fn new(id: String, name: String, width: u32, height: u32) -> Self {
        Self {
            id,
            name,
            buffer: CanvasView::with_color(width, height, [0, 0, 0, 0]),
            opacity: 1.0,
            blend_mode: ColorBlendMode::Normal,
            visible: true,
            locked: false,
            alpha_locked: false,
            is_clipped: false,
            kind: LayerKind::Raster,
            mask: None,
            edit_target: EditTarget::Pixels,
            vector_data: None,
        }
    }

    /// Creates a new vector layer initialized with an empty vector stroke store.
    pub fn new_vector(id: String, name: String, width: u32, height: u32) -> Self {
        Self {
            id,
            name,
            buffer: CanvasView::with_color(width, height, [0, 0, 0, 0]),
            opacity: 1.0,
            blend_mode: ColorBlendMode::Normal,
            visible: true,
            locked: false,
            alpha_locked: false,
            is_clipped: false,
            kind: LayerKind::Vector,
            mask: None,
            edit_target: EditTarget::Pixels,
            vector_data: Some(crate::vector::VectorLayerData::new()),
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
            alpha_locked: false,
            is_clipped: false,
            kind: LayerKind::Raster,
            mask: None,
            edit_target: EditTarget::Pixels,
            vector_data: None,
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
            alpha_locked: self.alpha_locked,
            is_clipped: self.is_clipped,
            kind: self.kind,
            mask: self.mask.clone(),
            edit_target: self.edit_target,
            vector_data: self.vector_data.clone(),
        }
    }

    /// Clears the layer's pixel buffer to transparent `[0, 0, 0, 0]` or a specified fill color.
    pub fn clear(&mut self, color: [u8; 4]) {
        self.buffer.clear(color);
    }

    /// Sets an individual pixel color in the layer buffer.
    pub fn set_pixel(&mut self, x: u32, y: u32, color: [u8; 4]) -> bool {
        self.buffer.set_pixel(x, y, color)
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

    /// Sets layer alpha lock status (lock transparent pixels).
    pub fn set_alpha_locked(&mut self, locked: bool) {
        self.alpha_locked = locked;
    }

    /// Sets whether this layer clips its opacity to the base layer directly below it.
    pub fn set_clipped(&mut self, clipped: bool) {
        self.is_clipped = clipped;
    }

    /// Attaches an 8-bit layer mask channel initialized to white.
    pub fn add_mask(&mut self) {
        if self.mask.is_none() {
            self.mask = Some(LayerMask::new(self.buffer.width, self.buffer.height));
        }
    }

    /// Removes the attached layer mask channel.
    pub fn remove_mask(&mut self) {
        self.mask = None;
        self.edit_target = EditTarget::Pixels;
    }

    /// Sets whether the attached layer mask is enabled.
    pub fn set_mask_enabled(&mut self, enabled: bool) {
        if let Some(ref mut mask) = self.mask {
            mask.enabled = enabled;
        }
    }

    /// Sets whether the attached layer mask is inverted.
    pub fn set_mask_inverted(&mut self, inverted: bool) {
        if let Some(ref mut mask) = self.mask {
            mask.inverted = inverted;
        }
    }

    /// Sets the active editing target (pixels vs. mask).
    pub fn set_edit_target(&mut self, target: EditTarget) {
        if target == EditTarget::Mask && self.mask.is_none() {
            return;
        }
        self.edit_target = target;
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

    #[test]
    fn test_layer_mask_and_clipping_defaults() {
        let mut layer = Layer::new("layer-1".into(), "Layer 1".into(), 10, 10);
        assert!(!layer.alpha_locked);
        assert!(!layer.is_clipped);
        assert!(layer.mask.is_none());
        assert_eq!(layer.edit_target, EditTarget::Pixels);

        layer.set_alpha_locked(true);
        layer.set_clipped(true);
        layer.add_mask();
        assert!(layer.alpha_locked);
        assert!(layer.is_clipped);
        assert!(layer.mask.is_some());

        // Mask initializes to white [255, 255, 255, 255]
        let mask = layer.mask.as_ref().unwrap();
        assert_eq!(mask.buffer.get_pixel(0, 0), Some([255, 255, 255, 255]));
        assert!(mask.enabled);
        assert!(!mask.inverted);

        layer.set_edit_target(EditTarget::Mask);
        assert_eq!(layer.edit_target, EditTarget::Mask);

        let dup = layer.duplicate("dup-mask".into(), "Copy Mask".into());
        assert!(dup.alpha_locked);
        assert!(dup.is_clipped);
        assert!(dup.mask.is_some());
        assert_eq!(dup.edit_target, EditTarget::Mask);

        layer.remove_mask();
        assert!(layer.mask.is_none());
        assert_eq!(layer.edit_target, EditTarget::Pixels);
    }
}
