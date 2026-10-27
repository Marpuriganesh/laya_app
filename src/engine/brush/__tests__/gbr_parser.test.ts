import { describe, it, expect } from "vitest";
import { parseGbr } from "../gbr_parser";

function createSyntheticGbr(
  width: number,
  height: number,
  bytesPerPixel: number,
  name: string,
  pixelData: Uint8Array
): Uint8Array {
  const nameBytes = new TextEncoder().encode(name + "\0");
  const headerSize = 28 + nameBytes.length;
  const totalSize = headerSize + pixelData.length;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, headerSize, false);
  view.setUint32(4, 2, false); // version 2
  view.setUint32(8, width, false);
  view.setUint32(12, height, false);
  view.setUint32(16, bytesPerPixel, false);

  buffer.set(nameBytes, 28);
  buffer.set(pixelData, headerSize);

  return buffer;
}

describe("gbr_parser", () => {
  it("rejects buffers smaller than minimum GBR header", () => {
    const tiny = new Uint8Array([1, 2, 3]);
    expect(parseGbr(tiny)).toBeNull();
  });

  it("parses 1 BPP grayscale GBR with inversion (0 ink -> 255 alpha)", () => {
    // 2x2 grayscale: [0 (black ink), 128 (gray), 255 (white paper), 64 (dark)]
    const pixels = new Uint8Array([0, 128, 255, 64]);
    const gbr = createSyntheticGbr(2, 2, 1, "Calligraphy Stamp", pixels);

    const parsed = parseGbr(gbr);
    expect(parsed).not.toBeNull();
    expect(parsed?.width).toBe(2);
    expect(parsed?.height).toBe(2);
    expect(parsed?.name).toBe("Calligraphy Stamp");
    expect(parsed?.mask[0]).toBe(255); // Inverted 0 -> 255
    expect(parsed?.mask[1]).toBe(127); // Inverted 128 -> 127
    expect(parsed?.mask[2]).toBe(0);   // Inverted 255 -> 0
    expect(parsed?.mask[3]).toBe(191); // Inverted 64 -> 191
  });

  it("parses 4 BPP RGBA GBR with transparency channel", () => {
    // 1x2 RGBA: [R, G, B, A]
    const pixels = new Uint8Array([
      255, 0, 0, 200,
      0, 255, 0, 50,
    ]);
    const gbr = createSyntheticGbr(1, 2, 4, "Chalk Stamp", pixels);

    const parsed = parseGbr(gbr);
    expect(parsed).not.toBeNull();
    expect(parsed?.width).toBe(1);
    expect(parsed?.height).toBe(2);
    expect(parsed?.mask[0]).toBe(200);
    expect(parsed?.mask[1]).toBe(50);
  });
});
