import { describe, it, expect } from "vitest";
import { findEndOfCentralDirectory, readZipArchive } from "../zip_reader";

/**
 * Helper to build a minimal valid synthetic ZIP archive in memory (PKZIP 2.0 Stored format).
 */
function createSyntheticStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaderParts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];

  let currentOffset = 0;

  for (const file of files) {
    const filenameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);

    // 1. Local Header (30 bytes + filename + content)
    const localHeader = new Uint8Array(30 + filenameBytes.length + contentBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true); // Signature
    localView.setUint16(4, 20, true); // Version
    localView.setUint16(6, 0, true); // Flags
    localView.setUint16(8, 0, true); // Compression: 0 (Stored)
    localView.setUint16(10, 0, true); // Mod time
    localView.setUint16(12, 0, true); // Mod date
    localView.setUint32(14, 0, true); // CRC32 (zero for test)
    localView.setUint32(18, contentBytes.length, true); // Compressed size
    localView.setUint32(22, contentBytes.length, true); // Uncompressed size
    localView.setUint16(26, filenameBytes.length, true); // Filename length
    localView.setUint16(28, 0, true); // Extra length

    localHeader.set(filenameBytes, 30);
    localHeader.set(contentBytes, 30 + filenameBytes.length);

    localHeaderParts.push(localHeader);

    // 2. Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true); // Signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed
    centralView.setUint16(8, 0, true); // Flags
    centralView.setUint16(10, 0, true); // Compression: 0
    centralView.setUint16(12, 0, true); // Mod time
    centralView.setUint16(14, 0, true); // Mod date
    centralView.setUint32(16, 0, true); // CRC32
    centralView.setUint32(20, contentBytes.length, true); // Compressed size
    centralView.setUint32(24, contentBytes.length, true); // Uncompressed size
    centralView.setUint16(28, filenameBytes.length, true); // Filename length
    centralView.setUint16(30, 0, true); // Extra length
    centralView.setUint16(32, 0, true); // Comment length
    centralView.setUint16(34, 0, true); // Disk start
    centralView.setUint16(36, 0, true); // Internal attributes
    centralView.setUint32(38, 0, true); // External attributes
    centralView.setUint32(42, currentOffset, true); // Relative offset of local header

    centralHeader.set(filenameBytes, 46);
    centralDirParts.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const centralDirOffset = currentOffset;
  let centralDirSize = 0;
  for (const cd of centralDirParts) {
    centralDirSize += cd.length;
  }

  // 3. End of Central Directory (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // Signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Start disk
  eocdView.setUint16(8, files.length, true); // Records on this disk
  eocdView.setUint16(10, files.length, true); // Total records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirOffset, true); // Offset of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  // Combine all parts
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

describe("ZipReader", () => {
  it("rejects buffers smaller than minimum ZIP size", async () => {
    await expect(readZipArchive(new Uint8Array(10))).rejects.toThrow(
      "Invalid ZIP file: buffer is too small"
    );
  });

  it("locates the End of Central Directory record", () => {
    const zipBytes = createSyntheticStoredZip([
      { name: "test.txt", content: "Hello Antigravity!" },
    ]);
    const offset = findEndOfCentralDirectory(zipBytes);
    expect(offset).toBeGreaterThan(0);
  });

  it("reads stored files from Central Directory", async () => {
    const zipBytes = createSyntheticStoredZip([
      { name: "meta.xml", content: "<meta><name>Artistic Bundle</name></meta>" },
      { name: "paintoppresets/brush1.kpp", content: "KPP_DUMMY_DATA_1" },
      { name: "paintoppresets/brush2.kpp", content: "KPP_DUMMY_DATA_2" },
    ]);

    const archive = await readZipArchive(zipBytes);
    expect(archive.entries.length).toBe(3);

    const metaEntry = archive.getEntry("meta.xml");
    expect(metaEntry).toBeDefined();
    const metaText = await metaEntry?.getText();
    expect(metaText).toBe("<meta><name>Artistic Bundle</name></meta>");

    const kppEntries = archive.filterEntries((fn) => fn.startsWith("paintoppresets/"));
    expect(kppEntries.length).toBe(2);

    const brush1Data = await kppEntries[0].getData();
    expect(new TextDecoder().decode(brush1Data)).toBe("KPP_DUMMY_DATA_1");
  });

  it("handles directory normalization and forward slashes", async () => {
    const zipBytes = createSyntheticStoredZip([
      { name: "paintoppresets\\folder\\test.kpp", content: "test" },
    ]);

    const archive = await readZipArchive(zipBytes);
    expect(archive.entries[0].filename).toBe("paintoppresets/folder/test.kpp");
  });

  it("falls back to local header scanning if EOCD is absent", async () => {
    const zipBytes = createSyntheticStoredZip([
      { name: "file1.txt", content: "A" },
      { name: "file2.txt", content: "B" },
    ]);

    // Truncate central directory & EOCD so only local headers remain
    const localHeaderPart = zipBytes.subarray(0, 30 + 9 + 1 + 30 + 9 + 1);
    const archive = await readZipArchive(localHeaderPart);

    expect(archive.entries.length).toBe(2);
    expect(archive.entries[0].filename).toBe("file1.txt");
    expect(await archive.entries[0].getText()).toBe("A");
    expect(archive.entries[1].filename).toBe("file2.txt");
    expect(await archive.entries[1].getText()).toBe("B");
  });

  it("extracts and decompresses Deflate (method 8) entries using inflate fallback", async () => {
    // Import node:zlib to build a deflate raw entry
    const zlib = await import("node:zlib");
    const filename = "brushes/pencil.kpp";
    const content = "<KisPaintOpPreset name='Pencil 2B'><size>35</size></KisPaintOpPreset>";
    const encoder = new TextEncoder();
    const filenameBytes = encoder.encode(filename);
    const contentBytes = encoder.encode(content);
    const compressedBytes = new Uint8Array(zlib.deflateRawSync(contentBytes));

    // Local Header
    const localHeader = new Uint8Array(30 + filenameBytes.length + compressedBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 8, true); // Compression: 8 (Deflate)
    lv.setUint32(18, compressedBytes.length, true);
    lv.setUint32(22, contentBytes.length, true);
    lv.setUint16(26, filenameBytes.length, true);
    localHeader.set(filenameBytes, 30);
    localHeader.set(compressedBytes, 30 + filenameBytes.length);

    // Central Directory
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 8, true); // Method 8
    cv.setUint32(20, compressedBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, filenameBytes.length, true);
    cv.setUint32(42, 0, true); // Offset 0
    centralHeader.set(filenameBytes, 46);

    // EOCD
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, centralHeader.length, true);
    ev.setUint32(16, localHeader.length, true);

    const total = localHeader.length + centralHeader.length + eocd.length;
    const zipBytes = new Uint8Array(total);
    zipBytes.set(localHeader, 0);
    zipBytes.set(centralHeader, localHeader.length);
    zipBytes.set(eocd, localHeader.length + centralHeader.length);

    const archive = await readZipArchive(zipBytes);
    expect(archive.entries.length).toBe(1);
    expect(archive.entries[0].filename).toBe(filename);
    expect(archive.entries[0].compressionMethod).toBe(8);

    const extractedText = await archive.entries[0].getText();
    expect(extractedText).toBe(content);
  });
});
