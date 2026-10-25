/**
 * Krita .kpp Brush Preset Parser
 * Deserializes Krita brush preset (.kpp) files directly from PNG byte streams.
 *
 * Background:
 * - A Krita .kpp file is a PNG image (serving as the preset thumbnail).
 * - Preset configuration is embedded as XML in a PNG metadata chunk ('tEXt' or 'zTXt')
 *   with the keyword 'Preset'.
 * - Operates entirely in pure TypeScript without external npm dependencies,
 *   compatible with both browser and headless Node/Vitest environments.
 */

import {
  DEFAULT_STROKE_SMOOTHING_CONFIG,
  type BrushEngineParameters,
  type BrushPreset,
  type ColorSmudgeParameters,
  type DynamicsCurvePoint,
  type DynamicsMapping,
  type GeneratedBrushTip,
  type MyPaintParameters,
  type PixelBrushParameters,
  type SensorInputName,
} from "../../types/brush";
import { inflate } from "./inflate";

/**
 * Standard 8-byte PNG magic header sequence: [137, 80, 78, 71, 13, 10, 26, 10].
 */
export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Represents a parsed raw chunk from a PNG datastream.
 */
export interface PngChunk {
  readonly chunkType: string;
  readonly chunkData: Uint8Array;
  readonly crc: number;
}

/**
 * Structured representation of parsed preset XML metadata.
 */
export interface ParsedPresetXml {
  readonly rootTag: string;
  readonly rootAttributes: Readonly<Record<string, string>>;
  readonly parameterMap: ReadonlyMap<string, string>;
  readonly rawXml: string;
}

/**
 * Validates that the provided byte buffer begins with the standard 8-byte PNG magic header.
 *
 * @param fileBytes Input byte buffer to check
 * @returns True if the header matches the PNG signature, false otherwise
 */
export function validatePngHeader(fileBytes: Uint8Array): boolean {
  if (fileBytes.byteLength < PNG_SIGNATURE.length) {
    return false;
  }

  for (let byteIndex = 0; byteIndex < PNG_SIGNATURE.length; byteIndex++) {
    if (fileBytes[byteIndex] !== PNG_SIGNATURE[byteIndex]) {
      return false;
    }
  }

  return true;
}

/**
 * Reads a 32-bit unsigned big-endian integer from a byte buffer at the given byte offset.
 */
export function readUint32BigEndian(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  );
}

/**
 * Reads an ASCII string of specified length from a byte buffer at the given byte offset.
 */
export function readAsciiString(buffer: Uint8Array, offset: number, length: number): string {
  let asciiString = "";
  const endOffset = offset + length;
  for (let index = offset; index < endOffset; index++) {
    asciiString += String.fromCharCode(buffer[index]);
  }
  return asciiString;
}

/**
 * Scans a PNG byte stream and extracts all chunks in order until the IEND chunk or end of file.
 *
 * @param fileBytes Raw PNG byte buffer
 * @returns Array of parsed PNG chunks
 */
export function scanPngChunks(fileBytes: Uint8Array): readonly PngChunk[] {
  if (!validatePngHeader(fileBytes)) {
    throw new Error("Invalid PNG signature: buffer is not a valid PNG file.");
  }

  const chunks: PngChunk[] = [];
  let currentOffset = PNG_SIGNATURE.length;
  const totalLength = fileBytes.byteLength;

  while (currentOffset + 8 <= totalLength) {
    const chunkLength = readUint32BigEndian(fileBytes, currentOffset);
    const chunkType = readAsciiString(fileBytes, currentOffset + 4, 4);
    const dataOffset = currentOffset + 8;
    const crcOffset = dataOffset + chunkLength;
    const nextChunkOffset = crcOffset + 4;

    if (nextChunkOffset > totalLength) {
      throw new Error(
        `Truncated PNG file: chunk '${chunkType}' expects ${chunkLength} bytes but file ends unexpectedly.`
      );
    }

    const chunkData = fileBytes.subarray(dataOffset, crcOffset);
    const crc = readUint32BigEndian(fileBytes, crcOffset);

    chunks.push({
      chunkType,
      chunkData,
      crc,
    });

    currentOffset = nextChunkOffset;

    if (chunkType === "IEND") {
      break;
    }
  }

  return chunks;
}

/**
 * Finds the index of the first null (0x00) separator byte in a byte buffer.
 */
export function findNullByteIndex(data: Uint8Array, startIndex: number = 0): number {
  for (let index = startIndex; index < data.length; index++) {
    if (data[index] === 0) {
      return index;
    }
  }
  return -1;
}

/**
 * Decodes a UTF-8 encoded byte array into a string.
 */
export function decodeUtf8String(data: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(data);
  }

  // Fallback for environments lacking TextDecoder
  let decodedString = "";
  for (let index = 0; index < data.length; index++) {
    decodedString += String.fromCharCode(data[index]);
  }
  return decodedString;
}

/**
 * Decodes a Latin-1 (ISO-8859-1) encoded byte array into a string.
 */
export function decodeLatin1String(data: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("iso-8859-1").decode(data);
  }

  let decodedString = "";
  for (let index = 0; index < data.length; index++) {
    decodedString += String.fromCharCode(data[index]);
  }
  return decodedString;
}

/**
 * Decompresses a deflate stream using the Web Streams DecompressionStream API.
 */
async function decompressWithWebStream(
  compressedBytes: Uint8Array,
  format: "deflate" | "deflate-raw"
): Promise<Uint8Array> {
  const sourceStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(compressedBytes);
      controller.close();
    },
  });

  const decompressionStream = new DecompressionStream(format);
  const decompressedStream = (sourceStream as unknown as {
    pipeThrough: (transform: unknown) => ReadableStream<Uint8Array>;
  }).pipeThrough(decompressionStream);
  const streamReader = decompressedStream.getReader();

  const collectedChunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await streamReader.read();
    if (done) {
      break;
    }
    if (value) {
      collectedChunks.push(value);
      totalLength += value.length;
    }
  }

  const combinedBytes = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const chunk of collectedChunks) {
    combinedBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return combinedBytes;
}

/**
 * Decompresses deflate data across browser and Node environments without external npm packages.
 * Tries DecompressionStream ('deflate' and 'deflate-raw'), falling back to Node's built-in 'node:zlib'.
 *
 * @param compressedBytes Raw compressed deflate or zlib byte buffer
 * @returns Decompressed byte array
 */
export async function decompressDeflate(compressedBytes: Uint8Array): Promise<Uint8Array> {
  // 1. Attempt standard Web Streams DecompressionStream if available (modern browsers & Node 18+)
  if (typeof globalThis.DecompressionStream !== "undefined") {
    try {
      return await decompressWithWebStream(compressedBytes, "deflate");
    } catch {
      try {
        return await decompressWithWebStream(compressedBytes, "deflate-raw");
      } catch {
        // Fall back to node:zlib
      }
    }
  }

  // 2. Node environment fallback using built-in node:zlib
  try {
    const nodeZlibModuleName = "node:zlib";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeZlib: any = await import(/* @vite-ignore */ nodeZlibModuleName);
    try {
      const decompressedBuffer = nodeZlib.inflateSync(compressedBytes);
      return new Uint8Array(
        decompressedBuffer.buffer,
        decompressedBuffer.byteOffset,
        decompressedBuffer.byteLength
      );
    } catch {
      const decompressedBuffer = nodeZlib.inflateRawSync(compressedBytes);
      return new Uint8Array(
        decompressedBuffer.buffer,
        decompressedBuffer.byteOffset,
        decompressedBuffer.byteLength
      );
    }
  } catch {
    // 3. Robust pure-JS fallback for Safari 16-17.1 and static offline PWA execution
    try {
      return inflate(compressedBytes);
    } catch (pureJsError) {
      throw new Error(
        `Failed to decompress deflate stream: ${
          pureJsError instanceof Error ? pureJsError.message : String(pureJsError)
        }`,
        { cause: pureJsError }
      );
    }
  }
}

/**
 * Extracts keyword and text data from an uncompressed 'tEXt' PNG chunk.
 */
export function parseTextChunk(chunkData: Uint8Array): { keyword: string; text: string } {
  const nullIndex = findNullByteIndex(chunkData);
  if (nullIndex === -1) {
    throw new Error("Invalid tEXt chunk: missing null separator byte.");
  }

  const keyword = decodeLatin1String(chunkData.subarray(0, nullIndex));
  const text = decodeUtf8String(chunkData.subarray(nullIndex + 1));
  return { keyword, text };
}

/**
 * Extracts keyword and decompressed text data from a compressed 'zTXt' PNG chunk.
 */
export async function parseZTextChunk(
  chunkData: Uint8Array
): Promise<{ keyword: string; text: string }> {
  const nullIndex = findNullByteIndex(chunkData);
  if (nullIndex === -1) {
    throw new Error("Invalid zTXt chunk: missing null separator byte.");
  }

  const keyword = decodeLatin1String(chunkData.subarray(0, nullIndex));
  const compressionMethod = chunkData[nullIndex + 1];

  if (compressionMethod !== 0) {
    throw new Error(
      `Unsupported zTXt compression method: ${compressionMethod} (only deflate method 0 supported).`
    );
  }

  const compressedData = chunkData.subarray(nullIndex + 2);
  const decompressedData = await decompressDeflate(compressedData);
  const text = decodeUtf8String(decompressedData);

  return { keyword, text };
}

/**
 * Searches PNG chunks for the 'Preset' metadata chunk ('tEXt' or 'zTXt') and extracts its XML text.
 *
 * @param fileBytes Input PNG byte buffer
 * @returns Raw preset XML string
 */
export async function extractPresetXmlFromPng(fileBytes: Uint8Array): Promise<string> {
  const chunks = scanPngChunks(fileBytes);

  for (const chunk of chunks) {
    if (chunk.chunkType === "tEXt") {
      const { keyword, text } = parseTextChunk(chunk.chunkData);
      if (keyword.toLowerCase() === "preset") {
        return text;
      }
    } else if (chunk.chunkType === "zTXt") {
      const { keyword, text } = await parseZTextChunk(chunk.chunkData);
      if (keyword.toLowerCase() === "preset") {
        return text;
      }
    }
  }

  throw new Error("Preset metadata chunk ('tEXt' or 'zTXt' with keyword 'Preset') not found in PNG.");
}

/**
 * Parses key/value attributes from an XML element opening tag string.
 */
export function parseXmlAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributeRegex.exec(attributeString)) !== null) {
    const attributeName = match[1];
    const attributeValue = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[attributeName] = attributeValue;
  }

  return attributes;
}

/**
 * Parses XML preset text into a structured dictionary without external npm XML dependencies.
 * Extracts root element attributes and all `<param name="...">value</param>` entries.
 *
 * @param xmlString Raw XML content extracted from PNG preset metadata
 * @returns Structured ParsedPresetXml object
 */
export function parsePresetXml(xmlString: string): ParsedPresetXml {
  // Strip XML comments
  const sanitizedXml = xmlString.replace(/<!--[\s\S]*?-->/g, "");

  // Match root tag: e.g. <KisPaintOpPreset paintopid="pixelbrush" ...> or <Preset ...>
  const rootTagMatch = /<([a-zA-Z0-9_:-]+)\s*([^>]*)>/i.exec(sanitizedXml);
  const rootTag = rootTagMatch ? rootTagMatch[1] : "Preset";
  const rootAttributeString = rootTagMatch ? rootTagMatch[2] : "";
  const rootAttributes = parseXmlAttributes(rootAttributeString);

  const parameterMap = new Map<string, string>();

  // Extract <param ... /> (self-closing) or <param ...>VALUE</param>
  const paramRegex = /<param\s+([^>]*?)(?:\/>|>(.*?)<\/param>)/gis;
  let paramMatch: RegExpExecArray | null;

  while ((paramMatch = paramRegex.exec(sanitizedXml)) !== null) {
    const attributesString = paramMatch[1];
    const isSelfClosing = paramMatch[2] === undefined;
    const paramAttributes = parseXmlAttributes(attributesString);
    const paramName = paramAttributes["name"] ?? paramAttributes["id"];

    if (paramName) {
      let paramValue = isSelfClosing
        ? (paramAttributes["value"] ?? "")
        : (paramMatch[2] ?? "").trim();

      // Unwrap CDATA if present
      const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(paramValue);
      if (cdataMatch) {
        paramValue = cdataMatch[1].trim();
      }

      parameterMap.set(paramName, paramValue);
    }
  }

  // Also extract generic child elements like <size>32</size>, <opacity>1.0</opacity> if not already mapped
  const genericTagRegex = /<([a-zA-Z0-9_:-]+)(?:\s+[^>]*)?>([^<]+)<\/\1>/gi;
  let genericMatch: RegExpExecArray | null;

  while ((genericMatch = genericTagRegex.exec(sanitizedXml)) !== null) {
    const tagName = genericMatch[1];
    const tagValue = genericMatch[2].trim();

    if (tagName.toLowerCase() !== "param" && !parameterMap.has(tagName)) {
      parameterMap.set(tagName, tagValue);
    }
  }

  return {
    rootTag,
    rootAttributes,
    parameterMap,
    rawXml: xmlString,
  };
}

/**
 * Finds a parameter value from the map by checking an ordered list of candidate keys,
 * or matching the suffix of any key in the map.
 */
function findParameterValue(
  parameterMap: ReadonlyMap<string, string>,
  candidateKeys: readonly string[]
): string | null {
  for (const candidateKey of candidateKeys) {
    const exactValue = parameterMap.get(candidateKey);
    if (exactValue !== undefined && exactValue !== "") {
      return exactValue;
    }
  }

  // Suffix fallback (e.g. PaintOp/KisPixelOp/brush_size matches brush_size)
  for (const [key, value] of parameterMap.entries()) {
    for (const candidateKey of candidateKeys) {
      if (key.endsWith(`/${candidateKey}`) || key.toLowerCase().endsWith(candidateKey.toLowerCase())) {
        if (value !== "") {
          return value;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts and normalizes the Krita paint operation engine ID from preset XML.
 * Defaults to "pixelbrush".
 */
export function extractPaintOpId(
  parsedXml: ParsedPresetXml
): "pixelbrush" | "colorsmudge" | "mypaint" {
  const rawId =
    parsedXml.rootAttributes["paintopid"] ??
    parsedXml.rootAttributes["paintop"] ??
    findParameterValue(parsedXml.parameterMap, ["paintopid", "paintop", "engine"]) ??
    "pixelbrush";

  const normalized = rawId.toLowerCase();

  if (normalized.includes("smudge")) {
    return "colorsmudge";
  }
  if (normalized.includes("mypaint")) {
    return "mypaint";
  }
  return "pixelbrush";
}

/**
 * Extracts the base brush size in pixels from preset XML.
 * Falls back to 32.0 px if not specified.
 */
export function extractBaseSizePx(parsedXml: ParsedPresetXml): number {
  const rawValue = findParameterValue(parsedXml.parameterMap, [
    "size",
    "brush_size",
    "brush_diameter",
    "diameter",
  ]);

  if (rawValue !== null) {
    const parsedNumber = parseFloat(rawValue);
    if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
      return parsedNumber;
    }
  }

  return 32.0;
}

/**
 * Extracts dab spacing as a fraction of brush diameter from preset XML.
 * Falls back to 0.1 (10% spacing) if not specified.
 */
export function extractSpacingFraction(parsedXml: ParsedPresetXml): number {
  const rawValue = findParameterValue(parsedXml.parameterMap, [
    "spacing",
    "brush_spacing",
    "spacingFraction",
  ]);

  if (rawValue !== null) {
    const parsedNumber = parseFloat(rawValue);
    if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
      return parsedNumber;
    }
  }

  return 0.1;
}

/**
 * Extracts base opacity normalized between 0.0 and 1.0 from preset XML.
 * Falls back to 1.0 if not specified.
 */
export function extractBaseOpacity(parsedXml: ParsedPresetXml): number {
  const rawValue = findParameterValue(parsedXml.parameterMap, ["opacity", "base_opacity"]);

  if (rawValue !== null) {
    const parsedNumber = parseFloat(rawValue);
    if (!Number.isNaN(parsedNumber)) {
      return Math.max(0.0, Math.min(1.0, parsedNumber));
    }
  }

  return 1.0;
}

/**
 * Extracts base flow normalized between 0.0 and 1.0 from preset XML.
 * Falls back to 1.0 if not specified.
 */
export function extractBaseFlow(parsedXml: ParsedPresetXml): number {
  const rawValue = findParameterValue(parsedXml.parameterMap, ["flow", "base_flow"]);

  if (rawValue !== null) {
    const parsedNumber = parseFloat(rawValue);
    if (!Number.isNaN(parsedNumber)) {
      return Math.max(0.0, Math.min(1.0, parsedNumber));
    }
  }

  return 1.0;
}

/**
 * Extracts brush softness normalized between 0.0 and 1.0 from preset XML.
 * Inverts 'hardness' if present. Falls back to 0.5 if not specified.
 */
export function extractSoftness(parsedXml: ParsedPresetXml): number {
  const softnessValue = findParameterValue(parsedXml.parameterMap, ["softness", "fade"]);
  if (softnessValue !== null) {
    const parsedNumber = parseFloat(softnessValue);
    if (!Number.isNaN(parsedNumber)) {
      return Math.max(0.0, Math.min(1.0, parsedNumber));
    }
  }

  const hardnessValue = findParameterValue(parsedXml.parameterMap, ["hardness"]);
  if (hardnessValue !== null) {
    const parsedNumber = parseFloat(hardnessValue);
    if (!Number.isNaN(parsedNumber)) {
      return Math.max(0.0, Math.min(1.0, 1.0 - parsedNumber));
    }
  }

  return 0.5;
}

/**
 * Extracts scatter amplitude from preset XML. Defaults to 0.0.
 */
export function extractScatterAmplitude(parsedXml: ParsedPresetXml): number {
  const rawValue = findParameterValue(parsedXml.parameterMap, ["scatter", "scatter_amplitude"]);
  if (rawValue !== null) {
    const parsedNumber = parseFloat(rawValue);
    if (!Number.isNaN(parsedNumber)) {
      return Math.max(0.0, parsedNumber);
    }
  }
  return 0.0;
}

/**
 * Extracts airbrush mode flag from preset XML. Defaults to false.
 */
export function extractIsAirbrushMode(parsedXml: ParsedPresetXml): boolean {
  const rawValue = findParameterValue(parsedXml.parameterMap, ["airbrush", "isAirbrushMode"]);
  if (rawValue !== null) {
    return rawValue.toLowerCase() === "true" || rawValue === "1";
  }
  return false;
}

/**
 * Extracts preset display name from XML attributes or parameters.
 * Defaults to "Krita Brush".
 */
export function extractDisplayName(parsedXml: ParsedPresetXml): string {
  const rawValue =
    findParameterValue(parsedXml.parameterMap, ["name", "displayName", "preset_name"]) ??
    parsedXml.rootAttributes["name"];

  if (rawValue && rawValue.trim().length > 0) {
    return rawValue.trim();
  }

  return "Krita Brush";
}

/**
 * Parses dynamics curve points from Krita's XML coordinate format.
 * Supports:
 * 1. Semicolon-separated pairs: "0,0;0.5,0.25;1,1;"
 * 2. Space/comma separated pairs: "0,0 1,1" or "0 0; 1 1"
 * 3. XML point elements: `<point x="0" y="0"/><point x="1" y="1"/>`
 *
 * @param curveRawText Raw string representing control points
 * @returns Array of sorted DynamicsCurvePoint, or null if invalid
 */
export function parseDynamicsCurve(curveRawText: string): readonly DynamicsCurvePoint[] | null {
  if (!curveRawText || curveRawText.trim().length === 0) {
    return null;
  }

  const points: DynamicsCurvePoint[] = [];

  // Format 1: XML <point x="..." y="..." /> elements
  const pointXmlRegex = /<point\s+[^>]*?x=["']([^"']+)["'][^>]*?y=["']([^"']+)["']/gi;
  let xmlMatch: RegExpExecArray | null;
  while ((xmlMatch = pointXmlRegex.exec(curveRawText)) !== null) {
    const inputVal = parseFloat(xmlMatch[1]);
    const outputVal = parseFloat(xmlMatch[2]);
    if (!Number.isNaN(inputVal) && !Number.isNaN(outputVal)) {
      points.push({
        inputValue: Math.max(0.0, Math.min(1.0, inputVal)),
        outputValue: Math.max(0.0, Math.min(1.0, outputVal)),
      });
    }
  }

  // Format 2: Coordinate string format: "0,0;0.5,0.25;1,1;"
  if (points.length === 0) {
    const cleanedText = curveRawText.replace(/<[^>]+>/g, " ").replace(/[()]/g, "");
    const segments = cleanedText.split(/[;\n\r]+/);

    for (const segment of segments) {
      const trimmedSegment = segment.trim();
      if (trimmedSegment.length === 0) continue;

      const coordinateTokens = trimmedSegment.split(/[,/\s]+/).filter((token) => token.length > 0);
      if (coordinateTokens.length >= 2) {
        const inputVal = parseFloat(coordinateTokens[0]);
        const outputVal = parseFloat(coordinateTokens[1]);

        if (!Number.isNaN(inputVal) && !Number.isNaN(outputVal)) {
          points.push({
            inputValue: Math.max(0.0, Math.min(1.0, inputVal)),
            outputValue: Math.max(0.0, Math.min(1.0, outputVal)),
          });
        }
      }
    }
  }

  if (points.length === 0) {
    return null;
  }

  // Sort control points along sensor input axis (x-axis)
  points.sort((pointA, pointB) => pointA.inputValue - pointB.inputValue);

  // If only one point was specified, synthesize a second point to form a valid segment
  if (points.length === 1) {
    return [
      { inputValue: 0.0, outputValue: points[0].outputValue },
      { inputValue: 1.0, outputValue: points[0].outputValue },
    ];
  }

  return points;
}

/**
 * Determines the physical sensor input driving a dynamics parameter based on parameter key name.
 */
function determineSensorInput(parameterKey: string): SensorInputName {
  const normalizedKey = parameterKey.toLowerCase();
  if (normalizedKey.includes("initialdirection") || normalizedKey.includes("initial_direction")) return "initial_stroke_direction";
  if (
    normalizedKey.includes("drawingangle") ||
    normalizedKey.includes("drawing_angle") ||
    normalizedKey.includes("strokedirection") ||
    normalizedKey.includes("stroke_direction") ||
    normalizedKey.includes("direction")
  ) return "stroke_direction";
  if (normalizedKey.includes("tilt")) return "tiltX";
  if (normalizedKey.includes("speed") || normalizedKey.includes("velocity")) return "speed";
  if (normalizedKey.includes("rotation") || normalizedKey.includes("twist")) return "rotation";
  if (normalizedKey.includes("random")) return "random";
  if (normalizedKey.includes("distance")) return "distance";
  if (normalizedKey.includes("fade")) return "fade";
  return "pressure";
}

/**
 * Searches the preset parameter map for dynamics curve definitions bound to a target parameter.
 *
 * @param parsedXml Parsed preset metadata
 * @param parameterTarget Target parameter name (e.g. "size", "opacity", "flow")
 * @returns DynamicsMapping if curve is present and valid, null otherwise
 */
export function extractDynamicsMapping(
  parsedXml: ParsedPresetXml,
  parameterTarget: "size" | "opacity" | "flow" | "angle" | "scatter"
): DynamicsMapping | null {
  for (const [key, value] of parsedXml.parameterMap.entries()) {
    const lowerKey = key.toLowerCase();

    const matchesTarget =
      lowerKey.includes(parameterTarget) ||
      (parameterTarget === "size" && lowerKey.includes("diameter"));

    if (matchesTarget) {
      const curvePoints = parseDynamicsCurve(value);
      if (curvePoints && curvePoints.length >= 2) {
        return {
          sensorInput: determineSensorInput(key),
          curvePoints,
          isEnabled: true,
        };
      }
    }
  }

  return null;
}

/**
 * Builds PixelBrushParameters from parsed XML metadata.
 */
function buildPixelBrushParameters(
  parsedXml: ParsedPresetXml,
  baseSizePx: number,
  spacingFraction: number,
  baseOpacity: number,
  softness: number
): PixelBrushParameters {
  const brushTip: GeneratedBrushTip = {
    tipType: "generated",
    diameter: baseSizePx,
    hardness: Math.max(0.0, Math.min(1.0, 1.0 - softness)),
    aspectRatio: 1.0,
    angleRadians: 0.0,
  };

  return {
    engineId: "pixelbrush",
    brushTip,
    spacingFraction,
    baseOpacity,
    baseFlow: extractBaseFlow(parsedXml),
    baseSizePx,
    softness,
    scatterAmplitude: extractScatterAmplitude(parsedXml),
    isAirbrushMode: extractIsAirbrushMode(parsedXml),
    sizeDynamics: extractDynamicsMapping(parsedXml, "size"),
    opacityDynamics: extractDynamicsMapping(parsedXml, "opacity"),
    flowDynamics: extractDynamicsMapping(parsedXml, "flow"),
    angleDynamics: extractDynamicsMapping(parsedXml, "angle"),
    scatterDynamics: extractDynamicsMapping(parsedXml, "scatter"),
  };
}

/**
 * Builds ColorSmudgeParameters from parsed XML metadata.
 */
function buildColorSmudgeParameters(
  parsedXml: ParsedPresetXml,
  baseSizePx: number,
  spacingFraction: number,
  baseOpacity: number,
  softness: number
): ColorSmudgeParameters {
  const brushTip: GeneratedBrushTip = {
    tipType: "generated",
    diameter: baseSizePx,
    hardness: Math.max(0.0, Math.min(1.0, 1.0 - softness)),
    aspectRatio: 1.0,
    angleRadians: 0.0,
  };

  const rawSmudgeMode = findParameterValue(parsedXml.parameterMap, ["smudge_mode", "smudgeMode"]);
  const smudgeMode = rawSmudgeMode?.toLowerCase() === "dulling" ? "dulling" : "smearing";

  const rawColorRate = findParameterValue(parsedXml.parameterMap, ["color_rate", "colorRate"]);
  const colorRate = rawColorRate ? parseFloat(rawColorRate) : 0.5;

  const rawSmudgeLength = findParameterValue(parsedXml.parameterMap, [
    "smudge_length",
    "smudgeLength",
  ]);
  const smudgeLength = rawSmudgeLength ? parseFloat(rawSmudgeLength) : 0.5;

  const rawSmudgeRadius = findParameterValue(parsedXml.parameterMap, [
    "smudge_radius",
    "smudgeRadius",
  ]);
  const smudgeRadius = rawSmudgeRadius ? parseFloat(rawSmudgeRadius) : baseSizePx;

  return {
    engineId: "colorsmudge",
    brushTip,
    spacingFraction,
    baseOpacity,
    baseSizePx,
    smudgeMode,
    colorRate: Number.isNaN(colorRate) ? 0.5 : Math.max(0.0, Math.min(1.0, colorRate)),
    smudgeLength: Number.isNaN(smudgeLength) ? 0.5 : Math.max(0.0, Math.min(1.0, smudgeLength)),
    smudgeRadius: Number.isNaN(smudgeRadius) ? baseSizePx : Math.max(1.0, smudgeRadius),
    sampleAllLayers: false,
    sizeDynamics: extractDynamicsMapping(parsedXml, "size"),
    opacityDynamics: extractDynamicsMapping(parsedXml, "opacity"),
    smudgeRateDynamics: extractDynamicsMapping(parsedXml, "flow"),
  };
}

/**
 * Builds MyPaintParameters from parsed XML metadata.
 */
function buildMyPaintParameters(
  parsedXml: ParsedPresetXml,
  displayName: string
): MyPaintParameters {
  const jsonContent =
    findParameterValue(parsedXml.parameterMap, ["myb_json", "myb_content"]) ?? parsedXml.rawXml;

  return {
    engineId: "mypaint",
    mybJsonContent: jsonContent,
    brushName: displayName,
  };
}

/**
 * Generates a unique identifier string for a parsed preset.
 */
function generatePresetId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `kpp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Builds a complete BrushPreset conforming to src/types/brush.ts from preset XML and thumbnail data.
 *
 * @param xmlString Raw XML content extracted from PNG preset metadata
 * @param thumbnailPngData Raw PNG byte buffer representing the brush thumbnail
 * @returns Fully populated BrushPreset instance
 */
export function buildBrushPresetFromXml(
  xmlString: string,
  thumbnailPngData: Uint8Array | null
): BrushPreset {
  const parsedXml = parsePresetXml(xmlString);
  const engineType = extractPaintOpId(parsedXml);
  const displayName = extractDisplayName(parsedXml);
  const baseSizePx = extractBaseSizePx(parsedXml);
  const spacingFraction = extractSpacingFraction(parsedXml);
  const baseOpacity = extractBaseOpacity(parsedXml);
  const softness = extractSoftness(parsedXml);

  let engineParameters: BrushEngineParameters;

  switch (engineType) {
    case "colorsmudge":
      engineParameters = buildColorSmudgeParameters(
        parsedXml,
        baseSizePx,
        spacingFraction,
        baseOpacity,
        softness
      );
      break;
    case "mypaint":
      engineParameters = buildMyPaintParameters(parsedXml, displayName);
      break;
    case "pixelbrush":
    default:
      engineParameters = buildPixelBrushParameters(
        parsedXml,
        baseSizePx,
        spacingFraction,
        baseOpacity,
        softness
      );
      break;
  }

  const tagsRaw = findParameterValue(parsedXml.parameterMap, ["tags", "tag"]);
  const tags: readonly string[] = tagsRaw
    ? tagsRaw.split(/[,;]+/).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    : [];

  return {
    presetId: generatePresetId(),
    displayName,
    engineType,
    thumbnailPngData,
    engineParameters,
    smoothingConfig: { ...DEFAULT_STROKE_SMOOTHING_CONFIG },
    tags,
  };
}

/**
 * Primary deserializer: parses a Krita .kpp file buffer directly into a BrushPreset.
 * Validates PNG signature, extracts embedded XML from 'tEXt' or 'zTXt' metadata chunks,
 * and builds a fully typed BrushPreset.
 *
 * @param kppBuffer ArrayBuffer or Uint8Array representing the .kpp file
 * @returns Promise resolving to the parsed BrushPreset
 */
export async function parseKritaPreset(
  kppBuffer: ArrayBuffer | Uint8Array
): Promise<BrushPreset> {
  const fileBytes =
    kppBuffer instanceof Uint8Array
      ? kppBuffer
      : new Uint8Array(kppBuffer);

  if (!validatePngHeader(fileBytes)) {
    throw new Error(
      "Invalid Krita preset (.kpp): input buffer is not a valid PNG image."
    );
  }

  const xmlString = await extractPresetXmlFromPng(fileBytes);
  return buildBrushPresetFromXml(xmlString, fileBytes);
}
