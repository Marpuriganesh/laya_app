/**
 * Document & Canvas Configuration Contracts
 * Defines the resolution, DPI, color space, and bit depth for the canvas.
 */

export type ColorSpace = "srgb" | "display-p3";
export type BitDepth = "8-bit" | "16-bit-float";
export type CanvasUnit = "pixels" | "inches" | "cm" | "mm";

export interface DocumentConfiguration {
  readonly id: string;
  readonly title: string;
  readonly width: number;              // In pixels
  readonly height: number;             // In pixels
  readonly dpi: number;                // Standard DPI (72, 144, 300)
  readonly colorSpace: ColorSpace;     // sRGB or Display P3
  readonly bitDepth: BitDepth;         // 8-bit standard or 16-bit float
  readonly backgroundColor: string;    // Hex color or 'transparent'
}

export interface DocumentPreset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly category: "Screen" | "Print" | "Square" | "Video";
}

/** Standard preset resolutions (similar to Photoshop / Procreate canvas templates) */
export const STANDARD_DOCUMENT_PRESETS: readonly DocumentPreset[] = [
  { name: "Screen Size", width: 1920, height: 1080, dpi: 72, category: "Screen" },
  { name: "Square 2K", width: 2048, height: 2048, dpi: 144, category: "Square" },
  { name: "4K UHD", width: 3840, height: 2160, dpi: 72, category: "Video" },
  { name: "A4 Print", width: 2480, height: 3508, dpi: 300, category: "Print" },
  { name: "Square 4K", width: 4096, height: 4096, dpi: 300, category: "Square" },
];

/** Creates a default document configuration (Square 2048x2048 @ 144 DPI) */
export function createDefaultDocumentConfiguration(): DocumentConfiguration {
  return {
    id: "default-doc",
    title: "Untitled Artwork",
    width: 2048,
    height: 2048,
    dpi: 144,
    colorSpace: "srgb",
    bitDepth: "8-bit",
    backgroundColor: "#ffffff",
  };
}
