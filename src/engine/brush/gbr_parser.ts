/**
 * GIMP / Krita Brush (.gbr) Format Parser
 * Deserializes raster tip masks from binary GBR streams.
 * 
 * Complies with Krita KisGbrBrush / GIMP brush specification.
 */

export interface ParsedGbrTip {
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly bytesPerPixel: number;
  /** 8-bit grayscale alpha mask: 0 = transparent, 255 = fully opaque ink */
  readonly mask: Uint8ClampedArray;
}

/**
 * Parses a binary GBR file buffer into dimensions and an 8-bit grayscale alpha mask.
 */
export function parseGbr(bytes: Uint8Array | number[]): ParsedGbrTip | null {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (uint8.length < 20) {
    return null;
  }

  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  const headerSize = view.getUint32(0, false);
  const version = view.getUint32(4, false);
  const width = view.getUint32(8, false);
  const height = view.getUint32(12, false);
  const bytesPerPixel = view.getUint32(16, false);

  if (width === 0 || height === 0 || width > 16384 || height > 16384) {
    return null;
  }

  if (bytesPerPixel !== 1 && bytesPerPixel !== 4) {
    return null;
  }

  const descOffset = version === 2 && headerSize >= 28 ? 28 : 20;
  let name = "GBR Brush";
  if (headerSize > descOffset && headerSize <= uint8.length) {
    const descBytes = uint8.subarray(descOffset, headerSize);
    let nullPos = descBytes.indexOf(0);
    if (nullPos < 0) nullPos = descBytes.length;
    try {
      name = new TextDecoder("utf-8").decode(descBytes.subarray(0, nullPos)).trim() || "GBR Brush";
    } catch {
      name = "GBR Brush";
    }
  }

  const expectedDataLen = width * height * bytesPerPixel;
  const dataStart = headerSize;
  const dataEnd = dataStart + expectedDataLen;

  if (uint8.length < dataEnd) {
    return null;
  }

  const mask = new Uint8ClampedArray(width * height);

  if (bytesPerPixel === 1) {
    // 1 BPP Grayscale: In GBR convention, 0 is black ink (opaque) and 255 is white (transparent).
    // Invert so 255 = opaque ink, 0 = transparent.
    for (let i = 0; i < width * height; i++) {
      mask[i] = 255 - uint8[dataStart + i];
    }
  } else {
    // 4 BPP RGBA: Check for genuine alpha transparency
    let hasTransparentAlpha = false;
    for (let i = 0; i < width * height; i++) {
      const alpha = uint8[dataStart + i * 4 + 3];
      if (alpha < 255) {
        hasTransparentAlpha = true;
        break;
      }
    }

    if (hasTransparentAlpha) {
      for (let i = 0; i < width * height; i++) {
        mask[i] = uint8[dataStart + i * 4 + 3];
      }
    } else {
      // Opaque image drawn on paper: use inverted luminance
      for (let i = 0; i < width * height; i++) {
        const r = uint8[dataStart + i * 4];
        const g = uint8[dataStart + i * 4 + 1];
        const b = uint8[dataStart + i * 4 + 2];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        mask[i] = 255 - lum;
      }
    }
  }

  return {
    width,
    height,
    name,
    bytesPerPixel,
    mask,
  };
}
