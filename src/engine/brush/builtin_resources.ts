/**
 * Built-in Brush Resources & Seamless Paper Textures
 * Loads, decodes, and registers seamless paper grain patterns and predefined brush tip masks.
 * Works seamlessly in both the standalone desktop Tauri app and lightweight web scratchpad.
 */

import {
  createDefaultCanvasTextureConfig,
  createDefaultCharcoalTextureConfig,
  createDefaultColdPressTextureConfig,
} from "./procedural_textures";
import { parseGbr } from "./gbr_parser";
import { globalWasmBrushBridge } from "@/engine/wasm/wasm_brush_bridge";
import { globalRustBrushBridge } from "@/engine/brush/rust_brush_bridge";

export interface PatternResourceMeta {
  id: string;
  name: string;
  fileName: string;
  path: string;
  tags: string[];
  width: number;
  height: number;
  isProcedural?: boolean;
}

export interface BrushTipResourceMeta {
  id: string;
  name: string;
  fileName: string;
  path: string;
  tags: string[];
  width: number;
  height: number;
}

export const BUILTIN_PATTERNS_CATALOG: readonly PatternResourceMeta[] = [
  {
    id: "01_canvas",
    name: "Classic Artist Canvas",
    fileName: "01_canvas.png",
    path: "/resources/patterns/01_canvas.png",
    tags: ["Canvas", "Fine Art"],
    width: 512,
    height: 512,
  },
  {
    id: "02_rough-canvas",
    name: "Rough Heavy Canvas",
    fileName: "02_rough-canvas.png",
    path: "/resources/patterns/02_rough-canvas.png",
    tags: ["Canvas", "Coarse"],
    width: 512,
    height: 512,
  },
  {
    id: "04_paper-C-grain",
    name: "Cold Press C-Grain Paper",
    fileName: "04_paper-C-grain.png",
    path: "/resources/patterns/04_paper-C-grain.png",
    tags: ["Paper", "Watercolor"],
    width: 512,
    height: 512,
  },
  {
    id: "05_paper-torchon",
    name: "Torchon Rough Paper",
    fileName: "05_paper-torchon.png",
    path: "/resources/patterns/05_paper-torchon.png",
    tags: ["Paper", "Rough"],
    width: 512,
    height: 512,
  },
  {
    id: "HR_PastelPaper_02",
    name: "Pastel Tooth Grain",
    fileName: "HR_PastelPaper_02.pat",
    path: "/resources/patterns/HR_PastelPaper_02.pat",
    tags: ["Paper", "Pastel", "Graphite"],
    width: 512,
    height: 512,
  },
  {
    id: "generic_paper1",
    name: "Sketchbook Fine Grain",
    fileName: "generic_paper1.pat",
    path: "/resources/patterns/generic_paper1.pat",
    tags: ["Paper", "Drawing"],
    width: 256,
    height: 256,
  },
  {
    id: "generic_paper2",
    name: "Parchment Tooth",
    fileName: "generic_paper2.pat",
    path: "/resources/patterns/generic_paper2.pat",
    tags: ["Paper", "Smooth"],
    width: 256,
    height: 256,
  },
  {
    id: "procedural-canvas",
    name: "Procedural Weave Canvas",
    fileName: "procedural_canvas.pat",
    path: "__procedural__:canvas",
    tags: ["Canvas", "Procedural"],
    width: 256,
    height: 256,
    isProcedural: true,
  },
  {
    id: "procedural-charcoal",
    name: "Procedural Charcoal Grit",
    fileName: "procedural_charcoal.pat",
    path: "__procedural__:charcoal",
    tags: ["Grain", "Charcoal", "Procedural"],
    width: 256,
    height: 256,
    isProcedural: true,
  },
  {
    id: "procedural-coldpress",
    name: "Procedural Watercolor Paper",
    fileName: "procedural_coldpress.pat",
    path: "__procedural__:coldpress",
    tags: ["Paper", "Watercolor", "Procedural"],
    width: 256,
    height: 256,
    isProcedural: true,
  },
];

export const BUILTIN_BRUSH_TIPS_CATALOG: readonly BrushTipResourceMeta[] = [
  {
    id: "bristles_circle_dense",
    name: "Dense Round Bristles",
    fileName: "bristles_circle_dense.png",
    path: "/resources/brushes/bristles_circle_dense.png",
    tags: ["Bristles", "Oil", "Acrylic"],
    width: 128,
    height: 128,
  },
  {
    id: "bristles_chisel_dense",
    name: "Chisel Dense Bristles",
    fileName: "bristles_chisel_dense.png",
    path: "/resources/brushes/bristles_chisel_dense.png",
    tags: ["Bristles", "Flat"],
    width: 128,
    height: 128,
  },
  {
    id: "chalk",
    name: "Granular Chalk Tip",
    fileName: "chalk.png",
    path: "/resources/brushes/chalk.png",
    tags: ["Chalk", "Pastel", "Textured"],
    width: 128,
    height: 128,
  },
  {
    id: "crackles",
    name: "Crackles Splatter",
    fileName: "crackles.gbr",
    path: "/resources/brushes/crackles.gbr",
    tags: ["Texture", "Splatter"],
    width: 128,
    height: 128,
  },
  {
    id: "bokey_circle",
    name: "Bokeh Soft Circle",
    fileName: "bokey_circle.gbr",
    path: "/resources/brushes/bokey_circle.gbr",
    tags: ["Soft", "Round"],
    width: 128,
    height: 128,
  },
  {
    id: "chisel_knife",
    name: "Chisel Palette Knife",
    fileName: "chisel_knife.gbr",
    path: "/resources/brushes/chisel_knife.gbr",
    tags: ["Knife", "Hard Edge"],
    width: 128,
    height: 128,
  },
  {
    id: "bristles_grouped",
    name: "Grouped Bristles",
    fileName: "bristles_grouped.gbr",
    path: "/resources/brushes/bristles_grouped.gbr",
    tags: ["Bristles", "Rough"],
    width: 64,
    height: 64,
  },
];

// In-memory cache for decoded pattern buffers & data URLs
const patternBytesCache = new Map<string, { bytes: Uint8Array; width: number; height: number }>();
const patternThumbnailCache = new Map<string, string>();
const tipThumbnailCache = new Map<string, string>();

/**
 * Loads and returns 8-bit grayscale luminance bytes for a pattern texture.
 */
export async function loadPatternBytes(
  meta: PatternResourceMeta
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (patternBytesCache.has(meta.id)) {
    return patternBytesCache.get(meta.id)!;
  }

  // 1. Procedural textures
  if (meta.isProcedural) {
    let conf = createDefaultCanvasTextureConfig();
    if (meta.id === "procedural-charcoal") conf = createDefaultCharcoalTextureConfig();
    else if (meta.id === "procedural-coldpress") conf = createDefaultColdPressTextureConfig();

    const bytes = conf.bytes instanceof Uint8Array ? conf.bytes : new Uint8Array(conf.bytes);
    const result = { bytes, width: conf.width, height: conf.height };
    patternBytesCache.set(meta.id, result);
    return result;
  }

  // 2. Fetch image from public/ or Tauri
  try {
    const resp = await fetch(meta.path);
    if (!resp.ok) return null;
    const arrayBuf = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);

    if (meta.fileName.endsWith(".pat")) {
      // Register with Wasm engine which already parses PAT headers
      try {
        globalWasmBrushBridge.registerPatternPat(meta.id, uint8);
        void globalRustBrushBridge.registerPatternPat(meta.id, uint8);
      } catch {}
      // Generate synthetic fallback luminance if direct rasterization needed
      const size = meta.width * meta.height;
      const gray = new Uint8Array(size);
      for (let i = 0; i < size; i++) gray[i] = uint8[24 + (i % (uint8.length - 24))];
      const res = { bytes: gray, width: meta.width, height: meta.height };
      patternBytesCache.set(meta.id, res);
      return res;
    }

    // Image file (.png)
    const blob = new Blob([arrayBuf]);
    const img = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imgData.data;

    const grayBytes = new Uint8Array(img.width * img.height);
    for (let i = 0; i < grayBytes.length; i++) {
      const p = i * 4;
      const r = pixels[p];
      const g = pixels[p + 1];
      const b = pixels[p + 2];
      // Rec. 601 Luminance
      grayBytes[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const res = { bytes: grayBytes, width: img.width, height: img.height };
    patternBytesCache.set(meta.id, res);

    // Register with bridges
    globalWasmBrushBridge.registerPatternGrayscale(meta.id, meta.name, img.width, img.height, grayBytes);
    void globalRustBrushBridge.registerPatternGrayscale(meta.id, meta.name, img.width, img.height, grayBytes);

    return res;
  } catch (err) {
    console.warn(`Failed to load pattern ${meta.id}:`, err);
    return null;
  }
}

/**
 * Generates or retrieves a data URL thumbnail for a pattern.
 */
export async function getPatternThumbnail(meta: PatternResourceMeta, size = 64): Promise<string> {
  const cacheKey = `${meta.id}_${size}`;
  if (patternThumbnailCache.has(cacheKey)) {
    return patternThumbnailCache.get(cacheKey)!;
  }

  const loaded = await loadPatternBytes(meta);
  if (!loaded) return "";

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = loaded.width;
  srcCanvas.height = loaded.height;
  const sctx = srcCanvas.getContext("2d");
  if (!sctx) return "";

  const imgData = sctx.createImageData(loaded.width, loaded.height);
  for (let i = 0; i < loaded.bytes.length; i++) {
    const lum = loaded.bytes[i];
    const p = i * 4;
    imgData.data[p] = lum;
    imgData.data[p + 1] = lum;
    imgData.data[p + 2] = lum;
    imgData.data[p + 3] = 255;
  }
  sctx.putImageData(imgData, 0, 0);

  ctx.drawImage(srcCanvas, 0, 0, size, size);
  const dataUrl = canvas.toDataURL("image/png");
  patternThumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Loads and generates thumbnail for a brush tip.
 */
export async function getBrushTipThumbnail(meta: BrushTipResourceMeta, size = 64): Promise<string> {
  const cacheKey = `${meta.id}_${size}`;
  if (tipThumbnailCache.has(cacheKey)) {
    return tipThumbnailCache.get(cacheKey)!;
  }

  try {
    const resp = await fetch(meta.path);
    if (!resp.ok) return "";
    const buf = await resp.arrayBuffer();
    const uint8 = new Uint8Array(buf);

    if (meta.fileName.endsWith(".gbr")) {
      const gbr = parseGbr(uint8);
      if (!gbr) return "";
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";

      const sCanvas = document.createElement("canvas");
      sCanvas.width = gbr.width;
      sCanvas.height = gbr.height;
      const sCtx = sCanvas.getContext("2d");
      if (!sCtx) return "";

      const imgData = sCtx.createImageData(gbr.width, gbr.height);
      for (let i = 0; i < gbr.mask.length; i++) {
        const a = gbr.mask[i];
        const p = i * 4;
        imgData.data[p] = 240;
        imgData.data[p + 1] = 240;
        imgData.data[p + 2] = 240;
        imgData.data[p + 3] = a;
      }
      sCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(sCanvas, 0, 0, size, size);
      const url = canvas.toDataURL("image/png");
      tipThumbnailCache.set(cacheKey, url);
      return url;
    } else {
      // PNG tip
      const blob = new Blob([buf]);
      const img = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(img, 0, 0, size, size);
      const url = canvas.toDataURL("image/png");
      tipThumbnailCache.set(cacheKey, url);
      return url;
    }
  } catch (err) {
    console.warn(`Failed to load tip ${meta.id}:`, err);
    return "";
  }
}
