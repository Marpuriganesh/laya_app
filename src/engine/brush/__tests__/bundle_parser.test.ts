import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseBundleMetadata, parseKritaBundle } from "../bundle_parser";

/**
 * Minimal ZIP generator helper for creating synthetic in-memory .bundle archives.
 */
function createSyntheticZip(files: Array<{ name: string; data: Uint8Array | string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaderParts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];

  let currentOffset = 0;

  for (const file of files) {
    const filenameBytes = encoder.encode(file.name);
    const contentBytes = typeof file.data === "string" ? encoder.encode(file.data) : file.data;

    // Local Header
    const localHeader = new Uint8Array(30 + filenameBytes.length + contentBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true); // Stored
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true);

    localHeader.set(filenameBytes, 30);
    localHeader.set(contentBytes, 30 + filenameBytes.length);
    localHeaderParts.push(localHeader);

    // Central Directory Header
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, currentOffset, true);

    centralHeader.set(filenameBytes, 46);
    centralDirParts.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const centralDirOffset = currentOffset;
  let centralDirSize = 0;
  for (const cd of centralDirParts) {
    centralDirSize += cd.length;
  }

  // End of Central Directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = centralDirOffset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let writePos = 0;

  for (const part of localHeaderParts) {
    result.set(part, writePos);
    writePos += part.length;
  }
  for (const part of centralDirParts) {
    result.set(part, writePos);
    writePos += part.length;
  }
  result.set(eocd, writePos);

  return result;
}

describe("BundleParser", () => {
  it("extracts bundle metadata correctly from XML", () => {
    const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.calligra.org/koffice/bundle/metadata">
        <name>David Revoy Concept Kit</name>
        <author>David Revoy</author>
        <description>Professional painting brush set</description>
        <version>2.0</version>
      </package>`;

    const metadata = parseBundleMetadata(metaXml);
    expect(metadata.bundleName).toBe("David Revoy Concept Kit");
    expect(metadata.author).toBe("David Revoy");
    expect(metadata.description).toBe("Professional painting brush set");
    expect(metadata.version).toBe("2.0");
  });

  it("falls back to default metadata when meta.xml tags are missing", () => {
    const emptyXml = "<package></package>";
    const metadata = parseBundleMetadata(emptyXml, "Custom Kit");
    expect(metadata.bundleName).toBe("Custom Kit");
    expect(metadata.author).toBe("Unknown Author");
    expect(metadata.description).toBe("");
  });

  it("extracts and parses all .kpp presets inside a .bundle archive", async () => {
    const fixturePath = path.resolve(__dirname, "../__fixtures__/sample.kpp");
    const sampleKppBytes = new Uint8Array(fs.readFileSync(fixturePath));

    const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
      <package>
        <name>Inking Pro Bundle</name>
        <author>Studio Inker</author>
      </package>`;

    const syntheticBundle = createSyntheticZip([
      { name: "mimetype", data: "application/x-krita-bundle" },
      { name: "meta.xml", data: metaXml },
      { name: "paintoppresets/brush_studio.kpp", data: sampleKppBytes },
      { name: "paintoppresets/brush_fine.kpp", data: sampleKppBytes },
      { name: "__MACOSX/paintoppresets/._brush_studio.kpp", data: "garbage" },
    ]);

    const result = await parseKritaBundle(syntheticBundle);

    expect(result.metadata.bundleName).toBe("Inking Pro Bundle");
    expect(result.metadata.author).toBe("Studio Inker");
    expect(result.presets.length).toBe(2);

    // Verify presets are fully parsed and tagged
    for (const preset of result.presets) {
      expect(preset.presetId).toBeDefined();
      expect(preset.tags).toContain("Inking Pro Bundle");
      expect(preset.tags).toContain("Imported");
      expect(preset.tags).toContain("Krita");
      expect(preset.thumbnailPngData).not.toBeNull();
    }
  });
});
