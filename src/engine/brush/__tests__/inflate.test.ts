import { describe, it, expect } from "vitest";
import { inflateRaw, inflate } from "../inflate";
import * as zlib from "node:zlib";

describe("RFC 1951 Pure TypeScript Inflate", () => {
  it("decompresses uncompressed (stored) deflate blocks", () => {
    const text = "Hello from stored deflate block in pure TypeScript!";
    const original = new TextEncoder().encode(text);
    // Build a stored deflate block manually
    // Bit 0 = 1 (final block), Bits 1-2 = 00 (stored) -> Byte 0 = 0x01
    // Next 2 bytes: LEN (little endian), next 2 bytes: NLEN (~LEN)
    const storedBlock = new Uint8Array(5 + original.length);
    storedBlock[0] = 0x01; // BFINAL=1, BTYPE=00
    const len = original.length;
    const nlen = len ^ 0xffff;
    storedBlock[1] = len & 0xff;
    storedBlock[2] = (len >>> 8) & 0xff;
    storedBlock[3] = nlen & 0xff;
    storedBlock[4] = (nlen >>> 8) & 0xff;
    storedBlock.set(original, 5);

    const decompressed = inflateRaw(storedBlock);
    expect(new TextDecoder().decode(decompressed)).toBe(text);
  });

  it("decompresses raw deflate with dynamic Huffman codes", () => {
    const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(10);
    const original = new TextEncoder().encode(text);
    const deflated = zlib.deflateRawSync(original);

    const decompressed = inflateRaw(new Uint8Array(deflated));
    expect(new TextDecoder().decode(decompressed)).toBe(text);
  });

  it("decompresses repetitive compressible data with back-references", () => {
    const repetitive = "A".repeat(5000);
    const original = new TextEncoder().encode(repetitive);
    const deflated = zlib.deflateRawSync(original);

    const decompressed = inflateRaw(new Uint8Array(deflated));
    expect(new TextDecoder().decode(decompressed)).toBe(repetitive);
  });

  it("decompresses zlib-wrapped deflate streams via inflate()", () => {
    const xml = `<?xml version="1.0"?><KisPaintOpPreset name="Pencil-2B"><param name="size">45</param></KisPaintOpPreset>`;
    const original = new TextEncoder().encode(xml);
    const deflatedZlib = zlib.deflateSync(original);

    const decompressed = inflate(new Uint8Array(deflatedZlib));
    expect(new TextDecoder().decode(decompressed)).toBe(xml);
  });

  it("handles empty payload", () => {
    const original = new Uint8Array(0);
    const deflated = zlib.deflateRawSync(original);
    const decompressed = inflateRaw(new Uint8Array(deflated));
    expect(decompressed.length).toBe(0);
  });
});
