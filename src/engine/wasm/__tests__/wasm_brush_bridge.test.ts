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
      false, // is_erase
      true   // antialias
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
      false,
      true
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
      false,
      true
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
    expect(x + w).toBeGreaterThanOrEqual(120);

    const finishDirty = engine.finish_stroke();
    expect(finishDirty).toBeDefined();
    if (!finishDirty) return;
    const [fx, , fw] = finishDirty;
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
      false,
      true
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
    engine.clear(255, 255, 255, 255);

    engine.set_brush_config(
      30,
      0.1,
      0.0,
      0, 0, 0, 255,
      1.0,
      1.0,
      false,
      false,
      true, // is_erase = true
      true  // antialias = true
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

  it("respects antialias toggle (subpixel falloff when true vs crisp binary when false)", () => {
    // 1. With antialias = false: non-zero pixels must all be strictly 255
    const engineNonAa = new WasmBrushEngine(100, 100);
    engineNonAa.set_brush_config(
      10,
      0.1,
      0.0, // Hard circle
      0, 0, 0, 255,
      1.0,
      1.0,
      false,
      false,
      false,
      false // antialias = false
    );
    const dNoAa = engineNonAa.begin_stroke(50, 50, 1.0);
    expect(dNoAa).toBeDefined();
    const [nx, ny, nw, nh] = dNoAa!;
    const bufNoAa = new Uint8Array(nw * nh * 4);
    engineNonAa.copy_sub_rect(nx, ny, nw, nh, bufNoAa);

    for (let i = 3; i < bufNoAa.length; i += 4) {
      const alpha = bufNoAa[i];
      expect(alpha === 0 || alpha === 255).toBe(true);
    }

    // 2. With antialias = true: perimeter has subpixel intermediate alpha
    const engineAa = new WasmBrushEngine(100, 100);
    engineAa.set_brush_config(
      10,
      0.1,
      0.0, // Hard circle
      0, 0, 0, 255,
      1.0,
      1.0,
      false,
      false,
      false,
      true // antialias = true
    );
    const dAa = engineAa.begin_stroke(50, 50, 1.0);
    expect(dAa).toBeDefined();
    const [ax, ay, aw, ah] = dAa!;
    const bufAa = new Uint8Array(aw * ah * 4);
    engineAa.copy_sub_rect(ax, ay, aw, ah, bufAa);

    let hasIntermediateAlpha = false;
    for (let i = 3; i < bufAa.length; i += 4) {
      const alpha = bufAa[i];
      if (alpha > 0 && alpha < 255) {
        hasIntermediateAlpha = true;
        break;
      }
    }
    expect(hasIntermediateAlpha).toBe(true);
  });

  it("applies pulled string stroke smoothing to absorb jitter via Wasm", () => {
    const engine = new WasmBrushEngine(500, 500);
    engine.set_brush_config(
      20, 0.1, 0.5,
      0, 0, 0, 255,
      1.0, 1.0,
      false, false, false, true
    );

    // Enable pull string with 50px max string, 3.0 multiplier, 0.2 catch up, 10px deadband, connect to tip, 0.35 pressure smoothing
    engine.set_pull_string_config(true, 50.0, 3.0, 0.2, 10.0, true, 0.35);

    // Begin at (100, 100)
    engine.begin_stroke(100, 100, 1.0);

    // Micro-jitter of 5px to (103, 104) — distance = 5px <= 20px leash radius
    // Should be absorbed, returning no dirty rect
    const jitterDirty = engine.paint_to(103, 104, 1.0);
    expect(jitterDirty).toBeUndefined();

    // Large movement of 40px to (140, 100) — distance = 40px > 20px leash radius
    // Should pull the brush tip and emit dirty rect
    const moveDirty = engine.paint_to(140, 100, 1.0);
    expect(moveDirty).toBeDefined();

    // Finish stroke connects the remaining 20px gap to (140, 100)
    const finishDirty = engine.finish_stroke();
    expect(finishDirty).toBeDefined();
  });
});
