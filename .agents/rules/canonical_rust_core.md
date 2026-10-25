# Critical Rule: Single Canonical Rust Drawing Core (`crates/sketch_core`)

> **MANDATORY FOR ALL AGENTS**:
> Never implement drawing, raster, blending, brush dynamics, or texture modulation features solely in frontend TypeScript!

## Why?
1. **Desktop Standalone Mode (macOS AppKit via Tauri)**:
   - Stroke input is captured by a synchronous native AppKit `NSEvent` local monitor running at 120Hz–240Hz.
   - Dabs are rasterized and stamped directly into the Rust canvas framebuffer (`crates/sketch_core`).
   - The browser WebKit runtime and all JavaScript/TypeScript drawing pipelines are completely bypassed during drawing in desktop mode.
   - If an agent only puts logic in `/src/engine` in TypeScript, **the native standalone app will completely ignore it and fail to function.**

2. **Web Target Mode**:
   - `crates/sketch_core` is compiled to WebAssembly via `wasm-pack`.
   - Drawing runs through the exact same compiled Rust engine.

## Mandatory Implementation Order for Drawing Features
When implementing any brush, stroke, raster, blending, or texture feature:
1. **`crates/sketch_core` (Rust)**: Implement the core mathematics, data structures, and algorithms. Verify with `cargo test --manifest-path crates/sketch_core/Cargo.toml`.
2. **`src-tauri/src/brush_commands.rs` (Native Desktop Bridge)**: Wire parameters into Tauri DTOs and commands so the standalone macOS app receives them. Verify with `cargo check --manifest-path src-tauri/Cargo.toml`.
3. **`crates/sketch_core/src/wasm.rs` (Web Bridge)**: Expose Wasm bindings for browser execution.
4. **`/src` (TypeScript Presentation Shell)**: Mirror contracts in `/src/types` and helper functions in `/src/engine` solely for React UI state, thumbnail stroke preview widgets, and headless Vitest tests.

## Verification Checklist Before Declaring Done
- `cargo test --manifest-path crates/sketch_core/Cargo.toml` MUST PASS.
- `cargo check --manifest-path src-tauri/Cargo.toml` MUST PASS (0 errors, 0 warnings).
- `npm test` MUST PASS.
- `npm run build` MUST PASS (compiles Wasm, TypeScript, and Vite bundles).
