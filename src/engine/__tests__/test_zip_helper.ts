/**
 * Test helper for generating minimal synthetic ZIP archives in memory.
 */
export function createSyntheticStoredZip(
  files: Array<{ name: string; content: string | Uint8Array }>
): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaderParts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];

  let currentOffset = 0;

  for (const file of files) {
    const filenameBytes = encoder.encode(file.name);
    const contentBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;

    // 1. Local Header
    const localHeader = new Uint8Array(30 + filenameBytes.length + contentBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
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

    // 2. Central Directory Header
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

  // 3. End of Central Directory
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
