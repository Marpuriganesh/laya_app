# Agent Guidelines: Production Drawing Application

> **Scope**: This document defines the architectural mandates, code style principles, and operational rules for all AI agents and human contributors working on this codebase.

---

> [!CAUTION]
> # CRITICAL ARCHITECTURAL MANDATE: THE DUAL RUNTIME & RUST CORE RULE
> **NEVER IMPLEMENT DRAWING, RASTER, BLENDING, BRUSH DYNAMICS, OR TEXTURE FEATURES SOLELY IN FRONTEND TYPESCRIPT.**
>
> 1. **Why It Breaks Standalone Desktop**:
>    - The standalone desktop app (macOS AppKit via Tauri) stamps strokes and draws dabs directly into the `crates/sketch_core` Rust framebuffer via a high-frequency native local `NSEvent` monitor and AppKit view (`drawRect:`).
>    - **Any JavaScript/TypeScript drawing or raster code in `/src` is completely bypassed during native desktop drawing!** If you only add a blend mode, dynamic curve, texture modulation, or brush feature in TypeScript, it **will not work in the standalone app**.
> 2. **Single Canonical Drawing Engine (`crates/sketch_core`)**:
>    - All dab stamping, blend modes, texture modulations, brush dynamics, and stroke trajectory math live in **`crates/sketch_core` (Rust)**.
>    - In Web mode, `crates/sketch_core` is compiled to WebAssembly via `wasm-pack`.
>    - In Native Desktop mode, `crates/sketch_core` is compiled directly into the Tauri native app.
> 3. **Mandatory 3-Step Implementation Workflow for Any Drawing/Raster/Brush Feature**:
>    - **Step 1 (Rust Core Engine)**: Implement pure algorithms & data structures in `crates/sketch_core` (Rust) and verify with `cargo test --manifest-path crates/sketch_core/Cargo.toml`.
>    - **Step 2 (Bridges)**: Wire parameters into the Tauri Desktop bridge (`src-tauri/src/brush_commands.rs`) and Wasm bridge (`crates/sketch_core/src/wasm.rs`), verifying with `cargo check --manifest-path src-tauri/Cargo.toml`.
>    - **Step 3 (TypeScript Shell)**: Mirror contracts in `/src/types/` and `/src/engine/` solely for UI state orchestration, thumbnail stroke previews, and headless Node/Vitest test fixtures. Never create an independent TypeScript drawing implementation that diverges from Rust.

---

## 1. Project Vision & Architecture Overview

This project is a **production-ready, high-performance digital painting and drawing suite** that combines:
- **Procreate's Fluidity & Simplicity**: Minimalist touch/stylus-first ergonomics, zero-latency stroke feel, gesture shortcuts, and streamlined interface.
- **Krita's Artistic Depth**: Advanced brush engine capabilities (dual brushes, pressure/tilt/speed dynamics, texture grains), non-destructive layer blending, masks, and color space precision.
- **Modern Enhancements**: Instant autosave via local file system APIs, infinite canvas/zoom flexibility, and a future-proof compute architecture.

### Deployment & Runtime Constraints
1. **100% Statically Hosted Progressive Web App (PWA)**:
   - Must run entirely in the client browser with zero server-side runtime dependencies.
   - Hostable on any static CDN (GitHub Pages, Cloudflare Pages, Vercel, static S3 buckets).
   - Fully functional offline via Service Workers and Web App Manifest.
2. **Local-First Persistence**:
   - Zero cloud/server database requirement.
   - Document storage, tile caching, and undo history persistence must use the **Origin Private File System (OPFS)** and **IndexedDB**.
   - Direct file access via the **File System Access API** for loading and exporting files (`.sketch`, `.psd`, `.png`, `.webp`, `.kra`).

---

## 2. Core Development Mandates

### I. Extreme Human Understandability & Readability
- **Write for humans first**: Code must be clear, transparent, and self-documenting.
- **Descriptive Naming**:
  - No cryptic abbreviations (`pt`, `buf`, `fn`, `calc`, `tmp`, `cur`).
  - Use clear, intention-revealing names: `strokePoint`, `pixelBuffer`, `calculateInterpolatedDistance`, `temporaryDabTarget`.
- **Mathematical & Algorithmic Transparency**:
  - Complex mathematical routines (spline interpolation, Catmull-Rom curves, pressure response curves, blend mode formulas, convolution kernels) **must** include concise explanatory comments detailing the formula, parameter meaning, and mathematical reason.

### II. Strict Single Responsibility Principle (SRP)
- **One Function = One Job**: Every function must perform exactly one isolated calculation, validation, or transformation.
- **No Mixing of Concerns**:
  - A math function computes values; it does **not** draw to a canvas or mutate application state.
  - A raster function blends pixels; it does **not** manage pointer input or trigger UI updates.
- **Short & Cohesive**: Keep functions concise (ideally 10–35 lines). If a function requires comments dividing it into logical "phases", decompose each phase into its own focused helper function.
- **Composable Pipelines**: Build complex workflows by composing small, single-responsibility functions.

### III. Zero Casual Global State
- **Strictly Minimize Global Variables**:
  - Never introduce global state for convenience or temporary caching.
  - Permitted globals are strictly limited to:
    1. Immutable mathematical constants (e.g., `RADIAN_TO_DEGREE`).
    2. Read-only hardware capability flags detected once at boot (e.g., WebGPU support, SIMD availability).
- **Explicit Parameter Passing**:
  - Functions must receive the data they operate on via explicit arguments.
  - Mutable state must be encapsulated within dedicated, isolated engine or store instances, never in module-scoped `let` variables.

### IV. Language Portability & 1:1 Translatability
- **Decoupled Engine Core**:
  - The core engine (math, stroke processing, brush dynamics, rasterization, layer composition, undo/redo) must be **completely decoupled** from UI frameworks.
  - **Zero framework imports** in `/src/engine`: No React hooks, no JSX, no DOM element manipulation, no direct UI dependencies.
- **1:1 Mapping to C++ / Rust / WebGPU**:
  - Functions in `/src/engine` must be written so their signatures, algorithms, and data layouts can be directly translated 1:1 into C++ functions/structs, Rust functions/structs, or WGSL shaders.
  - Prefer flat typed arrays (`Float32Array`, `Uint8ClampedArray`, `Uint32Array`) and Plain Old Data (POD) structs over complex JavaScript class hierarchies or symbol-keyed maps.
  - Structure algorithms as pure transformations: `(inputBuffer, parameters) -> outputBuffer`.

### V. Contract-First Modularity & Frictionless Parallel Integration (Multi-Agent Safe)
- **Maximum Modularity with Zero Integration Friction**:
  - Systems must be completely modular and decoupled, yet engineered so that putting them together is seamless and requires zero ad-hoc glue code.
- **Multi-Agent Parallel Autonomy**:
  - Different agents (or contributors) must be able to work simultaneously on different subsystems (e.g., Agent A on Brush Dynamics, Agent B on WebGPU Rendering, Agent C on Layer Composition, Agent D on OPFS Storage, Agent E on UI Panels) in complete isolation without breaking integration.
- **The Contract-First Rule**:
  - Every subsystem defines its input/output contracts (TypeScript interfaces, POD data types, and lifecycle hooks) in dedicated contract files before implementation starts.
  - Subsystems **only** communicate across these stable typed contracts—never through private implementation details or informal shared objects.
- **Headless Isolation & Mockable Boundaries**:
  - Every subsystem must be 100% testable and runnable in a headless test harness using mock implementations of its neighbor subsystems.
  - An agent working on the Brush Engine does **not** need the real WebGPU renderer or real UI to exist; it operates against a clean `IRasterTarget` or `IDabConsumer` contract.
- **Strict Unidirectional Flow & No Circular Dependencies**:
  - Information flows in one direction: `Input` ➔ `Stroke` ➔ `Brush` ➔ `Raster` ➔ `Layer` ➔ `Renderer`.
  - Circular imports across subsystems are strictly prohibited.
- **Unified Engine Facade**:
  - A single, thin orchestration facade (`DrawingAppEngine`) coordinates subsystems for the UI. The UI interacts solely with this facade, keeping UI components completely insulated from engine internals.

### VI. Mandatory Headless Test Coverage ("No Code Without Tests")
- **Test-Driven Completeness**:
  - No implementation is complete without automated test cases proving it functions properly.
  - Every mathematical formula, brush dynamics calculation, raster blending mode, and state transition **must** have corresponding unit tests.
- **Zero DOM/GPU Dependency for Engine Tests**:
  - Because `/src/engine` is 100% pure and decoupled, all engine tests must execute headlessly in pure Node/Vitest environments without a browser window, DOM mock, or WebGPU device context.
- **Comprehensive Boundary & Edge Case Verification**:
  - Tests must verify normal inputs as well as boundary conditions:
    1. Zero and negative lengths/distances.
    2. Edge ratios ($t = 0.0$, $t = 1.0$, $t < 0$, $t > 1$).
    3. Pixel buffer boundaries (clamping at 0 and 255, alpha premultiplication).
    4. Contract compliance using mock adapters.
- **Verification Command**:
  - All tests must pass via `npm test` before any agent finishes a task.

---

## 3. Canonical Architecture: Single Source of Truth (`crates/sketch_core`)

The application uses **one single canonical core engine** written in Rust: **`crates/sketch_core`**.

```
                           ┌───────────────────────────┐
                           │   crates/sketch_core      │
                           │   (Single Rust Core)      │
                           └─────────────┬─────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
    ┌───────────────────────────────┐         ┌───────────────────────────────┐
    │  WebAssembly Target (Browser) │         │  Native C/Rust Target (Tauri) │
    │  - wasm-pack build --target web│         │  - High-frequency AppKit view │
    │  - Direct WASM pixel buffer   │         │  - 120Hz-240Hz NSEvent monitor│
    │  - Zero JS drawing duplicate  │         │  - Sub-millisecond latency    │
    └───────────────────────────────┘         └───────────────────────────────┘
```

### Key Architectural Tenets:
1. **Single Source for Drawing**:
   - There are **never two parallel drawing engines**. All dab stamping, trajectory calculation, and brush rasterization live solely in `crates/sketch_core`.
   - The TypeScript layer (`src/engine/wasm`, `src/ui`) is strictly an orchestration, input normalization, and UI presentation shell.
2. **Strict Stroke / Engine Decoupling**:
   - Stroke stabilization and trajectory algorithms in `crates/sketch_core/src/stroke` (such as `PullStringStabilizer`, `StrokeTrajectory`, and `StrokeStepper`) are **completely decoupled** from `PixelBrushEngine`.
   - Smoothing operates on pure `StrokeEvent` streams. Any existing or future brush engine (pixel brush, smudge/wet mixer, vector inking, airbrush) consumes smoothed events without duplicating stabilization logic.
3. **Platform Differences (Native Tauri Desktop vs Web/Wasm)**:
   - **Native Desktop (macOS AppKit via Tauri)**: Input is handled by a high-frequency AppKit local `NSEvent` monitor and rendered in an `NSView` overlay using native CoreGraphics directly over the Rust framebuffer. The live stroke connection to the pen nib is drawn instantaneously in `drawRect:`.
   - **Web Target (Wasm & Canvas2D)**: Drawing runs purely through the compiled WebAssembly module (`wasm-bindgen`) and is blitted into a Canvas2D rendering context without the native Cocoa AppKit view overlay. Any live preview overlays on the web operate within the React/Canvas presentation shell.

---

## 4. Directory & Module Boundaries

The project enforces strict boundaries between engine logic, rendering abstractions, storage, input, UI, and central contract definitions:

```
src/
├── types/               # CONTRACTS & POD DATA STRUCTURES (Single Source of Truth)
│   ├── stroke.ts        # StrokePoint, StrokeSegment, DabParameters interfaces
│   ├── brush.ts         # BrushPreset, DynamicsCurve, GrainTexture interfaces
│   ├── raster.ts        # PixelBufferDescriptor, BlendMode, DirtyRect interfaces
│   ├── layer.ts         # LayerNode, BlendMode, CompositeStack interfaces
│   ├── renderer.ts      # IRenderer blitter interface (Canvas2D / WebGL2 / WebGPU)
│   ├── storage.ts       # IStorageEngine, TileDescriptor, Serializer interfaces
│   └── engine.ts        # IDrawingEngine facade interface for UI consumption
│
├── engine/              # PURE, FRAMEWORK-FREE ENGINE (1:1 Translatable)
│   ├── math/            # Vector math, splines, Catmull-Rom, bounding boxes
│   ├── stroke/          # Point interpolation, pressure dynamics, dab spacing
│   ├── brush/           # Brush presets, tip dynamics, jitter, dual-brush logic
│   ├── raster/          # Pixel buffers, blend modes, blitting, clipping
│   ├── layer/           # Layer hierarchy, grouping, opacity, composite stack
│   ├── history/         # Command-based undo/redo, non-destructive tile diffs
│   └── color/           # Color space conversions (RGB, HSL, HSV, OKLab)
│
├── renderer/            # Rendering Hardware Abstraction Layer
│   ├── canvas2d/        # Fallback / lightweight Canvas 2D blitter
│   ├── webgl2/          # WebGL2 accelerated blitter
│   └── webgpu/          # WebGPU pipeline & compute shaders
│
├── input/               # Pointer & Hardware Input Handling
│   ├── pointer/         # Stylus, Apple Pencil, pressure, tilt, touch listeners
│   └── gestures/        # Two-finger pinch, zoom, rotate, tap gestures
│
├── storage/             # Client-Side Persistence
│   ├── opfs/            # Origin Private File System tile caching
│   ├── idb/             # IndexedDB document metadata & project library
│   └── serializers/     # Import/export (.sketch, .psd, .kra, .png)
│
└── ui/                  # REACT / UI PRESENTATION LAYER
    ├── components/      # Toolbars, layer panels, color pickers, canvas viewport
    └── hooks/           # React hooks binding the engine to the UI
```

### Unidirectional Data Flow & Integration Pipeline

To guarantee that multiple agents can work in parallel without integration failures:

```
[ Stylus / Touch / Mouse Input ]
              │
              ▼
    [ Input Pipeline ]
              │  (Raw Pointer Events ➔ Normalized StrokePoints)
              ▼
    [ Stroke Processor ]
              │  (Interpolation, Smoothing, Dab Spacing)
              ▼
      [ Brush Engine ]
              │  (Dynamics, Pressure Curves, Dab Stamps)
              ▼
     [ Raster Blitter ]
              │  (Pixel Blending, Dual Brush Masking, Dirty Rects)
              ▼
      [ Layer Stack ] ◄──────► [ History & OPFS Storage ]
              │  (Non-destructive composite tree)
              ▼
     [ Renderer HAL ]
   (WebGPU / WebGL2 / Canvas2D)
              │
              ▼
         [ Display ]
```

### Module Boundary Rules:
- `/src/types` is the **Contract Authority**: All cross-module data structures and interface signatures live here.
- Subsystems only depend on `/src/types`. They **NEVER** import internal implementation files from other subsystems.
- `/src/engine` **CANNOT** import from `/src/ui`, `/src/input`, or `/src/storage`.
- `/src/engine` **CANNOT** use DOM APIs (`window`, `document`, `HTMLElement`).
- `/src/ui` interacts with `/src/engine` solely through the `IDrawingEngine` facade interface.

### UI & Iconography Standards:
- **Mandatory Icon Library (`lucide-react`)**:
  - Always use `lucide-react` for all UI icons (toolbars, brush palettes, layer controls, color pickers, modal triggers, and buttons).
  - Do not introduce alternative icon packages (e.g. Heroicons, FontAwesome, Material Icons) or inline raw SVG paths.
  - Consistent icon sizing and accessible labels: Always provide accessible `aria-label` or tooltip text for icon-only buttons.

- **FigCraft Canvas Vector Icons (`lucide-figcraft` skill)**:
  - When designing or creating mockups/components in FigCraft, use the **`lucide-figcraft`** skill (`.agents/skills/lucide-figcraft/SKILL.md`).
  - **Zero-Dependency CLI Tool**: `scripts/figcraft-lucide.mjs` allows querying, converting, and inspecting any of the 1,600+ icons:
    - Search: `node scripts/figcraft-lucide.mjs list <filter>`
    - Payload/Path: `node scripts/figcraft-lucide.mjs get <icon-name>`
    - Rebuild/Sync: `node scripts/figcraft-lucide.mjs build`
  - **Asset Bundle**: Pre-built vector definitions are stored at `src/figcraft/assets/lucide-vectors.js` (`export const LucideVectors = ...`) and `src/figcraft/assets/lucide-paths.json`.
  - **MCP Tool Usage**: Call `create_node` on MCP server `figcraft` with `type: "vector"`, `path: <svgPath>`, `props: { fills: [], stroke: "#hex", strokeWeight: 2 }`.

- **Native Desktop Overlay & Input Hijacking Prevention**:
  - In desktop Tauri environments (macOS), the app runs a native AppKit drawing overlay behind WKWebView. To achieve zero-latency drawing without browser event loop lag, AppKit uses a synchronous local `NSEvent` monitor that intercepts pointer events on the artboard.
  - **Mandatory Tagging**: Any React component rendering interactive UI over the canvas (menus, popovers, modals, toolbars, subwindows) must be tagged with `data-native-ui="<id>"` or standard accessible roles (`role="menu"`, `role="dialog"`, `role="listbox"`, `role="combobox"`).
  - **Automatic Sync**: The global `useNativeUiRectsSync` hook queries `NATIVE_UI_SELECTOR` and automatically pushes bounding rects (`g_ui_blocking_rects`) to the native layer so AppKit passes clicks straight to WKWebView.
  - **Synchronous Trigger**: If a menu or modal is opened/closed via local component state (not via global `activePopover`), call `triggerNativeUiRectsSync()` immediately in a `useEffect` on state change:
    ```tsx
    import { triggerNativeUiRectsSync } from "@/ui/hooks/useNativeUiRectsSync";

    useEffect(() => {
      triggerNativeUiRectsSync();
      const timer = setTimeout(triggerNativeUiRectsSync, 50);
      return () => clearTimeout(timer);
    }, [isMenuOpen]);
    ```
  - **Pointer Event Propagation**: Always add `onPointerDown={(e) => e.stopPropagation()}` on floating panel containers so clicks do not bubble down to canvas handlers in WebKit.


---

## 5. Coding Standards & Implementation Patterns

### Pattern 1: Pure Mathematical Functions (1:1 Translatable)
Always keep algorithmic functions free of side-effects:

```typescript
// ✅ Good: Pure, single-responsibility, transparent math, 1:1 translatable to C++/Rust
/**
 * Calculates a point along a 2D Catmull-Rom spline segment.
 * Formula: P(t) = 0.5 * ((2*P1) + (-P0 + P2)*t + (2*P0 - 5*P1 + 4*P2 - P3)*t^2 + (-P0 + 3*P1 - 3*P2 + P3)*t^3)
 */
export function interpolateCatmullRom(
  previousPoint: number,
  startPoint: number,
  endPoint: number,
  nextPoint: number,
  interpolationRatio: number
): number {
  const ratioSquared = interpolationRatio * interpolationRatio;
  const ratioCubed = ratioSquared * interpolationRatio;

  return 0.5 * (
    (2 * startPoint) +
    (-previousPoint + endPoint) * interpolationRatio +
    (2 * previousPoint - 5 * startPoint + 4 * endPoint - nextPoint) * ratioSquared +
    (-previousPoint + 3 * startPoint - 3 * endPoint + nextPoint) * ratioCubed
  );
}
```

```typescript
// ❌ Bad: Mixed responsibilities, DOM-entangled, cryptic names
export function calcPt(p0: any, p1: any, p2: any, p3: any, t: number, ctx: CanvasRenderingContext2D) {
  const v = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t); // Cryptic, incomplete
  ctx.lineTo(v, p1.y); // DOM/Canvas side-effect inside math calculation!
}
```

### Pattern 2: Pixel Blending & Raster Operations
Use typed arrays and primitive offsets to match native memory buffers:

```typescript
// ✅ Good: Flat buffer processing, single blend calculation, direct C++/Wasm parallel
export function blendPixelMultiply(
  destinationR: number,
  destinationG: number,
  destinationB: number,
  sourceR: number,
  sourceG: number,
  sourceB: number,
  opacityNormalized: number
): [number, number, number] {
  const blendedR = (destinationR * sourceR) / 255;
  const blendedG = (destinationG * sourceG) / 255;
  const blendedB = (destinationB * sourceB) / 255;

  return [
    destinationR + (blendedR - destinationR) * opacityNormalized,
    destinationG + (blendedG - destinationG) * opacityNormalized,
    destinationB + (blendedB - destinationB) * opacityNormalized,
  ];
}
```

### Pattern 3: Contract & Adapter Isolation (Parallel-Agent Safe)
Implement subsystems against contracts so an agent can work in complete isolation with mock adapters:

```typescript
// ✅ Good: Interface contract in /src/types/raster.ts
export interface IRasterTarget {
  readonly width: number;
  readonly height: number;
  blitDab(dabPixels: Uint8ClampedArray, targetX: number, targetY: number, dabSize: number): void;
}

// Subsystem implementation depends ONLY on the contract, not on WebGPU or Canvas
export class MemoryRasterBuffer implements IRasterTarget {
  constructor(public readonly width: number, public readonly height: number, public readonly pixelData: Uint8ClampedArray) {}

  public blitDab(dabPixels: Uint8ClampedArray, targetX: number, targetY: number, dabSize: number): void {
    // Pure buffer blitting - perfectly unit-testable in Node/headless without UI or GPU!
  }
}
### Pattern 4: Headless Unit Testing (Vitest)
Always write fast, isolated unit tests validating math formulas, buffer transformations, and contracts:

```typescript
// ✅ Good: Pure headless unit test (src/engine/math/__tests__/catmull_rom.test.ts)
import { describe, it, expect } from 'vitest';
import { interpolateCatmullRom } from '../catmull_rom';

describe('interpolateCatmullRom', () => {
  it('returns the start point when ratio is 0', () => {
    const result = interpolateCatmullRom(0, 10, 20, 30, 0.0);
    expect(result).toBeCloseTo(10);
  });

  it('returns the end point when ratio is 1', () => {
    const result = interpolateCatmullRom(0, 10, 20, 30, 1.0);
    expect(result).toBeCloseTo(20);
  });

  it('correctly calculates the midpoint for collinear inputs', () => {
    const result = interpolateCatmullRom(0, 10, 20, 30, 0.5);
    expect(result).toBeCloseTo(15);
  });
});
```

---

## 6. LLM Operating Rules & Verification Checklist

When generating or modifying code in this repository, all AI agents must follow this checklist:

- [ ] **Dual Runtime Verification**: If this feature touches drawing, rasterization, blending, or brush dynamics, is it implemented in `crates/sketch_core` (Rust) and wired into `src-tauri` so it works in the standalone desktop app, NOT just frontend TypeScript?
- [ ] **Rust Core Tests Passing**: Do all Rust tests pass via `cargo test --manifest-path crates/sketch_core/Cargo.toml`?
- [ ] **Tauri Desktop Compiling**: Does the native desktop app compile cleanly via `cargo check --manifest-path src-tauri/Cargo.toml`?
- [ ] **Automated Tests Included**: Did you write or update unit test files for all new or modified functions?
- [ ] **Tests Passing**: Do all tests pass cleanly via `npm test` without failures or flaky timeouts?
- [ ] **Single Responsibility**: Does each created function perform exactly one task?
- [ ] **No Hidden Globals**: Are all states passed explicitly? Is there zero unauthorized module-level global state?
- [ ] **Contract Adherence**: Does the code conform to `/src/types` contracts? No ad-hoc cross-subsystem dependencies?
- [ ] **Headless & Mockable**: Can this subsystem be tested in headless isolation using simple mock adapters?
- [ ] **Unidirectional Flow**: Does data move strictly forward through the pipeline without circular references?
- [ ] **Engine Purity**: Does `/src/engine` remain 100% free of React, JSX, and DOM dependencies?
- [ ] **1:1 Portability**: Could this function be converted line-for-line to C++ or Rust without altering data structures or flow?
- [ ] **Static/Offline Safety**: Does the feature function without any external server or network connectivity?
- [ ] **Readability & Comments**: Are formulas and non-obvious algorithms accompanied by explanatory mathematical comments?
- [ ] **Standardized Iconography**: Are all UI icons strictly imported from `lucide-react`?
- [ ] **Native Overlay Protection**: Do any new menus, modals, or floating panels have `data-native-ui="..."` or `role="menu|dialog"` and trigger UI rect sync?
- [ ] **Type Safety & Build**: Does the project pass TypeScript compilation (`npm run build`) without errors or warnings?
