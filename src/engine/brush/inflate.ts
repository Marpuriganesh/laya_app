/**
 * Pure TypeScript RFC 1951 DEFLATE Decompressor
 *
 * Provides a 100% zero-dependency, static PWA-safe raw deflate decompressor.
 * Guarantees reliable brush bundle and preset decompression on iOS Safari 16-17.1,
 * where DecompressionStream("deflate-raw") is unavailable or throws TypeError.
 *
 * Fully compliant with RFC 1951 (DEFLATE Compressed Data Format Specification).
 * 1:1 portable to C++ / Rust.
 */

/**
 * Binary tree node for canonical Huffman decoding.
 */
interface HuffmanNode {
  symbol?: number;
  left?: HuffmanNode;
  right?: HuffmanNode;
}

/**
 * Bit reader for reading variable-length bit codes packed LSB-first into bytes.
 */
class DeflateBitReader {
  private byteOffset = 0;
  private bitBuffer = 0;
  private bitsInBuffer = 0;

  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /**
   * Reads up to 16 bits from the stream (LSB first).
   */
  readBits(count: number): number {
    if (count === 0) return 0;
    while (this.bitsInBuffer < count) {
      if (this.byteOffset >= this.data.length) {
        throw new Error("Unexpected end of compressed stream.");
      }
      this.bitBuffer |= this.data[this.byteOffset++] << this.bitsInBuffer;
      this.bitsInBuffer += 8;
    }
    const mask = (1 << count) - 1;
    const value = this.bitBuffer & mask;
    this.bitBuffer >>>= count;
    this.bitsInBuffer -= count;
    return value;
  }

  /**
   * Discards any remaining fractional bits in the current byte to align to byte boundary.
   */
  readByteAlign(): void {
    this.bitBuffer = 0;
    this.bitsInBuffer = 0;
  }

  /**
   * Reads exact uncompressed byte slice after byte alignment.
   */
  readBytes(length: number): Uint8Array {
    this.readByteAlign();
    if (this.byteOffset + length > this.data.length) {
      throw new Error("Unexpected end of compressed stream during uncompressed block.");
    }
    const slice = this.data.subarray(this.byteOffset, this.byteOffset + length);
    this.byteOffset += length;
    return slice;
  }
}

/**
 * Builds a canonical Huffman decoding tree from an array of code lengths (RFC 1951 Section 3.2.2).
 */
function buildHuffmanTree(codeLengths: readonly number[]): HuffmanNode {
  let maxBits = 0;
  for (let i = 0; i < codeLengths.length; i++) {
    if (codeLengths[i] > maxBits) {
      maxBits = codeLengths[i];
    }
  }

  if (maxBits === 0) {
    return {};
  }

  // Count code lengths
  const blCount = new Array<number>(maxBits + 1).fill(0);
  for (let i = 0; i < codeLengths.length; i++) {
    const len = codeLengths[i];
    if (len > 0) {
      blCount[len]++;
    }
  }

  // Find numerical value of smallest code for each length
  const nextCode = new Array<number>(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }

  // Assign numerical values to all codes and build binary decoding tree
  const root: HuffmanNode = {};
  for (let symbol = 0; symbol < codeLengths.length; symbol++) {
    const len = codeLengths[symbol];
    if (len > 0) {
      const symCode = nextCode[len]++;
      let node = root;
      for (let bit = len - 1; bit >= 0; bit--) {
        const b = (symCode >>> bit) & 1;
        if (b === 0) {
          if (!node.left) node.left = {};
          node = node.left;
        } else {
          if (!node.right) node.right = {};
          node = node.right;
        }
      }
      node.symbol = symbol;
    }
  }

  return root;
}

/**
 * Decodes a single symbol using a canonical Huffman tree.
 */
function decodeSymbol(reader: DeflateBitReader, root: HuffmanNode): number {
  let node = root;
  while (node.symbol === undefined) {
    const bit = reader.readBits(1);
    const nextNode = bit === 0 ? node.left : node.right;
    if (!nextNode) {
      throw new Error("Corrupted compressed data: invalid Huffman code.");
    }
    node = nextNode;
  }
  return node.symbol;
}

// RFC 1951 Fixed Huffman Tables (Section 3.2.6)
function createFixedLiteralLengths(): number[] {
  const lengths = new Array<number>(288);
  for (let i = 0; i <= 143; i++) lengths[i] = 8;
  for (let i = 144; i <= 255; i++) lengths[i] = 9;
  for (let i = 256; i <= 279; i++) lengths[i] = 7;
  for (let i = 280; i <= 287; i++) lengths[i] = 8;
  return lengths;
}

const FIXED_LITERAL_TREE = buildHuffmanTree(createFixedLiteralLengths());
const FIXED_DISTANCE_TREE = buildHuffmanTree(new Array<number>(32).fill(5));

// Code length alphabet permutation order (Section 3.2.7)
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Match length bases and extra bits (Section 3.2.5)
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

// Distance bases and extra bits (Section 3.2.5)
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
  13,
];

/**
 * Resizable byte buffer for collecting uncompressed payload.
 */
class ResizableOutputBuffer {
  private buffer: Uint8Array;
  public length = 0;

  constructor(initialCapacity = 65536) {
    this.buffer = new Uint8Array(initialCapacity);
  }

  push(byte: number): void {
    if (this.length >= this.buffer.length) {
      const nextBuffer = new Uint8Array(this.buffer.length * 2);
      nextBuffer.set(this.buffer);
      this.buffer = nextBuffer;
    }
    this.buffer[this.length++] = byte;
  }

  copyBack(distance: number, length: number): void {
    const startPos = this.length - distance;
    if (startPos < 0) {
      throw new Error("Corrupted deflate stream: backward copy distance exceeds buffer size.");
    }

    // Ensure capacity
    if (this.length + length > this.buffer.length) {
      let newCapacity = this.buffer.length * 2;
      while (newCapacity < this.length + length) {
        newCapacity *= 2;
      }
      const nextBuffer = new Uint8Array(newCapacity);
      nextBuffer.set(this.buffer);
      this.buffer = nextBuffer;
    }

    // Byte-by-byte copy because distance may be smaller than length (e.g. repeated patterns)
    for (let i = 0; i < length; i++) {
      this.buffer[this.length] = this.buffer[startPos + i];
      this.length++;
    }
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

/**
 * Decompresses raw DEFLATE byte streams (RFC 1951) without container headers.
 * Used for ZIP method 8 entries and raw deflate streams.
 *
 * @param compressedBytes Raw compressed deflate bytes
 * @returns Decompressed bytes
 */
export function inflateRaw(compressedBytes: Uint8Array): Uint8Array {
  const reader = new DeflateBitReader(compressedBytes);
  const output = new ResizableOutputBuffer(Math.max(65536, compressedBytes.length * 2));

  let isFinalBlock = false;

  while (!isFinalBlock) {
    isFinalBlock = reader.readBits(1) === 1;
    const blockType = reader.readBits(2);

    if (blockType === 0) {
      // 00: Uncompressed / Stored Block
      reader.readByteAlign();
      const len = reader.readBits(16);
      const nlen = reader.readBits(16);
      if ((len ^ 0xffff) !== nlen) {
        throw new Error("Invalid uncompressed block: LEN and NLEN mismatch.");
      }
      const rawBytes = reader.readBytes(len);
      for (let i = 0; i < rawBytes.length; i++) {
        output.push(rawBytes[i]);
      }
    } else if (blockType === 1) {
      // 01: Compressed with Fixed Huffman Codes
      inflateBlock(reader, output, FIXED_LITERAL_TREE, FIXED_DISTANCE_TREE);
    } else if (blockType === 2) {
      // 10: Compressed with Dynamic Huffman Codes
      const hlit = reader.readBits(5) + 257;
      const hdist = reader.readBits(5) + 1;
      const hclen = reader.readBits(4) + 4;

      const codeLengths = new Array<number>(19).fill(0);
      for (let i = 0; i < hclen; i++) {
        codeLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3);
      }
      const codeLengthTree = buildHuffmanTree(codeLengths);

      const totalCodes = hlit + hdist;
      const treeLengths: number[] = [];

      while (treeLengths.length < totalCodes) {
        const symbol = decodeSymbol(reader, codeLengthTree);
        if (symbol <= 15) {
          treeLengths.push(symbol);
        } else if (symbol === 16) {
          if (treeLengths.length === 0) {
            throw new Error("Invalid repeat code length with no prior symbol.");
          }
          const prevLength = treeLengths[treeLengths.length - 1];
          const repeatCount = reader.readBits(2) + 3;
          for (let r = 0; r < repeatCount; r++) {
            treeLengths.push(prevLength);
          }
        } else if (symbol === 17) {
          const repeatCount = reader.readBits(3) + 3;
          for (let r = 0; r < repeatCount; r++) {
            treeLengths.push(0);
          }
        } else if (symbol === 18) {
          const repeatCount = reader.readBits(7) + 11;
          for (let r = 0; r < repeatCount; r++) {
            treeLengths.push(0);
          }
        } else {
          throw new Error(`Invalid code length symbol: ${symbol}`);
        }
      }

      const litLengths = treeLengths.slice(0, hlit);
      const distLengths = treeLengths.slice(hlit, hlit + hdist);
      const dynamicLiteralTree = buildHuffmanTree(litLengths);
      const dynamicDistanceTree = buildHuffmanTree(distLengths);

      inflateBlock(reader, output, dynamicLiteralTree, dynamicDistanceTree);
    } else {
      throw new Error(`Unsupported DEFLATE block type: ${blockType}`);
    }
  }

  return output.toUint8Array();
}

/**
 * Decodes literal, length, and distance symbols within an active Huffman block.
 */
function inflateBlock(
  reader: DeflateBitReader,
  output: ResizableOutputBuffer,
  literalTree: HuffmanNode,
  distanceTree: HuffmanNode
): void {
  while (true) {
    const symbol = decodeSymbol(reader, literalTree);

    if (symbol < 256) {
      // Literal byte
      output.push(symbol);
    } else if (symbol === 256) {
      // End of block
      break;
    } else {
      // Length / distance backward match
      const lenIndex = symbol - 257;
      if (lenIndex >= LENGTH_BASE.length) {
        throw new Error(`Invalid match length symbol: ${symbol}`);
      }
      const length = LENGTH_BASE[lenIndex] + reader.readBits(LENGTH_EXTRA[lenIndex]);

      const distSymbol = decodeSymbol(reader, distanceTree);
      if (distSymbol >= DISTANCE_BASE.length) {
        throw new Error(`Invalid match distance symbol: ${distSymbol}`);
      }
      const distance = DISTANCE_BASE[distSymbol] + reader.readBits(DISTANCE_EXTRA[distSymbol]);

      output.copyBack(distance, length);
    }
  }
}

/**
 * Decompresses either raw DEFLATE or ZLIB-wrapped streams.
 * Automatically detects and strips RFC 1950 ZLIB headers when present.
 *
 * @param data Compressed byte stream
 * @returns Decompressed byte array
 */
export function inflate(data: Uint8Array): Uint8Array {
  // Check for 2-byte RFC 1950 ZLIB container header
  // Byte 0: CMF (0x78 = Deflate with 32KB window)
  // Byte 1: FLG (CMF * 256 + FLG) % 31 === 0
  if (data.length >= 6 && data[0] === 0x78 && (data[0] * 256 + data[1]) % 31 === 0) {
    // Strip 2-byte header and 4-byte Adler-32 trailer
    const rawDeflateSlice = data.subarray(2, data.length - 4);
    return inflateRaw(rawDeflateSlice);
  }

  // Raw deflate
  return inflateRaw(data);
}
