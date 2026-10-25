use std::collections::HashMap;
use std::sync::Arc;
use crate::brush::texture::PatternData;
use crate::brush::tip::PredefinedTipData;

/// Metadata describing a registered brush tip resource.
#[derive(Debug, Clone, PartialEq)]
pub struct TipResourceMeta {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_color: bool,
}

/// Metadata describing a registered seamless pattern texture resource.
#[derive(Debug, Clone, PartialEq)]
pub struct PatternResourceMeta {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

/// In-memory registry storing predefined brush tip raster stamps.
#[derive(Debug, Default, Clone)]
pub struct TipRegistry {
    tips: HashMap<String, (TipResourceMeta, Arc<PredefinedTipData>)>,
}

impl TipRegistry {
    pub fn new() -> Self {
        Self {
            tips: HashMap::new(),
        }
    }

    /// Registers a predefined tip.
    pub fn register(&mut self, id: String, name: String, tip: PredefinedTipData) {
        let meta = TipResourceMeta {
            id: id.clone(),
            name,
            width: tip.width,
            height: tip.height,
            is_color: tip.color_data.is_some(),
        };
        self.tips.insert(id, (meta, Arc::new(tip)));
    }

    /// Retrieves a tip by identifier.
    pub fn get(&self, id: &str) -> Option<Arc<PredefinedTipData>> {
        self.tips.get(id).map(|(_, tip)| Arc::clone(tip))
    }

    /// Lists metadata for all registered tips.
    pub fn list(&self) -> Vec<TipResourceMeta> {
        let mut list: Vec<_> = self.tips.values().map(|(meta, _)| meta.clone()).collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    /// Removes a tip by identifier.
    pub fn unregister(&mut self, id: &str) -> bool {
        self.tips.remove(id).is_some()
    }
}

/// In-memory registry storing seamless paper grain patterns.
#[derive(Debug, Default, Clone)]
pub struct PatternRegistry {
    patterns: HashMap<String, (PatternResourceMeta, Arc<PatternData>)>,
}

impl PatternRegistry {
    pub fn new() -> Self {
        Self {
            patterns: HashMap::new(),
        }
    }

    /// Registers a seamless pattern.
    pub fn register(&mut self, id: String, name: String, pattern: PatternData) {
        let meta = PatternResourceMeta {
            id: id.clone(),
            name,
            width: pattern.width,
            height: pattern.height,
        };
        self.patterns.insert(id, (meta, Arc::new(pattern)));
    }

    /// Retrieves a pattern by identifier.
    pub fn get(&self, id: &str) -> Option<Arc<PatternData>> {
        self.patterns.get(id).map(|(_, pat)| Arc::clone(pat))
    }

    /// Lists metadata for all registered patterns.
    pub fn list(&self) -> Vec<PatternResourceMeta> {
        let mut list: Vec<_> = self.patterns.values().map(|(meta, _)| meta.clone()).collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    /// Removes a pattern by identifier.
    pub fn unregister(&mut self, id: &str) -> bool {
        self.patterns.remove(id).is_some()
    }
}

// ============================================================================
// File Format Parsers: GBR (GIMP/Krita Brush) and PAT (Pattern)
// ============================================================================

/// Parses standard GIMP / Krita `.gbr` brush file bytes.
///
/// GBR v2 Binary Layout (Big-Endian):
/// - `header_size`: u32 (total header length in bytes, typically 20 or 28+)
/// - `version`: u32 (1 or 2)
/// - `width`: u32
/// - `height`: u32
/// - `bytes_per_pixel`: u32 (1 = grayscale mask, 4 = RGBA)
/// - If `version == 2`:
///   - `magic`: u32 (0x47494D50 = "GIMP")
///   - `spacing`: u32
/// - `description`: null-terminated UTF-8/ASCII string
/// - `data`: raw pixel bytes
pub fn parse_gbr(bytes: &[u8]) -> Result<(PredefinedTipData, String), String> {
    if bytes.len() < 20 {
        return Err("GBR file too small for header".into());
    }

    let read_u32 = |offset: usize| -> u32 {
        u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    };

    let header_size = read_u32(0) as usize;
    let version = read_u32(4);
    let width = read_u32(8);
    let height = read_u32(12);
    let bytes_per_pixel = read_u32(16);

    if width == 0 || height == 0 || width > 16384 || height > 16384 {
        return Err(format!("Invalid GBR dimensions: {}x{}", width, height));
    }

    if bytes_per_pixel != 1 && bytes_per_pixel != 4 {
        return Err(format!("Unsupported GBR bytes per pixel: {}", bytes_per_pixel));
    }

    let desc_offset = if version == 2 && header_size >= 28 {
        28
    } else {
        20
    };

    let name = if header_size > desc_offset && header_size <= bytes.len() {
        let desc_slice = &bytes[desc_offset..header_size];
        let null_pos = desc_slice.iter().position(|&b| b == 0).unwrap_or(desc_slice.len());
        String::from_utf8_lossy(&desc_slice[..null_pos]).trim().to_string()
    } else {
        "GBR Brush".to_string()
    };

    let expected_data_len = (width as usize) * (height as usize) * (bytes_per_pixel as usize);
    let data_start = header_size;
    let data_end = data_start + expected_data_len;

    if bytes.len() < data_end {
        return Err(format!(
            "GBR data truncated: expected {} data bytes, got {}",
            expected_data_len,
            bytes.len().saturating_sub(data_start)
        ));
    }

    let raw_data = &bytes[data_start..data_end];

    let tip = if bytes_per_pixel == 1 {
        // Standard Brush Tip: White is the color (255 = full opacity), Black is transparent (0 = no alpha). Do NOT invert.
        PredefinedTipData::from_gbr_grayscale(width, height, raw_data, false)
    } else {
        PredefinedTipData::from_rgba(width, height, raw_data)
    };

    Ok((tip, if name.is_empty() { "GBR Brush".into() } else { name }))
}

/// Parses standard GIMP / Photoshop `.pat` pattern file bytes.
///
/// PAT Binary Layout (Big-Endian):
/// - `header_size`: u32 (total header length in bytes, typically 24+)
/// - `version`: u32 (1)
/// - `width`: u32
/// - `height`: u32
/// - `bytes_per_pixel`: u32 (1 = grayscale, 3 = RGB, 4 = RGBA)
/// - `magic`: u32 (0x47504154 = "GPAT")
/// - `name`: null-terminated UTF-8/ASCII string
/// - `data`: raw pixel bytes
pub fn parse_pat(bytes: &[u8]) -> Result<(PatternData, String), String> {
    if bytes.len() < 24 {
        return Err("PAT file too small for header".into());
    }

    let read_u32 = |offset: usize| -> u32 {
        u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    };

    let header_size = read_u32(0) as usize;
    let _version = read_u32(4);
    let width = read_u32(8);
    let height = read_u32(12);
    let bytes_per_pixel = read_u32(16);
    let magic = read_u32(20);

    // "GPAT" = 0x47504154
    if magic != 0x47504154 {
        return Err("Invalid PAT magic header".into());
    }

    if width == 0 || height == 0 || width > 16384 || height > 16384 {
        return Err(format!("Invalid PAT dimensions: {}x{}", width, height));
    }

    let name = if header_size > 24 && header_size <= bytes.len() {
        let desc_slice = &bytes[24..header_size];
        let null_pos = desc_slice.iter().position(|&b| b == 0).unwrap_or(desc_slice.len());
        String::from_utf8_lossy(&desc_slice[..null_pos]).trim().to_string()
    } else {
        "Paper Pattern".to_string()
    };

    let expected_data_len = (width as usize) * (height as usize) * (bytes_per_pixel as usize);
    let data_start = header_size;
    let data_end = data_start + expected_data_len;

    if bytes.len() < data_end {
        return Err(format!(
            "PAT data truncated: expected {} data bytes, got {}",
            expected_data_len,
            bytes.len().saturating_sub(data_start)
        ));
    }

    let raw_data = &bytes[data_start..data_end];

    let pattern = if bytes_per_pixel == 1 {
        PatternData::from_grayscale(width, height, raw_data.to_vec())
    } else if bytes_per_pixel == 3 {
        // Convert RGB to 8-bit luminance
        let pixel_count = (width * height) as usize;
        let mut lums = Vec::with_capacity(pixel_count);
        for chunk in raw_data.chunks_exact(3) {
            let lum = (0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32).round() as u8;
            lums.push(lum);
        }
        PatternData::from_grayscale(width, height, lums)
    } else if bytes_per_pixel == 4 {
        PatternData::from_rgba(width, height, raw_data)
    } else {
        return Err(format!("Unsupported PAT bytes per pixel: {}", bytes_per_pixel));
    };

    Ok((pattern, if name.is_empty() { "Paper Pattern".into() } else { name }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_gbr_synthetic() {
        let mut gbr_bytes = Vec::new();
        let header_size = 28u32;
        let version = 2u32;
        let width = 2u32;
        let height = 2u32;
        let bpp = 1u32;
        let magic = 0x47494D50u32;
        let spacing = 10u32;

        gbr_bytes.extend_from_slice(&header_size.to_be_bytes());
        gbr_bytes.extend_from_slice(&version.to_be_bytes());
        gbr_bytes.extend_from_slice(&width.to_be_bytes());
        gbr_bytes.extend_from_slice(&height.to_be_bytes());
        gbr_bytes.extend_from_slice(&bpp.to_be_bytes());
        gbr_bytes.extend_from_slice(&magic.to_be_bytes());
        gbr_bytes.extend_from_slice(&spacing.to_be_bytes());

        // Standard Brush Tip: White is color (255 = full opacity), black is transparent (0 = transparent)
        let pixel_data = [0u8, 128u8, 200u8, 255u8];
        gbr_bytes.extend_from_slice(&pixel_data);

        let (tip, name) = parse_gbr(&gbr_bytes).unwrap();
        assert_eq!(name, "GBR Brush");
        assert_eq!(tip.width, 2);
        assert_eq!(tip.height, 2);
        // Direct opacity: 0 stays 0 (transparent), 255 stays 255 (full color ink)
        assert_eq!(tip.mask[0], 0);
        assert_eq!(tip.mask[1], 128);
        assert_eq!(tip.mask[2], 200);
        assert_eq!(tip.mask[3], 255);
    }

    #[test]
    fn test_parse_pat_synthetic() {
        let mut pat_bytes = Vec::new();
        let header_size = 24u32;
        let version = 1u32;
        let width = 2u32;
        let height = 2u32;
        let bpp = 1u32;
        let magic = 0x47504154u32;

        pat_bytes.extend_from_slice(&header_size.to_be_bytes());
        pat_bytes.extend_from_slice(&version.to_be_bytes());
        pat_bytes.extend_from_slice(&width.to_be_bytes());
        pat_bytes.extend_from_slice(&height.to_be_bytes());
        pat_bytes.extend_from_slice(&bpp.to_be_bytes());
        pat_bytes.extend_from_slice(&magic.to_be_bytes());

        let pattern_data = [10u8, 20u8, 30u8, 40u8];
        pat_bytes.extend_from_slice(&pattern_data);

        let (pat, name) = parse_pat(&pat_bytes).unwrap();
        assert_eq!(name, "Paper Pattern");
        assert_eq!(pat.width, 2);
        assert_eq!(pat.height, 2);
        assert_eq!(pat.bytes, vec![10, 20, 30, 40]);
    }

    #[test]
    fn test_parse_real_krita_assets() {
        // Parse real Krita GBR file
        let gbr_path = "../../resources/brushes/bokey_circle.gbr";
        if let Ok(bytes) = std::fs::read(gbr_path) {
            let (tip, name) = parse_gbr(&bytes).expect("Failed to parse real Krita GBR");
            assert!(tip.width > 0 && tip.height > 0);
            assert_eq!(tip.mask.len(), (tip.width * tip.height) as usize);
            println!("Parsed GBR: '{}' ({}x{})", name, tip.width, tip.height);
        }

        // Parse real Krita PAT file
        let pat_path = "../../resources/patterns/generic_paper1.pat";
        if let Ok(bytes) = std::fs::read(pat_path) {
            let (pat, name) = parse_pat(&bytes).expect("Failed to parse real Krita PAT");
            assert!(pat.width > 0 && pat.height > 0);
            assert_eq!(pat.bytes.len(), (pat.width * pat.height) as usize);
            println!("Parsed PAT: '{}' ({}x{})", name, pat.width, pat.height);
        }
    }

    #[test]
    fn test_tip_and_pattern_registries() {
        let mut tip_reg = TipRegistry::new();
        let tip = PredefinedTipData::from_gbr_grayscale(10, 10, &vec![0; 100], false);
        tip_reg.register("tip-charcoal".into(), "Charcoal 10".into(), tip);

        assert!(tip_reg.get("tip-charcoal").is_some());
        assert_eq!(tip_reg.list().len(), 1);
        assert_eq!(tip_reg.list()[0].name, "Charcoal 10");

        let mut pat_reg = PatternRegistry::new();
        let pat = PatternData::from_grayscale(8, 8, vec![255; 64]);
        pat_reg.register("pat-canvas".into(), "Rough Canvas".into(), pat);

        assert!(pat_reg.get("pat-canvas").is_some());
        assert_eq!(pat_reg.list().len(), 1);
        assert_eq!(pat_reg.list()[0].name, "Rough Canvas");
    }
}
