use crate::brush::blend::{composite_pixel, ColorBlendMode};
use crate::brush::canvas::CanvasView;
use crate::brush::rect::Rect;
use crate::composite::layer::Layer;

/// Manages an ordered stack of drawing layers, background canvas properties,
/// and incremental dirty-rect composition into the final display framebuffer.
#[derive(Debug, Clone)]
pub struct CompositeStack {
    pub width: u32,
    pub height: u32,
    pub background_color: [u8; 4],
    pub background_visible: bool,
    pub layers: Vec<Layer>,
    pub active_layer_id: String,
    pub display_framebuffer: CanvasView,
}

impl CompositeStack {
    /// Creates a new composite stack initialized with standard white paper (`[255, 255, 255, 255]`)
    /// and a single transparent `Layer 1`.
    pub fn new(width: u32, height: u32) -> Self {
        Self::with_background(width, height, [255, 255, 255, 255], true)
    }

    /// Creates a new composite stack with custom background color and visibility.
    pub fn with_background(
        width: u32,
        height: u32,
        background_color: [u8; 4],
        background_visible: bool,
    ) -> Self {
        let initial_layer = Layer::new("layer-1".into(), "Layer 1".into(), width, height);
        let mut stack = Self {
            width,
            height,
            background_color,
            background_visible,
            layers: vec![initial_layer],
            active_layer_id: "layer-1".into(),
            display_framebuffer: CanvasView::with_color(
                width,
                height,
                if background_visible {
                    background_color
                } else {
                    [0, 0, 0, 0]
                },
            ),
        };
        stack.composite_all();
        stack
    }

    // ========================================================================
    // Layer Lifecycle & Hierarchy
    // ========================================================================

    /// Adds a new transparent layer to the top of the stack and makes it active.
    pub fn add_layer(&mut self, id: String, name: String) -> Result<(), String> {
        if self.layers.iter().any(|l| l.id == id) {
            return Err(format!("Layer with id '{}' already exists", id));
        }
        let layer = Layer::new(id.clone(), name, self.width, self.height);
        self.layers.push(layer);
        self.active_layer_id = id;
        self.composite_all();
        Ok(())
    }

    /// Inserts a new layer at the specified index.
    pub fn insert_layer(&mut self, index: usize, layer: Layer) -> Result<(), String> {
        if self.layers.iter().any(|l| l.id == layer.id) {
            return Err(format!("Layer with id '{}' already exists", layer.id));
        }
        let idx = index.min(self.layers.len());
        self.active_layer_id = layer.id.clone();
        self.layers.insert(idx, layer);
        self.composite_all();
        Ok(())
    }

    /// Removes the specified layer.
    ///
    /// Fails if the user attempts to delete the last remaining layer.
    pub fn remove_layer(&mut self, id: &str) -> Result<Layer, String> {
        if self.layers.len() <= 1 {
            return Err("Cannot delete the only remaining layer".into());
        }

        let pos = self
            .layers
            .iter()
            .position(|l| l.id == id)
            .ok_or_else(|| format!("Layer '{}' not found", id))?;

        let removed = self.layers.remove(pos);

        // If the removed layer was active, switch active layer to nearest neighbor
        if self.active_layer_id == id {
            let next_idx = if pos < self.layers.len() {
                pos
            } else {
                self.layers.len() - 1
            };
            self.active_layer_id = self.layers[next_idx].id.clone();
        }

        self.composite_all();
        Ok(removed)
    }

    /// Duplicates an existing layer, placing the copy immediately above the original.
    pub fn duplicate_layer(
        &mut self,
        source_id: &str,
        new_id: String,
        new_name: String,
    ) -> Result<(), String> {
        if self.layers.iter().any(|l| l.id == new_id) {
            return Err(format!("Layer with id '{}' already exists", new_id));
        }

        let pos = self
            .layers
            .iter()
            .position(|l| l.id == source_id)
            .ok_or_else(|| format!("Layer '{}' not found", source_id))?;

        let copy = self.layers[pos].duplicate(new_id.clone(), new_name);
        self.layers.insert(pos + 1, copy);
        self.active_layer_id = new_id;
        self.composite_all();
        Ok(())
    }

    /// Sets the active drawing layer.
    pub fn set_active_layer(&mut self, id: &str) -> bool {
        if self.layers.iter().any(|l| l.id == id) {
            self.active_layer_id = id.to_string();
            true
        } else {
            false
        }
    }

    /// Returns a shared reference to the active layer.
    pub fn active_layer(&self) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == self.active_layer_id)
    }

    /// Returns a mutable reference to the active layer.
    pub fn active_layer_mut(&mut self) -> Option<&mut Layer> {
        let active_id = self.active_layer_id.clone();
        self.layers.iter_mut().find(|l| l.id == active_id)
    }

    /// Finds a layer by identifier.
    pub fn get_layer(&self, id: &str) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == id)
    }

    /// Finds a layer mutably by identifier.
    pub fn get_layer_mut(&mut self, id: &str) -> Option<&mut Layer> {
        self.layers.iter_mut().find(|l| l.id == id)
    }

    /// Reorders layers according to the provided list of layer IDs.
    pub fn reorder_layers(&mut self, ordered_ids: &[String]) -> Result<(), String> {
        if ordered_ids.len() != self.layers.len() {
            return Err("Reorder IDs count does not match current layers count".into());
        }

        let mut reordered = Vec::with_capacity(self.layers.len());
        for id in ordered_ids {
            let pos = self
                .layers
                .iter()
                .position(|l| l.id == *id)
                .ok_or_else(|| format!("Layer '{}' not found during reorder", id))?;
            reordered.push(self.layers.remove(pos));
        }

        self.layers = reordered;
        self.composite_all();
        Ok(())
    }

    // ========================================================================
    // Layer Properties & State
    // ========================================================================

    /// Sets layer opacity and updates the composite output.
    pub fn set_layer_opacity(&mut self, id: &str, opacity: f32) -> bool {
        if let Some(l) = self.get_layer_mut(id) {
            l.set_opacity(opacity);
            self.composite_all();
            true
        } else {
            false
        }
    }

    /// Sets layer color blend mode and updates the composite output.
    pub fn set_layer_blend_mode(&mut self, id: &str, mode: ColorBlendMode) -> bool {
        if let Some(l) = self.get_layer_mut(id) {
            l.set_blend_mode(mode);
            self.composite_all();
            true
        } else {
            false
        }
    }

    /// Sets layer visibility and updates the composite output.
    pub fn set_layer_visibility(&mut self, id: &str, visible: bool) -> bool {
        if let Some(l) = self.get_layer_mut(id) {
            l.set_visible(visible);
            self.composite_all();
            true
        } else {
            false
        }
    }

    /// Clears the pixels of the active layer to transparent `[0, 0, 0, 0]`.
    pub fn clear_active_layer(&mut self) {
        if let Some(l) = self.active_layer_mut() {
            l.clear([0, 0, 0, 0]);
            self.composite_all();
        }
    }

    /// Sets the solid paper canvas background color.
    pub fn set_background_color(&mut self, color: [u8; 4]) {
        self.background_color = color;
        self.composite_all();
    }

    /// Sets whether the background paper canvas is visible.
    pub fn set_background_visible(&mut self, visible: bool) {
        self.background_visible = visible;
        self.composite_all();
    }

    // ========================================================================
    // Incremental & Full Compositing Pipeline
    // ========================================================================

    /// Re-composites the entire stack into `display_framebuffer`.
    pub fn composite_all(&mut self) {
        let full_rect = Rect::new(0, 0, self.width as i32, self.height as i32);
        self.composite_rect(&full_rect);
    }

    /// Re-composites only the pixels within `dirty_rect` across all visible layers into `display_framebuffer`.
    ///
    /// This sub-millisecond incremental update enables 120Hz-240Hz stylus response
    /// without re-evaluating unchanged portions of 4K+ artboards.
    pub fn composite_rect(&mut self, dirty_rect: &Rect) {
        let x_start = dirty_rect.x.max(0) as u32;
        let y_start = dirty_rect.y.max(0) as u32;
        let x_end = ((dirty_rect.x + dirty_rect.w).max(0) as u32).min(self.width);
        let y_end = ((dirty_rect.y + dirty_rect.h).max(0) as u32).min(self.height);

        if x_start >= x_end || y_start >= y_end {
            return;
        }

        let bg = if self.background_visible {
            self.background_color
        } else {
            [0, 0, 0, 0]
        };

        let stride = self.display_framebuffer.stride;

        for y in y_start..y_end {
            let row_offset = (y as usize) * stride;

            for x in x_start..x_end {
                let pixel_offset = row_offset + (x as usize * 4);

                let mut current_color = bg;

                for layer in &self.layers {
                    if !layer.visible || layer.opacity <= 0.0001 {
                        continue;
                    }

                    let l_buf = &layer.buffer.buffer;
                    let src_a = l_buf[pixel_offset + 3];
                    if src_a == 0 {
                        continue;
                    }

                    let src = [
                        l_buf[pixel_offset],
                        l_buf[pixel_offset + 1],
                        l_buf[pixel_offset + 2],
                        src_a,
                    ];

                    // Ultra-fast integer path for standard Normal layer composited over solid paper
                    if layer.blend_mode == ColorBlendMode::Normal && layer.opacity >= 0.999 && current_color[3] == 255 {
                        let sa = src_a as u32;
                        if sa == 255 {
                            current_color = [src[0], src[1], src[2], 255];
                        } else {
                            let inv_sa = 255 - sa;
                            current_color[0] = ((src[0] as u32 * sa + current_color[0] as u32 * inv_sa + 127) / 255) as u8;
                            current_color[1] = ((src[1] as u32 * sa + current_color[1] as u32 * inv_sa + 127) / 255) as u8;
                            current_color[2] = ((src[2] as u32 * sa + current_color[2] as u32 * inv_sa + 127) / 255) as u8;
                            current_color[3] = 255;
                        }
                    } else {
                        current_color =
                            composite_pixel(current_color, src, layer.opacity, layer.blend_mode);
                    }
                }

                self.display_framebuffer.buffer[pixel_offset..pixel_offset + 4]
                    .copy_from_slice(&current_color);
            }
        }
    }

    // ========================================================================
    // Display Output Accessors
    // ========================================================================

    /// Read-only access to the final composited RGBA8 display framebuffer.
    pub fn get_display_pixels(&self) -> &[u8] {
        self.display_framebuffer.as_slice()
    }

    /// Read-only reference to the display CanvasView.
    pub fn get_display_framebuffer(&self) -> &CanvasView {
        &self.display_framebuffer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composite_stack_initialization() {
        let stack = CompositeStack::new(100, 100);
        assert_eq!(stack.layers.len(), 1);
        assert_eq!(stack.active_layer_id, "layer-1");
        assert_eq!(stack.background_color, [255, 255, 255, 255]);
        assert!(stack.background_visible);

        // Output buffer must be opaque white
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([255, 255, 255, 255])
        );
    }

    #[test]
    fn test_composite_active_layer_drawing() {
        let mut stack = CompositeStack::new(10, 10);

        // Paint red pixel on active layer
        {
            let active = stack.active_layer_mut().unwrap();
            active.buffer.as_mut_slice()[0..4].copy_from_slice(&[255, 0, 0, 255]);
        }

        // Composite dirty rect of (0, 0, 1, 1)
        stack.composite_rect(&Rect::new(0, 0, 1, 1));

        // Display framebuffer at (0, 0) should now be red
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([255, 0, 0, 255])
        );
        // Untouched pixels remain white paper
        assert_eq!(
            stack.display_framebuffer.get_pixel(1, 1),
            Some([255, 255, 255, 255])
        );
    }

    #[test]
    fn test_composite_layer_multiply_over_paper() {
        let mut stack = CompositeStack::new(10, 10);

        // Add Layer 2 with Multiply blend mode
        stack.add_layer("layer-2".into(), "Multiply Layer".into()).unwrap();
        stack.set_layer_blend_mode("layer-2", ColorBlendMode::Multiply);

        // Paint 50% gray (128, 128, 128, 255) on Layer 2
        {
            let active = stack.active_layer_mut().unwrap();
            active.buffer.as_mut_slice()[0..4].copy_from_slice(&[128, 128, 128, 255]);
        }

        stack.composite_rect(&Rect::new(0, 0, 1, 1));

        // Multiply 128 against white background 255 -> (128 * 255) / 255 = 128
        let pixel = stack.display_framebuffer.get_pixel(0, 0).unwrap();
        assert_eq!(pixel[0], 128);
        assert_eq!(pixel[1], 128);
        assert_eq!(pixel[2], 128);
        assert_eq!(pixel[3], 255);
    }

    #[test]
    fn test_composite_layer_parallel_blend_mode() {
        let mut stack = CompositeStack::new(10, 10);

        // Layer 1 has color [100, 100, 100, 255]
        {
            let l1 = stack.active_layer_mut().unwrap();
            l1.buffer.as_mut_slice()[0..4].copy_from_slice(&[100, 100, 100, 255]);
        }

        // Add Layer 2 with Parallel blend mode and color [200, 200, 200, 255]
        stack.add_layer("layer-2".into(), "Parallel Layer".into()).unwrap();
        stack.set_layer_blend_mode("layer-2", ColorBlendMode::Parallel);
        {
            let l2 = stack.active_layer_mut().unwrap();
            l2.buffer.as_mut_slice()[0..4].copy_from_slice(&[200, 200, 200, 255]);
        }

        stack.composite_all();

        // Harmonic mean of 100 and 200: 2 * 100 * 200 / (100 + 200) = 40000 / 300 = 133.33 -> 133
        let pixel = stack.display_framebuffer.get_pixel(0, 0).unwrap();
        assert_eq!(pixel[0], 133);
        assert_eq!(pixel[1], 133);
        assert_eq!(pixel[2], 133);
        assert_eq!(pixel[3], 255);
    }

    #[test]
    fn test_layer_opacity_and_visibility() {
        let mut stack = CompositeStack::new(10, 10);

        // Paint black on Layer 1
        {
            let l1 = stack.active_layer_mut().unwrap();
            l1.buffer.as_mut_slice()[0..4].copy_from_slice(&[0, 0, 0, 255]);
        }

        // At 100% opacity, output is black
        stack.composite_all();
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([0, 0, 0, 255])
        );

        // At 50% opacity, black over white paper yields ~128
        stack.set_layer_opacity("layer-1", 0.5);
        let p50 = stack.display_framebuffer.get_pixel(0, 0).unwrap();
        assert!((p50[0] as i32 - 128).abs() <= 1);

        // Hidden layer reveals background paper
        stack.set_layer_visibility("layer-1", false);
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([255, 255, 255, 255])
        );
    }

    #[test]
    fn test_reorder_layers() {
        let mut stack = CompositeStack::new(10, 10);
        stack.add_layer("layer-2".into(), "Layer 2".into()).unwrap();

        // Paint red on layer 1, blue on layer 2
        stack.get_layer_mut("layer-1").unwrap().buffer.as_mut_slice()[0..4]
            .copy_from_slice(&[255, 0, 0, 255]);
        stack.get_layer_mut("layer-2").unwrap().buffer.as_mut_slice()[0..4]
            .copy_from_slice(&[0, 0, 255, 255]);

        // Default: layer-2 is on top -> blue
        stack.composite_all();
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([0, 0, 255, 255])
        );

        // Reorder: layer-1 on top -> red
        stack
            .reorder_layers(&["layer-2".into(), "layer-1".into()])
            .unwrap();
        assert_eq!(
            stack.display_framebuffer.get_pixel(0, 0),
            Some([255, 0, 0, 255])
        );
    }
}
