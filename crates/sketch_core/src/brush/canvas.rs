use std::fs::File;
use std::io::{self, BufWriter, Write};
use crate::brush::rect::Rect;

/// Contiguous 1D RGBA8 pixel buffer with row stride.
#[derive(Debug, Clone, PartialEq)]
pub struct CanvasView {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub buffer: Vec<u8>,
}

impl CanvasView {
    /// Creates a new canvas of the given dimensions initialized to opaque white (255, 255, 255, 255).
    pub fn new(width: u32, height: u32) -> Self {
        let stride = (width as usize) * 4;
        let buffer = vec![255; stride * (height as usize)];
        Self {
            width,
            height,
            stride,
            buffer,
        }
    }

    /// Creates a new canvas initialized to a specific background color.
    pub fn with_color(width: u32, height: u32, fill_color: [u8; 4]) -> Self {
        let stride = (width as usize) * 4;
        let mut buffer = vec![0u8; stride * (height as usize)];
        for pixel in buffer.chunks_exact_mut(4) {
            pixel.copy_from_slice(&fill_color);
        }
        Self {
            width,
            height,
            stride,
            buffer,
        }
    }

    /// Creates a canvas view wrapping an existing buffer.
    pub fn from_buffer(width: u32, height: u32, buffer: Vec<u8>) -> Result<Self, String> {
        let expected_len = (width as usize) * 4 * (height as usize);
        if buffer.len() != expected_len {
            return Err(format!(
                "Buffer length mismatch: expected {}, got {}",
                expected_len,
                buffer.len()
            ));
        }
        Ok(Self {
            width,
            height,
            stride: (width as usize) * 4,
            buffer,
        })
    }

    /// Fills the entire canvas with a solid color.
    pub fn clear(&mut self, color: [u8; 4]) {
        for pixel in self.buffer.chunks_exact_mut(4) {
            pixel.copy_from_slice(&color);
        }
    }

    /// Clears a rectangular sub-region to the specified RGBA color.
    pub fn clear_rect(&mut self, rect: &Rect, color: [u8; 4]) {
        let x_start = rect.x.max(0) as u32;
        let y_start = rect.y.max(0) as u32;
        let x_end = ((rect.x + rect.w).max(0) as u32).min(self.width);
        let y_end = ((rect.y + rect.h).max(0) as u32).min(self.height);

        for y in y_start..y_end {
            let row_offset = (y as usize) * self.stride;
            for x in x_start..x_end {
                let idx = row_offset + (x as usize * 4);
                self.buffer[idx..idx + 4].copy_from_slice(&color);
            }
        }
    }

    /// Returns the RGBA color at the given coordinate, or None if out of bounds.
    pub fn get_pixel(&self, x: u32, y: u32) -> Option<[u8; 4]> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let idx = (y as usize * self.stride) + (x as usize * 4);
        Some([
            self.buffer[idx],
            self.buffer[idx + 1],
            self.buffer[idx + 2],
            self.buffer[idx + 3],
        ])
    }

    /// Sets the RGBA color at the given coordinate. Returns false if out of bounds.
    pub fn set_pixel(&mut self, x: u32, y: u32, color: [u8; 4]) -> bool {
        if x >= self.width || y >= self.height {
            return false;
        }
        let idx = (y as usize * self.stride) + (x as usize * 4);
        self.buffer[idx..idx + 4].copy_from_slice(&color);
        true
    }

    /// Read-only access to the underlying byte slice.
    pub fn as_slice(&self) -> &[u8] {
        &self.buffer
    }

    /// Mutable access to the underlying byte slice.
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.buffer
    }

    /// Saves the RGBA buffer as a standard uncompressed PPM image (RGB P6 format).
    pub fn save_as_ppm(&self, file_path: &str) -> io::Result<()> {
        let file = File::create(file_path)?;
        let mut writer = BufWriter::new(file);

        let header = format!("P6\n{} {}\n255\n", self.width, self.height);
        writer.write_all(header.as_bytes())?;

        let mut row_data = vec![0u8; (self.width as usize) * 3];
        for y in 0..self.height {
            let src_row = (y as usize) * self.stride;
            for x in 0..self.width {
                let c_idx = src_row + (x as usize * 4);
                let r_idx = x as usize * 3;
                row_data[r_idx + 0] = self.buffer[c_idx + 0];
                row_data[r_idx + 1] = self.buffer[c_idx + 1];
                row_data[r_idx + 2] = self.buffer[c_idx + 2];
            }
            writer.write_all(&row_data)?;
        }
        writer.flush()?;
        Ok(())
    }

    /// Extracts a sub-rectangle of pixels from the canvas as a contiguous RGBA8 buffer.
    pub fn extract_sub_rect(&self, rect: &crate::brush::rect::Rect) -> Option<Vec<u8>> {
        let x_start = rect.x.max(0) as usize;
        let y_start = rect.y.max(0) as usize;
        let x_end = ((rect.x + rect.w).max(0) as usize).min(self.width as usize);
        let y_end = ((rect.y + rect.h).max(0) as usize).min(self.height as usize);

        if x_start >= x_end || y_start >= y_end {
            return None;
        }

        let sub_w = x_end - x_start;
        let sub_h = y_end - y_start;
        let mut out = vec![0u8; sub_w * sub_h * 4];

        for y in 0..sub_h {
            let src_row = (y_start + y) * self.stride + (x_start * 4);
            let dst_row = y * sub_w * 4;
            out[dst_row..dst_row + sub_w * 4]
                .copy_from_slice(&self.buffer[src_row..src_row + sub_w * 4]);
        }

        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_new_and_clear() {
        let mut canvas = CanvasView::new(10, 10);
        assert_eq!(canvas.buffer.len(), 400);
        assert_eq!(canvas.get_pixel(0, 0), Some([255, 255, 255, 255]));

        canvas.clear([10, 20, 30, 255]);
        assert_eq!(canvas.get_pixel(5, 5), Some([10, 20, 30, 255]));
    }
}
