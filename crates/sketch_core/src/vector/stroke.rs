use crate::brush::blend::ColorBlendMode;
use crate::brush::rect::Rect;
use crate::stroke::event::StrokeEvent;

/// Represents a single resolution-independent vector stroke drawn with pen/brush dynamics.
///
/// Stores raw and smoothed trajectory events, brush material parameters, and spatial bounds.
#[derive(Debug, Clone, PartialEq)]
pub struct VectorStroke {
    pub id: String,
    pub events: Vec<StrokeEvent>,
    pub color: [u8; 4],
    pub base_diameter: f32,
    pub opacity: f32,
    pub blend_mode: ColorBlendMode,
    pub bounds: Rect,
}

impl VectorStroke {
    /// Creates a new `VectorStroke` from a sequence of stroke events and style properties.
    pub fn new(
        id: String,
        events: Vec<StrokeEvent>,
        color: [u8; 4],
        base_diameter: f32,
        opacity: f32,
        blend_mode: ColorBlendMode,
    ) -> Self {
        let bounds = Self::calculate_bounds(&events, base_diameter);
        Self {
            id,
            events,
            color,
            base_diameter,
            opacity,
            blend_mode,
            bounds,
        }
    }

    /// Computes the bounding rectangle encompassing all stroke events plus radius margin.
    pub fn calculate_bounds(events: &[StrokeEvent], base_diameter: f32) -> Rect {
        if events.is_empty() {
            return Rect::new(0, 0, 0, 0);
        }

        let margin = (base_diameter * 0.5).ceil() as i32 + 2;
        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;

        for e in events {
            if e.x < min_x { min_x = e.x; }
            if e.x > max_x { max_x = e.x; }
            if e.y < min_y { min_y = e.y; }
            if e.y > max_y { max_y = e.y; }
        }

        let left = (min_x.floor() as i32) - margin;
        let top = (min_y.floor() as i32) - margin;
        let right = (max_x.ceil() as i32) + margin;
        let bottom = (max_y.ceil() as i32) + margin;

        Rect::new(left, top, (right - left).max(1), (bottom - top).max(1))
    }

    /// Recomputes internal bounding box.
    pub fn update_bounds(&mut self) {
        self.bounds = Self::calculate_bounds(&self.events, self.base_diameter);
    }

    /// Calculates minimum Euclidean distance from a test point (px, py) to the stroke polyline.
    pub fn distance_to_point(&self, px: f32, py: f32) -> f32 {
        if self.events.is_empty() {
            return f32::MAX;
        }
        if self.events.len() == 1 {
            let e = &self.events[0];
            return ((px - e.x).powi(2) + (py - e.y).powi(2)).sqrt();
        }

        let mut min_dist_sq = f32::MAX;

        for i in 0..self.events.len() - 1 {
            let p1 = &self.events[i];
            let p2 = &self.events[i + 1];

            let dist_sq = dist_to_segment_squared(px, py, p1.x, p1.y, p2.x, p2.y);
            if dist_sq < min_dist_sq {
                min_dist_sq = dist_sq;
            }
        }

        min_dist_sq.sqrt()
    }

    /// Returns true if the test point (px, py) touches this stroke within brush radius + extra tolerance.
    pub fn hit_test(&self, px: f32, py: f32, tolerance: f32) -> bool {
        let max_dist = (self.base_diameter * 0.5) + tolerance;
        self.distance_to_point(px, py) <= max_dist
    }

    /// Scales the line width of this stroke by a multiplier.
    pub fn scale_width(&mut self, factor: f32) {
        self.base_diameter = (self.base_diameter * factor).clamp(0.5, 500.0);
        self.update_bounds();
    }

    /// Finds all 2D intersection points between this stroke and another stroke.
    pub fn find_intersections_with(&self, other: &VectorStroke) -> Vec<(f32, f32)> {
        let mut intersections = Vec::new();
        if self.events.len() < 2 || other.events.len() < 2 {
            return intersections;
        }

        for i in 0..self.events.len() - 1 {
            let a1 = &self.events[i];
            let a2 = &self.events[i + 1];

            for j in 0..other.events.len() - 1 {
                let b1 = &other.events[j];
                let b2 = &other.events[j + 1];

                if let Some(pt) = line_segment_intersection(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) {
                    intersections.push(pt);
                }
            }
        }

        intersections
    }

    /// Erases the touched segment of this stroke up to the nearest line intersections (CSP style).
    ///
    /// If there are intersections, divides the stroke into segments bounded by intersections
    /// and trims off the segment containing (hit_x, hit_y).
    /// Returns None if the entire stroke was removed, or Some(trimmed_stroke) with remaining points.
    pub fn trim_to_intersection(&self, hit_x: f32, hit_y: f32, intersections: &[(f32, f32)]) -> Option<VectorStroke> {
        if self.events.len() < 2 || intersections.is_empty() {
            return None; // No intersection: whole stroke is removed
        }

        // Find closest point index on stroke to (hit_x, hit_y)
        let mut best_idx = 0;
        let mut best_dist = f32::MAX;
        for (i, e) in self.events.iter().enumerate() {
            let d = (e.x - hit_x).powi(2) + (e.y - hit_y).powi(2);
            if d < best_dist {
                best_dist = d;
                best_idx = i;
            }
        }

        // Project intersections onto stroke event indices
        let mut split_indices = Vec::new();
        for &(ix, iy) in intersections {
            let mut nearest_idx = 0;
            let mut nearest_dist = f32::MAX;
            for (idx, e) in self.events.iter().enumerate() {
                let d = (e.x - ix).powi(2) + (e.y - iy).powi(2);
                if d < nearest_dist {
                    nearest_dist = d;
                    nearest_idx = idx;
                }
            }
            split_indices.push(nearest_idx);
        }
        split_indices.sort_unstable();
        split_indices.dedup();

        // Find which interval contains best_idx
        // If best_idx is before the first intersection, keep points from first intersection to end
        if let Some(&first_split) = split_indices.first() {
            if best_idx <= first_split {
                if first_split + 1 < self.events.len() {
                    let mut trimmed = self.clone();
                    trimmed.events = self.events[first_split..].to_vec();
                    trimmed.update_bounds();
                    return Some(trimmed);
                } else {
                    return None;
                }
            }
        }

        // If best_idx is after the last intersection, keep points from start to last intersection
        if let Some(&last_split) = split_indices.last() {
            if best_idx >= last_split {
                if last_split > 0 {
                    let mut trimmed = self.clone();
                    trimmed.events = self.events[..=last_split].to_vec();
                    trimmed.update_bounds();
                    return Some(trimmed);
                } else {
                    return None;
                }
            }
        }

        // If best_idx is between two intersections, keep the longest remaining segment
        let mut left_split = 0;
        let mut right_split = self.events.len() - 1;
        for &idx in &split_indices {
            if idx < best_idx {
                left_split = idx;
            } else if idx > best_idx {
                right_split = idx;
                break;
            }
        }

        let left_count = left_split + 1;
        let right_count = self.events.len() - right_split;

        if left_count >= right_count && left_count >= 2 {
            let mut trimmed = self.clone();
            trimmed.events = self.events[..=left_split].to_vec();
            trimmed.update_bounds();
            Some(trimmed)
        } else if right_count >= 2 {
            let mut trimmed = self.clone();
            trimmed.events = self.events[right_split..].to_vec();
            trimmed.update_bounds();
            Some(trimmed)
        } else {
            None
        }
    }
}

/// Helper: Squared distance from point (px, py) to line segment (x1, y1)-(x2, y2).
fn dist_to_segment_squared(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len_sq = dx * dx + dy * dy;

    if len_sq <= 0.000001 {
        return (px - x1).powi(2) + (py - y1).powi(2);
    }

    let t = (((px - x1) * dx + (py - y1) * dy) / len_sq).clamp(0.0, 1.0);
    let proj_x = x1 + t * dx;
    let proj_y = y1 + t * dy;

    (px - proj_x).powi(2) + (py - proj_y).powi(2)
}

/// Helper: Finds exact 2D intersection point between two line segments, if any.
fn line_segment_intersection(
    x1: f32, y1: f32, x2: f32, y2: f32,
    x3: f32, y3: f32, x4: f32, y4: f32,
) -> Option<(f32, f32)> {
    let d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if d.abs() < 1e-6 {
        return None; // Parallel or collinear
    }

    let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    let u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;

    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        Some((x1 + t * (x2 - x1), y1 + t * (y2 - y1)))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector_stroke_distance_and_bounds() {
        let events = vec![
            StrokeEvent::new(10.0, 10.0, 1.0, 0.0),
            StrokeEvent::new(50.0, 10.0, 1.0, 0.1),
        ];
        let stroke = VectorStroke::new(
            "stroke-1".into(),
            events,
            [0, 0, 0, 255],
            10.0,
            1.0,
            ColorBlendMode::Normal,
        );

        // Point directly on segment
        assert!(stroke.distance_to_point(30.0, 10.0) < 0.001);
        // Point 5 units above segment
        assert!((stroke.distance_to_point(30.0, 15.0) - 5.0).abs() < 0.001);
        // Hit test inside radius (radius = 5.0, tolerance = 1.0 -> max 6.0)
        assert!(stroke.hit_test(30.0, 15.0, 1.0));
        assert!(!stroke.hit_test(30.0, 20.0, 1.0));
    }

    #[test]
    fn test_vector_stroke_intersection_detection() {
        // Horizontal stroke from (0, 50) to (100, 50)
        let stroke_a = VectorStroke::new(
            "a".into(),
            vec![
                StrokeEvent::new(0.0, 50.0, 1.0, 0.0),
                StrokeEvent::new(100.0, 50.0, 1.0, 0.1),
            ],
            [0, 0, 0, 255],
            5.0,
            1.0,
            ColorBlendMode::Normal,
        );

        // Vertical stroke from (50, 0) to (50, 100)
        let stroke_b = VectorStroke::new(
            "b".into(),
            vec![
                StrokeEvent::new(50.0, 0.0, 1.0, 0.0),
                StrokeEvent::new(50.0, 100.0, 1.0, 0.1),
            ],
            [0, 0, 0, 255],
            5.0,
            1.0,
            ColorBlendMode::Normal,
        );

        let intersections = stroke_a.find_intersections_with(&stroke_b);
        assert_eq!(intersections.len(), 1);
        assert!((intersections[0].0 - 50.0).abs() < 0.001);
        assert!((intersections[0].1 - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_vector_stroke_trim_to_intersection() {
        // Line from (0, 50) to (100, 50) with 5 samples
        let events = vec![
            StrokeEvent::new(0.0, 50.0, 1.0, 0.0),
            StrokeEvent::new(25.0, 50.0, 1.0, 0.02),
            StrokeEvent::new(50.0, 50.0, 1.0, 0.04), // Intersection here!
            StrokeEvent::new(75.0, 50.0, 1.0, 0.06),
            StrokeEvent::new(100.0, 50.0, 1.0, 0.08),
        ];
        let stroke = VectorStroke::new(
            "trim-test".into(),
            events,
            [0, 0, 0, 255],
            5.0,
            1.0,
            ColorBlendMode::Normal,
        );

        let intersections = vec![(50.0, 50.0)];

        // Touching the tail at (90.0, 50.0) should trim off the right side and keep [0..=50]
        let trimmed = stroke.trim_to_intersection(90.0, 50.0, &intersections);
        assert!(trimmed.is_some());
        let trimmed = trimmed.unwrap();
        assert_eq!(trimmed.events.len(), 3);
        assert_eq!(trimmed.events[0].x, 0.0);
        assert_eq!(trimmed.events[2].x, 50.0);
    }
}
