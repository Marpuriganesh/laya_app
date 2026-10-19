/**
 * Unit Tests for Krita .kpp Preset Parser
 * Tests PNG header validation, chunk scanner, tEXt and zTXt chunk decompression,
 * XML parameter mapping, fallback defaults, dynamics curves, and full preset deserialization.
 */

import { describe, expect, it } from "vitest";
import zlib from "node:zlib";
import {
  buildBrushPresetFromXml,
  decompressDeflate,
  extractBaseOpacity,
  extractBaseSizePx,
  extractDisplayName,
  extractDynamicsMapping,
  extractPaintOpId,
  extractPresetXmlFromPng,
  extractSoftness,
  extractSpacingFraction,
  parseDynamicsCurve,
  parseKritaPreset,
  parsePresetXml,
  scanPngChunks,
  validatePngHeader,
} from "../kpp_parser";
import type { PixelBrushParameters, ColorSmudgeParameters, MyPaintParameters } from "../../../types/brush";

/**
 * Computes standard IEEE 802.3 CRC32 for PNG chunk data validation.
 */
function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Encodes an ASCII string into a Uint8Array.
 */
function encodeAscii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

/**
 * Encodes a UTF-8 string into a Uint8Array.
 */
function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Constructs a raw PNG chunk buffer: [4 bytes length][4 bytes type][data][4 bytes CRC].
 */
function createRawPngChunk(chunkType: string, chunkData: Uint8Array): Uint8Array {
  const typeBytes = encodeAscii(chunkType);
  const chunkLength = chunkData.length;
  const chunkBuffer = new Uint8Array(4 + 4 + chunkLength + 4);

  // Length (big-endian uint32)
  chunkBuffer[0] = (chunkLength >>> 24) & 0xff;
  chunkBuffer[1] = (chunkLength >>> 16) & 0xff;
  chunkBuffer[2] = (chunkLength >>> 8) & 0xff;
  chunkBuffer[3] = chunkLength & 0xff;

  // Chunk Type
  chunkBuffer.set(typeBytes, 4);

  // Chunk Data
  chunkBuffer.set(chunkData, 8);

  // CRC32 calculated over Type + Data
  const crcPayload = new Uint8Array(4 + chunkLength);
  crcPayload.set(typeBytes, 0);
  crcPayload.set(chunkData, 4);
  const crc = computeCrc32(crcPayload);

  const crcOffset = 8 + chunkLength;
  chunkBuffer[crcOffset] = (crc >>> 24) & 0xff;
  chunkBuffer[crcOffset + 1] = (crc >>> 16) & 0xff;
  chunkBuffer[crcOffset + 2] = (crc >>> 8) & 0xff;
  chunkBuffer[crcOffset + 3] = crc & 0xff;

  return chunkBuffer;
}

/**
 * Creates a minimal valid 1x1 IHDR chunk data buffer.
 */
function createIhdrChunk(): { type: string; data: Uint8Array } {
  // Width: 1, Height: 1, BitDepth: 8, ColorType: 6 (RGBA), Compression: 0, Filter: 0, Interlace: 0
  const data = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  return { type: "IHDR", data };
}

/**
 * Creates an empty IEND chunk.
 */
function createIendChunk(): { type: string; data: Uint8Array } {
  return { type: "IEND", data: new Uint8Array(0) };
}

/**
 * Creates a PNG 'tEXt' chunk buffer for keyword and string value.
 */
function createTextChunk(keyword: string, text: string): { type: string; data: Uint8Array } {
  const keywordBytes = encodeAscii(keyword);
  const textBytes = encodeUtf8(text);
  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);

  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0; // Null separator
  data.set(textBytes, keywordBytes.length + 1);

  return { type: "tEXt", data };
}

/**
 * Creates a PNG 'zTXt' chunk buffer with zlib compressed text.
 */
function createZTextChunk(
  keyword: string,
  text: string,
  useRawDeflate: boolean = false
): { type: string; data: Uint8Array } {
  const keywordBytes = encodeAscii(keyword);
  const textBytes = encodeUtf8(text);
  const compressedBytes = useRawDeflate
    ? zlib.deflateRawSync(textBytes)
    : zlib.deflateSync(textBytes);

  const data = new Uint8Array(keywordBytes.length + 2 + compressedBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0; // Null separator
  data[keywordBytes.length + 1] = 0; // Compression method 0 (deflate)
  data.set(compressedBytes, keywordBytes.length + 2);

  return { type: "zTXt", data };
}

/**
 * Builds a complete synthetic PNG byte buffer from given chunks.
 */
function buildSyntheticPng(
  chunks: readonly { type: string; data: Uint8Array }[]
): Uint8Array {
  const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunkBuffers: Uint8Array[] = chunks.map((c) =>
    createRawPngChunk(c.type, c.data)
  );

  let totalLength = pngHeader.length;
  for (const buf of chunkBuffers) {
    totalLength += buf.length;
  }

  const combined = new Uint8Array(totalLength);
  combined.set(pngHeader, 0);

  let offset = pngHeader.length;
  for (const buf of chunkBuffers) {
    combined.set(buf, offset);
    offset += buf.length;
  }

  return combined;
}

describe("kpp_parser: PNG Header and Chunk Scanner", () => {
  it("validates valid PNG header bytes", () => {
    const validHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]);
    expect(validatePngHeader(validHeader)).toBe(true);
  });

  it("rejects invalid PNG signatures", () => {
    const invalidHeader = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70]); // JPEG magic bytes
    expect(validatePngHeader(invalidHeader)).toBe(false);

    const tooShort = new Uint8Array([137, 80, 78]);
    expect(validatePngHeader(tooShort)).toBe(false);
  });

  it("scans PNG chunks accurately", () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("Author", "Test Painter"),
      createIendChunk(),
    ]);

    const chunks = scanPngChunks(pngBytes);
    expect(chunks.length).toBe(3);
    expect(chunks[0].chunkType).toBe("IHDR");
    expect(chunks[1].chunkType).toBe("tEXt");
    expect(chunks[2].chunkType).toBe("IEND");
  });

  it("throws when scanning a truncated chunk", () => {
    const pngBytes = buildSyntheticPng([createIhdrChunk()]);
    // Truncate the file so chunk length extends past buffer end
    const truncated = pngBytes.subarray(0, pngBytes.length - 8);

    expect(() => scanPngChunks(truncated)).toThrow(/Truncated PNG file/);
  });
});

describe("kpp_parser: Metadata Chunk Extraction & Decompression", () => {
  const sampleXml = `<KisPaintOpPreset paintopid="pixelbrush" version="2">
    <param name="size">45.0</param>
    <param name="spacing">0.15</param>
    <param name="opacity">0.85</param>
    <param name="flow">0.9</param>
    <param name="softness">0.4</param>
    <param name="name">Synthetic Round 45</param>
  </KisPaintOpPreset>`;

  it("extracts XML from uncompressed tEXt chunk with keyword 'Preset'", async () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("Preset", sampleXml),
      createIendChunk(),
    ]);

    const extractedXml = await extractPresetXmlFromPng(pngBytes);
    expect(extractedXml).toBe(sampleXml);
  });

  it("extracts XML from zTXt compressed chunk with zlib format", async () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createZTextChunk("Preset", sampleXml, false),
      createIendChunk(),
    ]);

    const extractedXml = await extractPresetXmlFromPng(pngBytes);
    expect(extractedXml).toBe(sampleXml);
  });

  it("extracts XML from zTXt chunk with raw deflate format", async () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createZTextChunk("Preset", sampleXml, true),
      createIendChunk(),
    ]);

    const extractedXml = await extractPresetXmlFromPng(pngBytes);
    expect(extractedXml).toBe(sampleXml);
  });

  it("handles case-insensitive 'preset' keyword", async () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("preset", sampleXml),
      createIendChunk(),
    ]);

    const extractedXml = await extractPresetXmlFromPng(pngBytes);
    expect(extractedXml).toBe(sampleXml);
  });

  it("throws clear error when no 'Preset' chunk exists", async () => {
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("Comment", "Just a regular PNG without brush preset"),
      createIendChunk(),
    ]);

    await expect(extractPresetXmlFromPng(pngBytes)).rejects.toThrow(
      /Preset metadata chunk .* not found in PNG/
    );
  });

  it("decompressDeflate throws on invalid compressed bytes", async () => {
    const badBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    await expect(decompressDeflate(badBytes)).rejects.toThrow(/Failed to decompress/);
  });
});

describe("kpp_parser: XML Parser and Parameter Extraction", () => {
  it("parses XML attributes, params, and CDATA correctly", () => {
    const xml = `<!-- Krita Brush Preset XML -->
    <KisPaintOpPreset paintopid="pixelbrush" version="2">
      <param name="PaintOp/KisPixelOp/brush_size">55</param>
      <param name="PaintOp/KisPixelOp/spacing">0.12</param>
      <param name="description"><![CDATA[A nice custom brush]]></param>
      <param name="airbrush" value="true" />
      <param name="scatter">3.5</param>
      <name>Special Inker</name>
    </KisPaintOpPreset>`;

    const parsed = parsePresetXml(xml);
    expect(parsed.rootTag).toBe("KisPaintOpPreset");
    expect(parsed.rootAttributes["paintopid"]).toBe("pixelbrush");
    expect(parsed.parameterMap.get("PaintOp/KisPixelOp/brush_size")).toBe("55");
    expect(parsed.parameterMap.get("PaintOp/KisPixelOp/spacing")).toBe("0.12");
    expect(parsed.parameterMap.get("description")).toBe("A nice custom brush");
    expect(parsed.parameterMap.get("airbrush")).toBe("true");
    expect(parsed.parameterMap.get("scatter")).toBe("3.5");
    expect(parsed.parameterMap.get("name")).toBe("Special Inker");
  });

  it("extracts paintopid and normalizes to standard engine IDs", () => {
    expect(
      extractPaintOpId(parsePresetXml('<Preset paintopid="pixelbrush" />'))
    ).toBe("pixelbrush");

    expect(
      extractPaintOpId(parsePresetXml('<Preset paintopid="colorsmudge" />'))
    ).toBe("colorsmudge");

    expect(
      extractPaintOpId(parsePresetXml('<Preset paintopid="mypaint" />'))
    ).toBe("mypaint");

    expect(
      extractPaintOpId(parsePresetXml('<Preset><param name="paintop">ColorSmudgeOp</param></Preset>'))
    ).toBe("colorsmudge");

    // Fallback default
    expect(extractPaintOpId(parsePresetXml("<Preset />"))).toBe("pixelbrush");
  });

  it("extracts baseSizePx with fallback to 32.0", () => {
    expect(extractBaseSizePx(parsePresetXml('<Preset><param name="size">64</param></Preset>'))).toBe(64);
    expect(extractBaseSizePx(parsePresetXml('<Preset><param name="brush_size">48.5</param></Preset>'))).toBe(48.5);
    expect(
      extractBaseSizePx(
        parsePresetXml('<Preset><param name="PaintOp/KisPixelOp/brush_size">80</param></Preset>')
      )
    ).toBe(80);

    // Fallback default
    expect(extractBaseSizePx(parsePresetXml("<Preset />"))).toBe(32.0);
    // Invalid value fallback
    expect(extractBaseSizePx(parsePresetXml('<Preset><param name="size">not-a-number</param></Preset>'))).toBe(32.0);
  });

  it("extracts spacingFraction with fallback to 0.1", () => {
    expect(extractSpacingFraction(parsePresetXml('<Preset><param name="spacing">0.25</param></Preset>'))).toBe(0.25);
    expect(
      extractSpacingFraction(
        parsePresetXml('<Preset><param name="PaintOp/KisPixelOp/spacing">0.05</param></Preset>')
      )
    ).toBe(0.05);

    // Fallback default
    expect(extractSpacingFraction(parsePresetXml("<Preset />"))).toBe(0.1);
  });

  it("extracts baseOpacity and baseFlow with fallback to 1.0", () => {
    expect(extractBaseOpacity(parsePresetXml('<Preset><param name="opacity">0.7</param></Preset>'))).toBeCloseTo(0.7);
    expect(extractBaseOpacity(parsePresetXml("<Preset />"))).toBe(1.0);
  });

  it("extracts softness and inverts hardness correctly", () => {
    expect(extractSoftness(parsePresetXml('<Preset><param name="softness">0.8</param></Preset>'))).toBeCloseTo(0.8);
    expect(extractSoftness(parsePresetXml('<Preset><param name="fade">0.3</param></Preset>'))).toBeCloseTo(0.3);
    expect(extractSoftness(parsePresetXml('<Preset><param name="hardness">0.9</param></Preset>'))).toBeCloseTo(0.1);

    // Fallback default
    expect(extractSoftness(parsePresetXml("<Preset />"))).toBe(0.5);
  });

  it("extracts display name correctly", () => {
    expect(extractDisplayName(parsePresetXml('<Preset name="My Custom Pencil" />'))).toBe("My Custom Pencil");
    expect(
      extractDisplayName(parsePresetXml('<Preset><param name="name">Gouache Wet</param></Preset>'))
    ).toBe("Gouache Wet");
    expect(extractDisplayName(parsePresetXml("<Preset />"))).toBe("Krita Brush");
  });
});

describe("kpp_parser: Dynamics Curve Parsing", () => {
  it("parses semicolon-separated coordinate pairs", () => {
    const curveString = "0,0;0.5,0.3;1,1;";
    const points = parseDynamicsCurve(curveString);

    expect(points).not.toBeNull();
    expect(points?.length).toBe(3);
    expect(points?.[0]).toEqual({ inputValue: 0, outputValue: 0 });
    expect(points?.[1]).toEqual({ inputValue: 0.5, outputValue: 0.3 });
    expect(points?.[2]).toEqual({ inputValue: 1, outputValue: 1 });
  });

  it("parses XML <point> format", () => {
    const xmlCurve = '<curve><point x="0" y="0.2"/><point x="0.8" y="0.9"/><point x="1" y="1"/></curve>';
    const points = parseDynamicsCurve(xmlCurve);

    expect(points).not.toBeNull();
    expect(points?.length).toBe(3);
    expect(points?.[0]).toEqual({ inputValue: 0, outputValue: 0.2 });
    expect(points?.[1]).toEqual({ inputValue: 0.8, outputValue: 0.9 });
    expect(points?.[2]).toEqual({ inputValue: 1, outputValue: 1 });
  });

  it("clamps out-of-range points to [0.0, 1.0]", () => {
    const curveString = "-0.2,-0.5; 1.5,2.0";
    const points = parseDynamicsCurve(curveString);

    expect(points).not.toBeNull();
    expect(points?.[0]).toEqual({ inputValue: 0.0, outputValue: 0.0 });
    expect(points?.[1]).toEqual({ inputValue: 1.0, outputValue: 1.0 });
  });

  it("synthesizes a second point when only one point is provided", () => {
    const singlePoint = "0.5,0.7";
    const points = parseDynamicsCurve(singlePoint);

    expect(points).not.toBeNull();
    expect(points?.length).toBe(2);
    expect(points?.[0]).toEqual({ inputValue: 0.0, outputValue: 0.7 });
    expect(points?.[1]).toEqual({ inputValue: 1.0, outputValue: 0.7 });
  });

  it("returns null for empty or invalid curve strings", () => {
    expect(parseDynamicsCurve("")).toBeNull();
    expect(parseDynamicsCurve("invalid non-coordinate text")).toBeNull();
  });

  it("extracts dynamics mappings for size and opacity", () => {
    const xml = `<Preset>
      <param name="size_pressure">0,0;1,1;</param>
      <param name="opacity_pressure">0,0;0.5,0.2;1,1;</param>
    </Preset>`;
    const parsed = parsePresetXml(xml);

    const sizeDynamics = extractDynamicsMapping(parsed, "size");
    expect(sizeDynamics).not.toBeNull();
    expect(sizeDynamics?.sensorInput).toBe("pressure");
    expect(sizeDynamics?.isEnabled).toBe(true);
    expect(sizeDynamics?.curvePoints.length).toBe(2);

    const opacityDynamics = extractDynamicsMapping(parsed, "opacity");
    expect(opacityDynamics).not.toBeNull();
    expect(opacityDynamics?.curvePoints.length).toBe(3);

    // Non-existent dynamics returns null
    const flowDynamics = extractDynamicsMapping(parsed, "flow");
    expect(flowDynamics).toBeNull();
  });

  it("detects tilt and speed sensors based on parameter name", () => {
    const xml = `<Preset>
      <param name="size_tilt">0,0;1,1;</param>
      <param name="opacity_speed">0,0;1,1;</param>
    </Preset>`;
    const parsed = parsePresetXml(xml);

    const sizeDynamics = extractDynamicsMapping(parsed, "size");
    expect(sizeDynamics?.sensorInput).toBe("tiltX");

    const opacityDynamics = extractDynamicsMapping(parsed, "opacity");
    expect(opacityDynamics?.sensorInput).toBe("speed");
  });
});

describe("kpp_parser: Full Preset Deserialization (parseKritaPreset)", () => {
  it("deserializes a complete pixelbrush preset with tEXt metadata chunk", async () => {
    const xml = `<KisPaintOpPreset paintopid="pixelbrush" version="2">
      <param name="PaintOp/KisPixelOp/brush_size">40</param>
      <param name="PaintOp/KisPixelOp/spacing">0.12</param>
      <param name="PaintOp/KisPixelOp/opacity">0.9</param>
      <param name="PaintOp/KisPixelOp/flow">0.85</param>
      <param name="PaintOp/KisPixelOp/softness">0.6</param>
      <param name="name">Inker Pro 40</param>
      <param name="size_pressure">0,0;1,1;</param>
      <param name="tags">Inking, Comics, Lineart</param>
    </KisPaintOpPreset>`;

    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("Preset", xml),
      createIendChunk(),
    ]);

    const preset = await parseKritaPreset(pngBytes);

    expect(preset.presetId).toBeDefined();
    expect(preset.displayName).toBe("Inker Pro 40");
    expect(preset.engineType).toBe("pixelbrush");
    expect(preset.thumbnailPngData).toEqual(pngBytes);
    expect(preset.tags).toEqual(["Inking", "Comics", "Lineart"]);

    const params = preset.engineParameters as PixelBrushParameters;
    expect(params.engineId).toBe("pixelbrush");
    expect(params.baseSizePx).toBe(40);
    expect(params.spacingFraction).toBe(0.12);
    expect(params.baseOpacity).toBeCloseTo(0.9);
    expect(params.baseFlow).toBeCloseTo(0.85);
    expect(params.softness).toBeCloseTo(0.6);
    expect(params.brushTip.tipType).toBe("generated");
    expect(params.sizeDynamics).not.toBeNull();
    expect(params.sizeDynamics?.sensorInput).toBe("pressure");

    // Smoothing configuration defaults
    expect(preset.smoothingConfig.mode).toBe("movingAverage");
    expect(preset.smoothingConfig.streamlineStringRadiusPx).toBe(4.0);
  });

  it("deserializes a colorsmudge preset with zTXt metadata chunk", async () => {
    const xml = `<KisPaintOpPreset paintopid="colorsmudge" version="2">
      <param name="size">60</param>
      <param name="spacing">0.08</param>
      <param name="opacity">0.8</param>
      <param name="smudge_mode">smearing</param>
      <param name="color_rate">0.45</param>
      <param name="smudge_length">0.65</param>
      <param name="smudge_radius">50</param>
      <param name="name">Oil Blend Smudge</param>
    </KisPaintOpPreset>`;

    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createZTextChunk("Preset", xml),
      createIendChunk(),
    ]);

    const preset = await parseKritaPreset(pngBytes);

    expect(preset.displayName).toBe("Oil Blend Smudge");
    expect(preset.engineType).toBe("colorsmudge");

    const params = preset.engineParameters as ColorSmudgeParameters;
    expect(params.engineId).toBe("colorsmudge");
    expect(params.baseSizePx).toBe(60);
    expect(params.spacingFraction).toBe(0.08);
    expect(params.baseOpacity).toBeCloseTo(0.8);
    expect(params.smudgeMode).toBe("smearing");
    expect(params.colorRate).toBeCloseTo(0.45);
    expect(params.smudgeLength).toBeCloseTo(0.65);
    expect(params.smudgeRadius).toBe(50);
  });

  it("deserializes a mypaint preset correctly", () => {
    const xml = `<Preset paintopid="mypaint">
      <param name="name">MyPaint Charcoal</param>
      <param name="myb_content">{"version": 1, "settings": {}}</param>
    </Preset>`;

    const preset = buildBrushPresetFromXml(xml, null);
    expect(preset.engineType).toBe("mypaint");
    const params = preset.engineParameters as MyPaintParameters;
    expect(params.engineId).toBe("mypaint");
    expect(params.brushName).toBe("MyPaint Charcoal");
    expect(params.mybJsonContent).toBe('{"version": 1, "settings": {}}');
  });

  it("applies robust fallback defaults when parameters are missing", async () => {
    const minimalXml = '<Preset paintopid="pixelbrush" />';
    const pngBytes = buildSyntheticPng([
      createIhdrChunk(),
      createTextChunk("Preset", minimalXml),
      createIendChunk(),
    ]);

    const preset = await parseKritaPreset(pngBytes);

    expect(preset.displayName).toBe("Krita Brush");
    expect(preset.engineType).toBe("pixelbrush");

    const params = preset.engineParameters as PixelBrushParameters;
    expect(params.baseSizePx).toBe(32.0);
    expect(params.spacingFraction).toBe(0.1);
    expect(params.baseOpacity).toBe(1.0);
    expect(params.baseFlow).toBe(1.0);
    expect(params.softness).toBe(0.5);
    expect(params.scatterAmplitude).toBe(0.0);
    expect(params.isAirbrushMode).toBe(false);
    expect(params.sizeDynamics).toBeNull();
    expect(params.opacityDynamics).toBeNull();
    expect(preset.tags).toEqual([]);
  });

  it("deserializes real fixture sample.kpp correctly", async () => {
    const fs = await import("node:fs");
    const fixtureUrl = new URL("../__fixtures__/sample.kpp", import.meta.url);
    const fixtureBuffer = fs.readFileSync(fixtureUrl);
    const fixtureBytes = new Uint8Array(
      fixtureBuffer.buffer,
      fixtureBuffer.byteOffset,
      fixtureBuffer.byteLength
    );

    const preset = await parseKritaPreset(fixtureBytes);

    expect(preset.displayName).toBe("Basic 5 Size");
    expect(preset.engineType).toBe("pixelbrush");
    expect(preset.tags).toEqual(["Sketching", "Inking"]);

    const params = preset.engineParameters as PixelBrushParameters;
    expect(params.baseSizePx).toBe(45);
    expect(params.spacingFraction).toBeCloseTo(0.12);
    expect(params.baseOpacity).toBeCloseTo(0.9);
    expect(params.baseFlow).toBeCloseTo(1.0);
    expect(params.softness).toBeCloseTo(0.4);
    expect(params.sizeDynamics?.sensorInput).toBe("pressure");
    expect(params.sizeDynamics?.curvePoints.length).toBe(3);
  });

  it("rejects non-PNG buffers with an error", async () => {
    const nonPngBuffer = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF header
    await expect(parseKritaPreset(nonPngBuffer)).rejects.toThrow(
      /Invalid Krita preset.*not a valid PNG image/
    );
  });
});
