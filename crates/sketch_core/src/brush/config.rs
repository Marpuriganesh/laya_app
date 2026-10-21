/// Configuration parameters defining brush tip geometry, dynamics, and blending.
#[derive(Debug, Clone, PartialEq)]
pub struct BrushConfig {
    /// Brush diameter in pixels at full pressure.
    pub diameter: f32,
    /// Distance between sequential dabs as a fraction of brush diameter (e.g. 0.15 = 15%).
    pub spacing: f32,
    /// Softness factor [0.0..1.0]. 0.0 is a crisp hard circle, 1.0 is maximum radial fade.
    pub softness: f32,
    /// Stroke color as RGBA8 [R, G, B, A].
    pub color: [u8; 4],
    /// Master opacity of the stroke [0.0..1.0].
    pub opacity: f32,
    /// Flow accumulation rate per dab [0.0..1.0].
    pub flow: f32,
    /// Whether brush diameter scales proportionally with stylus pressure.
    pub size_by_pressure: bool,
    /// Whether opacity scales proportionally with stylus pressure.
    pub opacity_by_pressure: bool,
    /// Whether the brush operates in destination-out erase mode.
    pub is_erase: bool,
    /// Whether analytical subpixel edge anti-aliasing is applied to brush tips.
    pub antialias: bool,
    /// Optional 256-entry lookup table mapping normalized pressure [0.0..1.0] to response curve output.
    pub pressure_lut: Option<Box<[f32; 256]>>,
}

impl Default for BrushConfig {
    fn default() -> Self {
        Self {
            diameter: 40.0,
            spacing: 0.15,
            softness: 0.5,
            color: [25, 45, 120, 255],
            opacity: 1.0,
            flow: 1.0,
            size_by_pressure: true,
            opacity_by_pressure: false,
            is_erase: false,
            antialias: true,
            pressure_lut: None,
        }
    }
}
