import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { initSync, WasmBrushEngine } from "../pkg/sketch_core.js";

describe("WasmBrushEngine (Rust sketch_core compiled to WebAssembly)", () => {
  beforeAll(() => {
    const wasmPath = path.resolve(__dirname, "../pkg/sketch_core_bg.wasm");
    const wasmBytes = fs.readFileSync(wasmPath);
    initSync({ module: wasmBytes });
  });

  it("instantiates with given dimensions and initializes canvas buffer", () => {
    const engine = new WasmBrushEngine(400, 300);
    expect(engine.width()).toBe(400);
    expect(engine.height()).toBe(300);
    expect(engine.get_pixel_buffer_len()).toBe(400 * 300 * 4);
  });

  it("stamps an initial dab on begin_stroke and returns valid dirty rect", () => {
    const engine = new WasmBrushEngine(500, 500);
    engine.set_brush_config(
      30, // diameter
      0.1, // spacing
      0.5, // softness
      255, 0, 0, 255, // red
      1.0, // opacity
      1.0, // flow
      false, // size_by_pressure
      false, // opacity_by_pressure
      false  // is_erase
    );

    const dirty = engine.begin_stroke(100, 100, 1.0);
    expect(dirty).toBeDefined();
    if (!dirty) return;

    expect(dirty.length).toBe(4);
    const [x, y, w, h] = dirty;
    expect(x).toBeLessThan(100);
    expect(y).toBeLessThan(100);
    expect(w).toBeGreaterThanOrEqual(30);
    expect(h).toBeGreaterThanOrEqual(30);
  });

  it("steps continuous midpoint quadratic Bézier spline on paint_to", () => {
    const engine = new WasmBrushEngine(500, 500);
    engine.set_brush_config(
      20,
      0.1,
      0.5,
      0, 120, 255, 255,
      1.0,
      1.0,
      false,
      false,
      false
    );

    engine.begin_stroke(50, 50, 1.0);
    const d1 = engine.paint_to(150, 50, 1.0);
    expect(d1).toBeDefined();

    const d2 = engine.paint_to(150, 150, 1.0);
    expect(d2).toBeDefined();

    const dFinish = engine.finish_stroke();
    expect(dFinish).toBeDefined();
  });

  it("coalesces batch pointer events into a single bounding dirty rect", () => {
    const engine = new WasmBrushEngine(500, 500);
    engine.set_brush_config(
      20,
      0.1,
      0.5,
      0, 0, 0, 255,
      1.0,
      1.0,
      false,
      false,
      false
    );

    engine.begin_stroke(10, 10, 1.0);

    // 3 events flatly laid out [x0, y0, p0, x1, y1, p1, x2, y2, p2]
    const batch = new Float32Array([
      50, 50, 1.0,
      100, 80, 1.0,
      150, 100, 1.0,
    ]);

    const batchDirty = engine.paint_batch(batch);
    expect(batchDirty).toBeDefined();
    if (!batchDirty) return;

    const [x, , w] = batchDirty;
    expect(x).toBeLessThanOrEqual(50);
    // Midpoint quadratic spline curves up to midpoint M_next = (100 + 150) / 2 = 125 (+ dab radius)
    expect(x + w).toBeGreaterThanOrEqual(130);

    const finishDirty = engine.finish_stroke();
    expect(finishDirty).toBeDefined();
    if (!finishDirty) return;
    const [fx, , fw] = finishDirty;
    // finish_stroke stamps the final segment to x = 150
    expect(fx + fw).toBeGreaterThanOrEqual(155);
  });

  it("copies sub-rectangle from Wasm memory into destination buffer", () => {
    const engine = new WasmBrushEngine(200, 200);
    engine.set_brush_config(
      40,
      0.1,
      0.0, // Hard circle
      255, 100, 50, 255,
      1.0,
      1.0,
      false,
      false,
      false
    );

    const dirty = engine.begin_stroke(100, 100, 1.0);
    expect(dirty).toBeDefined();
    if (!dirty) return;

    const [x, y, w, h] = dirty;
    const outBuffer = new Uint8Array(w * h * 4);
    const success = engine.copy_sub_rect(x, y, w, h, outBuffer);
    expect(success).toBe(true);

    // Check center pixel of the stamped dab in outBuffer
    const centerX = 100 - x;
    const centerY = 100 - y;
    const centerOffset = (centerY * w + centerX) * 4;

    expect(outBuffer[centerOffset + 0]).toBe(255); // Red
    expect(outBuffer[centerOffset + 1]).toBe(100); // Green
    expect(outBuffer[centerOffset + 2]).toBe(50);  // Blue
    expect(outBuffer[centerOffset + 3]).toBe(255); // Alpha
  });

  it("erases pixels when is_erase is enabled", () => {
    const engine = new WasmBrushEngine(200, 200);
    // 1. Fill with opaque white
    engine.clear(255, 255, 255, 255);

    // 2. Set eraser brush
    engine.set_brush_config(
      30,
      0.1,
      0.0,
      0, 0, 0, 255,
      1.0,
      1.0,
      false,
      false,
      true // is_erase = true
    );

    const dirty = engine.begin_stroke(100, 100, 1.0);
    expect(dirty).toBeDefined();
    if (!dirty) return;

    const [x, y, w, h] = dirty;
    const outBuffer = new Uint8Array(w * h * 4);
    engine.copy_sub_rect(x, y, w, h, outBuffer);

    const centerX = 100 - x;
    const centerY = 100 - y;
    const centerOffset = (centerY * w + centerX) * 4;

    // Center pixel alpha should be erased to 0
    expect(outBuffer[centerOffset + 3]).toBe(0);
  });
});
