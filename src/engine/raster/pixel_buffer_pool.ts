/**
 * Zero-Allocation Pixel Buffer & ImageData Memory Pool
 * Reuses typed array buffers and ImageData instances during active stroke drawing
 * to prevent garbage collection pauses during high-frequency dab stamping and sub-rect commits.
 *
 * iPad 9th Gen (A13 Bionic, 3GB RAM) Baseline:
 * Stamping 60 dabs/sec or committing rapid strokes without pooling would allocate
 * megabytes of transient buffers per second, triggering WebKit GC stutter.
 * This pool ensures zero-allocation recycling.
 */

export class PixelBufferPool {
  private readonly freeBuffers: Uint8ClampedArray[] = [];
  private readonly maxPoolCapacity: number;

  /**
   * Initializes a zero-allocation buffer pool.
   *
   * @param maxPoolCapacity Maximum number of idle buffers to retain in memory (defaults to 16)
   */
  constructor(maxPoolCapacity = 16) {
    this.maxPoolCapacity = Math.max(1, Math.floor(maxPoolCapacity));
  }

  /**
   * Acquires a Uint8ClampedArray with at least the requested byte length.
   * Reuses an existing pooled buffer if one with sufficient capacity is available.
   *
   * @param minimumByteLength Minimum required buffer capacity in bytes
   * @returns A Uint8ClampedArray with length >= minimumByteLength
   */
  public acquire(minimumByteLength: number): Uint8ClampedArray {
    const requiredBytes = Math.max(1, Math.ceil(minimumByteLength));

    // Search for a reusable buffer in the pool that fits the requested size
    for (let index = 0; index < this.freeBuffers.length; index++) {
      const candidateBuffer = this.freeBuffers[index];
      if (candidateBuffer.byteLength >= requiredBytes) {
        this.freeBuffers.splice(index, 1);
        return candidateBuffer;
      }
    }

    // Allocate aligned capacity (next power-of-2 or minimum 4096 bytes) to prevent churn
    const allocationCapacity = Math.max(4096, nextPowerOfTwo(requiredBytes));
    return new Uint8ClampedArray(allocationCapacity);
  }

  /**
   * Releases a buffer back into the pool for future reuse.
   * Clears the buffer's contents before returning it to the pool if requested.
   *
   * @param buffer The Uint8ClampedArray to return to the pool
   */
  public release(buffer: Uint8ClampedArray): void {
    if (!buffer || !(buffer instanceof Uint8ClampedArray)) {
      return;
    }

    if (this.freeBuffers.length < this.maxPoolCapacity) {
      this.freeBuffers.push(buffer);
    }
  }

  /**
   * Clears all pooled buffers to release idle memory back to the JavaScript engine.
   */
  public clear(): void {
    this.freeBuffers.length = 0;
  }

  /**
   * Returns the count of idle buffers currently retained in the pool.
   */
  public get poolSize(): number {
    return this.freeBuffers.length;
  }
}

/**
 * Calculates the next power of two greater than or equal to the given value.
 * Used for buffer capacity rounding to minimize reallocation fragmentation.
 */
export function nextPowerOfTwo(value: number): number {
  if (value <= 1) {
    return 1;
  }
  let power = 1;
  while (power < value) {
    power <<= 1;
  }
  return power;
}
