/// Integer bounding rectangle used for canvas dirty regions and tile blitting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    /// Constructs a new `Rect`.
    pub fn new(x: i32, y: i32, w: i32, h: i32) -> Self {
        Self { x, y, w, h }
    }

    /// Computes the minimal bounding box enclosing both `self` and `other`.
    pub fn expand_to_include(&self, other: Option<&Rect>) -> Rect {
        match other {
            None => *self,
            Some(o) => {
                let nx = self.x.min(o.x);
                let ny = self.y.min(o.y);
                let nw = (self.x + self.w).max(o.x + o.w) - nx;
                let nh = (self.y + self.h).max(o.y + o.h) - ny;
                Rect {
                    x: nx,
                    y: ny,
                    w: nw,
                    h: nh,
                }
            }
        }
    }

    /// Checks if this rectangle intersects with another rectangle.
    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.x + other.w
            && self.x + self.w > other.x
            && self.y < other.y + other.h
            && self.y + self.h > other.y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rect_expand() {
        let r1 = Rect::new(10, 10, 20, 20);
        let r2 = Rect::new(5, 15, 10, 30);
        let expanded = r1.expand_to_include(Some(&r2));

        assert_eq!(expanded.x, 5);
        assert_eq!(expanded.y, 10);
        assert_eq!(expanded.w, 25);
        assert_eq!(expanded.h, 35);
    }
}
