/**
 * Lightweight Zero-Dependency ZIP Archive Reader
 * Complies with PKZIP 2.0 specification for reading .bundle and .kra archives.
 * 100% PWA and client-side safe: zero npm dependencies, zero server runtime.
 */

import { decompressDeflate } from "./kpp_parser";
import { inflateRaw, inflate } from "./inflate";

export { inflateRaw, inflate };

/**
 * Standard PKZIP magic signatures (little-endian).
 */
export const ZIP_SIGNATURES = {
  LOCAL_FILE_HEADER: 0x04034b50,
  CENTRAL_DIRECTORY_HEADER: 0x02014b50,
  END_OF_CENTRAL_DIRECTORY: 0x06054b50,
} as const;

/**
 * Represents a single file or directory inside a ZIP archive.
 */
export interface ZipEntry {
  readonly filename: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number; // 0 = Stored, 8 = Deflated
  readonly isDirectory: boolean;
  getData(): Promise<Uint8Array>;
  getText(): Promise<string>;
}

/**
 * Parsed record from the Central Directory.
 */
export interface CentralDirectoryRecord {
  readonly filename: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly isDirectory: boolean;
}

/**
 * Represents an open ZIP archive container.
 */
export interface ZipArchive {
  readonly entries: readonly ZipEntry[];
  getEntry(filename: string): ZipEntry | undefined;
  filterEntries(predicate: (filename: string) => boolean): readonly ZipEntry[];
}

/**
 * Scans backwards from the end of the byte buffer to locate the End of Central Directory (EOCD) signature.
 * EOCD record is at least 22 bytes long and at most (22 + 65535) bytes from the end.
 *
 * @param bytes Raw ZIP archive bytes
 * @returns Offset of the EOCD record, or -1 if not found
 */
export function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minEocdLength = 22;
  const maxCommentLength = 65535;
  const searchStart = bytes.length - minEocdLength;
  const searchEnd = Math.max(0, bytes.length - minEocdLength - maxCommentLength);

  for (let offset = searchStart; offset >= searchEnd; offset--) {
    if (
      bytes[offset] === 0x50 && // 'P'
      bytes[offset + 1] === 0x4b && // 'K'
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }

  return -1;
}

/**
 * Parses Central Directory file headers starting at the specified offset.
 *
 * @param bytes Raw ZIP archive bytes
 * @param centralDirOffset Starting byte offset of Central Directory
 * @param totalRecords Total number of entries in the Central Directory
 * @returns Array of parsed CentralDirectoryRecords
 */
export function parseCentralDirectory(
  bytes: Uint8Array,
  centralDirOffset: number,
  totalRecords: number
): CentralDirectoryRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const textDecoder = new TextDecoder("utf-8");
  const records: CentralDirectoryRecord[] = [];
  let currentOffset = centralDirOffset;

  for (let i = 0; i < totalRecords && currentOffset + 46 <= bytes.length; i++) {
    const signature = view.getUint32(currentOffset, true);
    if (signature !== ZIP_SIGNATURES.CENTRAL_DIRECTORY_HEADER) {
      break;
    }

    const compressionMethod = view.getUint16(currentOffset + 10, true);
    const compressedSize = view.getUint32(currentOffset + 20, true);
    const uncompressedSize = view.getUint32(currentOffset + 24, true);
    const filenameLength = view.getUint16(currentOffset + 28, true);
    const extraFieldLength = view.getUint16(currentOffset + 30, true);
    const commentLength = view.getUint16(currentOffset + 32, true);
    const localHeaderOffset = view.getUint32(currentOffset + 42, true);

    const filenameBytes = bytes.subarray(currentOffset + 46, currentOffset + 46 + filenameLength);
    const rawFilename = textDecoder.decode(filenameBytes).replace(/\\/g, "/");

    const isDirectory = rawFilename.endsWith("/") || (uncompressedSize === 0 && compressedSize === 0 && rawFilename.endsWith("/"));

    records.push({
      filename: rawFilename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory,
    });

    currentOffset += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return records;
}

/**
 * Extracts uncompressed byte payload for a specific Central Directory record.
 *
 * @param bytes Entire ZIP archive byte buffer
 * @param record Central directory record
 * @returns Promise resolving to the uncompressed Uint8Array
 */
export async function extractRecordData(
  bytes: Uint8Array,
  record: CentralDirectoryRecord
): Promise<Uint8Array> {
  if (record.isDirectory || record.uncompressedSize === 0) {
    return new Uint8Array(0);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = record.localHeaderOffset;

  if (localOffset + 30 > bytes.length) {
    throw new Error(`Corrupted ZIP archive: local header offset ${localOffset} is out of bounds.`);
  }

  const localSignature = view.getUint32(localOffset, true);
  if (localSignature !== ZIP_SIGNATURES.LOCAL_FILE_HEADER) {
    throw new Error(`Invalid ZIP local file header at offset ${localOffset}.`);
  }

  const localFilenameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localFilenameLength + localExtraLength;
  const dataEnd = dataStart + record.compressedSize;

  if (dataEnd > bytes.length) {
    throw new Error(`Corrupted ZIP file data: end offset ${dataEnd} exceeds archive size.`);
  }

  const compressedSlice = bytes.subarray(dataStart, dataEnd);

  // Method 0: Stored (Uncompressed)
  if (record.compressionMethod === 0) {
    return new Uint8Array(compressedSlice);
  }

  // Method 8: Deflate
  if (record.compressionMethod === 8) {
    try {
      return await decompressDeflate(compressedSlice);
    } catch {
      return inflateRaw(compressedSlice);
    }
  }

  throw new Error(`Unsupported ZIP compression method: ${record.compressionMethod}.`);
}

/**
 * Fallback scanner when EOCD cannot be found: scans forward from start of archive through local headers.
 */
export function scanLocalHeadersFallback(bytes: Uint8Array): CentralDirectoryRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const textDecoder = new TextDecoder("utf-8");
  const records: CentralDirectoryRecord[] = [];
  let currentOffset = 0;

  while (currentOffset + 30 <= bytes.length) {
    const signature = view.getUint32(currentOffset, true);
    if (signature !== ZIP_SIGNATURES.LOCAL_FILE_HEADER) {
      currentOffset++;
      continue;
    }

    const compressionMethod = view.getUint16(currentOffset + 8, true);
    const compressedSize = view.getUint32(currentOffset + 18, true);
    const uncompressedSize = view.getUint32(currentOffset + 22, true);
    const filenameLength = view.getUint16(currentOffset + 26, true);
    const extraFieldLength = view.getUint16(currentOffset + 28, true);

    const filenameBytes = bytes.subarray(currentOffset + 30, currentOffset + 30 + filenameLength);
    const filename = textDecoder.decode(filenameBytes).replace(/\\/g, "/");

    records.push({
      filename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset: currentOffset,
      isDirectory: filename.endsWith("/"),
    });

    currentOffset += 30 + filenameLength + extraFieldLength + compressedSize;
  }

  return records;
}

/**
 * Opens and parses a ZIP archive buffer directly in memory.
 *
 * @param buffer ArrayBuffer or Uint8Array representing the ZIP file
 * @returns Promise resolving to a ZipArchive interface
 */
export async function readZipArchive(buffer: ArrayBuffer | Uint8Array): Promise<ZipArchive> {
  const fileBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (fileBytes.length < 22) {
    throw new Error("Invalid ZIP file: buffer is too small to be a valid ZIP archive.");
  }

  const eocdOffset = findEndOfCentralDirectory(fileBytes);
  let records: CentralDirectoryRecord[];

  if (eocdOffset !== -1) {
    const view = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    records = parseCentralDirectory(fileBytes, centralDirOffset, totalEntries);
  } else {
    // Fall back to scanning local headers if EOCD is omitted or damaged
    records = scanLocalHeadersFallback(fileBytes);
  }

  const entries: ZipEntry[] = records.map((record) => {
    let cachedData: Uint8Array | null = null;

    return {
      filename: record.filename,
      compressedSize: record.compressedSize,
      uncompressedSize: record.uncompressedSize,
      compressionMethod: record.compressionMethod,
      isDirectory: record.isDirectory,
      async getData(): Promise<Uint8Array> {
        if (!cachedData) {
          cachedData = await extractRecordData(fileBytes, record);
        }
        return cachedData;
      },
      async getText(): Promise<string> {
        const data = await this.getData();
        return new TextDecoder("utf-8").decode(data);
      },
    };
  });

  return {
    entries,
    getEntry(filename: string): ZipEntry | undefined {
      const normalizedTarget = filename.replace(/\\/g, "/");
      return entries.find((e) => e.filename === normalizedTarget);
    },
    filterEntries(predicate: (filename: string) => boolean): readonly ZipEntry[] {
      return entries.filter((e) => predicate(e.filename));
    },
  };
}
