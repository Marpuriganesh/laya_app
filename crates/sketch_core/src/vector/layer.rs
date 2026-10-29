use crate::brush::rect::Rect;
use crate::vector::stroke::VectorStroke;

/// Holds and manages all vector stroke objects belonging to a Vector Layer.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct VectorLayerData {
    pub strokes: Vec<VectorStroke>,
}

impl VectorLayerData {
    /// Creates an empty vector layer.
    pub fn new() -> Self {
        Self {
            strokes: Vec::new(),
        }
    }

    /// Appends a new completed vector stroke.
    pub fn add_stroke(&mut self, stroke: VectorStroke) {
        self.strokes.push(stroke);
    }

    /// Removes a stroke by identifier.
    pub fn remove_stroke(&mut self, id: &str) -> Option<VectorStroke> {
        let pos = self.strokes.iter().position(|s| s.id == id)?;
        Some(self.strokes.remove(pos))
    }

    /// Returns the total number of vector strokes.
    pub fn stroke_count(&self) -> usize {
        self.strokes.len()
    }

    /// Finds all intersections between the stroke at `target_idx` and all other strokes in this layer.
    pub fn find_intersections_for_stroke(&self, target_idx: usize) -> Vec<(f32, f32)> {
        let mut results = Vec::new();
        if target_idx >= self.strokes.len() {
            return results;
        }

        let target = &self.strokes[target_idx];
        for (i, other) in self.strokes.iter().enumerate() {
            if i == target_idx {
                continue;
            }
            // Fast bounding box intersection rejection
            if !target.bounds.intersects(&other.bounds) {
                continue;
            }
            let pts = target.find_intersections_with(other);
            results.extend(pts);
        }

        results
    }

    /// Erases vector strokes touching (x, y) within brush `radius`.
    ///
    /// If `erase_to_intersection` is true (CSP manga inking style):
    /// Computes intersections with other lines and trims off the segment up to the crossing point.
    /// If false:
    /// Deletes the entire stroke object touched.
    ///
    /// Returns the combined dirty `Rect` of all modified strokes to re-render.
    pub fn erase_at(
        &mut self,
        x: f32,
        y: f32,
        radius: f32,
        erase_to_intersection: bool,
    ) -> Option<Rect> {
        let mut combined_dirty: Option<Rect> = None;
        let mut i = 0;

        while i < self.strokes.len() {
            let stroke = &self.strokes[i];
            if !stroke.hit_test(x, y, radius) {
                i += 1;
                continue;
            }

            // Expand dirty rect to cover original stroke area
            combined_dirty = match combined_dirty {
                None => Some(stroke.bounds),
                Some(curr) => Some(curr.expand_to_include(Some(&stroke.bounds))),
            };

            if erase_to_intersection {
                let intersections = self.find_intersections_for_stroke(i);
                if let Some(trimmed) = stroke.trim_to_intersection(x, y, &intersections) {
                    self.strokes[i] = trimmed;
                    i += 1;
                } else {
                    self.strokes.remove(i);
                }
            } else {
                // Erase whole line
                self.strokes.remove(i);
            }
        }

        combined_dirty
    }

    /// Scales the line width of all strokes (or a specific stroke) by `factor`.
    pub fn adjust_line_width(&mut self, stroke_id: Option<&str>, factor: f32) -> Option<Rect> {
        let mut combined: Option<Rect> = None;

        for stroke in &mut self.strokes {
            if let Some(target_id) = stroke_id {
                if stroke.id != target_id {
                    continue;
                }
            }
            combined = match combined {
                None => Some(stroke.bounds),
                Some(c) => Some(c.expand_to_include(Some(&stroke.bounds))),
            };
            stroke.scale_width(factor);
            combined = match combined {
                None => Some(stroke.bounds),
                Some(c) => Some(c.expand_to_include(Some(&stroke.bounds))),
            };
        }

        combined
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brush::blend::ColorBlendMode;
    use crate::stroke::event::StrokeEvent;

    #[test]
    fn test_vector_layer_erase_whole_line() {
        let mut vlayer = VectorLayerData::new();
        let stroke1 = VectorStroke::new(
            "s1".into(),
            vec![
                StrokeEvent::new(0.0, 10.0, 1.0, 0.0),
                StrokeEvent::new(100.0, 10.0, 1.0, 0.1),
            ],
            [0, 0, 0, 255],
            6.0,
            1.0,
            ColorBlendMode::Normal,
        );
        vlayer.add_stroke(stroke1);
        assert_eq!(vlayer.stroke_count(), 1);

        // Touching (50, 10) with radius 2 erases the stroke completely
        let dirty = vlayer.erase_at(50.0, 10.0, 2.0, false);
        assert!(dirty.is_some());
        assert_eq!(vlayer.stroke_count(), 0);
    }

    #[test]
    fn test_vector_layer_erase_to_intersection() {
        let mut vlayer = VectorLayerData::new();

        // Horizontal line from (0, 50) to (100, 50) with 5 samples
        let horiz = VectorStroke::new(
            "horiz".into(),
            vec![
                StrokeEvent::new(0.0, 50.0, 1.0, 0.0),
                StrokeEvent::new(25.0, 50.0, 1.0, 0.02),
                StrokeEvent::new(50.0, 50.0, 1.0, 0.04),
                StrokeEvent::new(75.0, 50.0, 1.0, 0.06),
                StrokeEvent::new(100.0, 50.0, 1.0, 0.08),
            ],
            [0, 0, 0, 255],
            4.0,
            1.0,
            ColorBlendMode::Normal,
        );

        // Vertical line from (50, 0) to (50, 100)
        let vert = VectorStroke::new(
            "vert".into(),
            vec![
                StrokeEvent::new(50.0, 0.0, 1.0, 0.0),
                StrokeEvent::new(50.0, 100.0, 1.0, 0.1),
            ],
            [0, 0, 0, 255],
            4.0,
            1.0,
            ColorBlendMode::Normal,
        );

        vlayer.add_stroke(horiz);
        vlayer.add_stroke(vert);

        // Erase right protruding tail of horizontal line at (90, 50)
        let dirty = vlayer.erase_at(90.0, 50.0, 2.0, true);
        assert!(dirty.is_some());

        // Both strokes still exist, but the horizontal one is trimmed up to (50, 50)!
        assert_eq!(vlayer.stroke_count(), 2);
        let trimmed_horiz = &vlayer.strokes[0];
        assert_eq!(trimmed_horiz.events.len(), 3);
        assert_eq!(trimmed_horiz.events.last().unwrap().x, 50.0);
    }
}
