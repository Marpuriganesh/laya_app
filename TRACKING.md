# Project Progress & Roadmap Tracker

> **Architecture Mandates**: 100% Client-Side Static PWA • Origin Private File System (OPFS) • Decoupled Engine Core (1:1 C++/Rust translatable) • Strict Contract-First Design • Standardized Iconography (`lucide-react`) • Zero Unchecked Globals.

---

## High-Level Milestone Tracker

| Phase | Milestone | Status | Description |
|---|---|---|---|
| **Step 1** | **Creative UI Shell & Canvas Setup** | **Completed** | Procreate minimalist interface + Photoshop document dialog |
| **Step 2** | **Core Brush Engine & Krita/ABR Science** | **Next Up** | Multi-engine core (Pixel, Smudge, MyPaint WASM), smoothing & parsers |
| **Step 3** | **Non-Destructive Layers & Tile History** | **Queued** | Composite stack, blend modes, OPFS persistence & undo/redo |

---

## Detailed Task Breakdown

### 🎯 Step 1: Creative UI Shell & Canvas Setup
*Goal: Provide a distraction-free Procreate-like canvas workspace with Photoshop-like document configuration.*

- [x] **Document & UI Contracts**
  - [`src/types/document.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/document.ts) — `DocumentConfiguration`, DPI (72, 144, 300), Color Spaces (`sRGB`, `Display P3`), Bit Depths (`8-bit`, `16-bit float`), and presets (Screen, Square, 4K, A4).
  - [`src/types/ui.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/ui.ts) — Tool types (`brush`, `smudge`, `eraser`), popover states, and transform matrices.
- [x] **Document Store**
  - [`src/ui/hooks/useDocumentStore.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/hooks/useDocumentStore.ts) — Reactive state for document, tool, size, opacity, color, zoom/pan.
- [x] **Photoshop-Style New Canvas Setup Modal**
  - [`src/ui/components/NewCanvasModal.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/NewCanvasModal.tsx) — Presets, custom dimension inputs with unit switcher (px, in, cm, mm), resolution/DPI, color space, and background choice.
- [x] **Procreate-Style Minimalist Top Navigation Bar**
  - [`src/ui/components/TopNavBar.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/TopNavBar.tsx) — Actions, Adjustments, Select, Move; Paint, Smudge, Erase, Layers, and Active Color swatch.
- [x] **Procreate-Style Floating Sidebar Rail**
  - [`src/ui/components/SidebarRail.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/SidebarRail.tsx) — Vertical brush size slider (with live tooltip), vertical opacity slider, Undo & Redo.
- [x] **Dual-Mode Interactive Color Picker Popover**
  - [`src/ui/components/ColorPickerPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/ColorPickerPopover.tsx) — Classic Mode (Hue Ring + Triangle/Square) and Artistic Mode (Krita circular wheel).
- [x] **Pure Color Space Conversions**
  - [`src/engine/color/color_conversions.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/color_conversions.ts) — `hsvToRgb`, `rgbToHsv`, `rgbToHex`, `hexToRgb`.
- [x] **Brush Library Popover**
  - [`src/ui/components/BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx) — Categories, presets list tagged by engine, and import buttons.
- [x] **Centered Canvas Viewport with Pan & Zoom**
  - [`src/ui/components/CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) — Centered artboard paper on `#121214` dark matte, smooth zoom (ctrl+wheel/pinch), pan, and immediate test drawing.
- [x] **App Shell Assembly**
  - [`src/App.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/App.tsx) — Integrated workspace shell.

---

### 🎨 Step 2: The Core Brush Engine (The "Real Stuff")
*Goal: Implement Krita's documented brush dynamics, stroke smoothing, and preset compatibility.*

#### Part A: Stroke Smoothing & Anti-Faceting Pipeline
- [ ] Install test dependencies (`vitest`, `jszip`, `fast-xml-parser`).
- [ ] Define normalized stroke contracts (`src/types/stroke.ts`).
- [ ] Implement 2D vector & spline math primitives (`src/engine/math/vector2d.ts`, `dynamics_curve.ts`).
- [ ] Implement **Streamline Smoother** (`src/engine/stroke/streamline_smoother.ts`):
  - Velocity-adaptive pull-string mechanics.
  - Position & pressure exponential moving average (EMA).
- [ ] Implement **Moving Average Smoother** (`src/engine/stroke/moving_average_smoother.ts`).
- [ ] Implement **Predictive Bézier Smoother** (`src/engine/stroke/predictive_bezier_smoother.ts`):
  - Velocity/acceleration look-ahead extrapolation.
  - Catmull-Rom to cubic Bézier spline fitting for true C¹ anti-faceting.
- [ ] Implement **Stroke Interpolator & Dab Spacing Calculator** (`src/engine/stroke/stroke_interpolator.ts`, `dab_spacing_calculator.ts`).

#### Part B: Multi-Engine Brush Core & Raster Blitter
- [ ] Define raster contracts (`src/types/raster.ts`).
- [ ] Implement headless in-memory raster buffer (`src/engine/raster/memory_raster_buffer.ts`).
- [ ] Implement **Pixel Brush Engine** (`src/engine/brush/pixel_brush_engine.ts`):
  - Spacing, Gaussian dab stamps, pressure/tilt curves.
- [ ] Implement **Color Smudge Engine** (`src/engine/brush/color_smudge_engine.ts`):
  - Dynamic canvas sampling, mixing rates, and smearing.
- [ ] Implement **MyPaint Engine** (`src/engine/brush/mypaint_engine.ts`):
  - WASM adapter wrapping `libmypaint`.
- [ ] Implement **Brush Engine Dispatcher** (`src/engine/brush/brush_engine_dispatcher.ts`).
- [ ] Implement **OffscreenCanvas Target** (`src/engine/raster/canvas2d_raster_target.ts`).
- [ ] Implement **Drawing App Engine Facade** (`src/engine/drawing_app_engine.ts`).
- [ ] Implement **Pointer Event Normalizer** (`src/input/pointer/pointer_event_normalizer.ts`).

#### Part C: Preset Parsers & Live Import
- [ ] Implement **Krita Preset Parser** (`src/engine/brush/kpp_parser.ts`):
  - In-browser PNG text chunk decoding, XML extraction, preset building.
- [ ] Implement **Krita Bundle Extractor** (`src/engine/brush/bundle_parser.ts`):
  - JSZip-based `.bundle` unpacking.
- [ ] Implement **Photoshop ABR Importer** (`src/engine/brush/abr_parser.ts`):
  - Big-endian binary parser referencing `storytold/photocraft` (v1–2 & v6–10 8BIM + PackBits RLE).
- [ ] Vendor `libmypaint.wasm` and glue code into `public/wasm/`.
- [ ] Connect brush engine to `CanvasViewport` and UI sliders/tools.

---

### 🚀 Step 3: Non-Destructive Layers & Tile History (Future Phase)
- [ ] Layer node hierarchy, grouping, and opacity tree (`src/types/layer.ts`).
- [ ] Layer blending modes (Normal, Multiply, Screen, Overlay, etc.).
- [ ] Tile-based non-destructive undo/redo history.
- [ ] Origin Private File System (OPFS) tile caching for multi-gigabyte document support.

---

- [ ] **Krita Artistic Color Selector Full Fidelity**:
  - Reference: [`invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector`](https://invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector)
  - **Artist RYB Color Space**: Johannes Itten color wheel (Blue ↔ Orange, Yellow ↔ Purple, Red ↔ Green complements).
  - **Perceptual Value ($Y'$ Luma / Oklab $L$)**: Equal visual brightness around the wheel (unlike HSV where pure blue and yellow have the same mathematical $V$ despite vast lightness difference).
  - **Isoluminant Desaturation**: Desaturating radially inward leads to the exact gray tone of the same luminance.
  - **James Gurney Gamut Masking**: Rotatable vector masks (`.kgm` format) over the wheel to constrain palettes.
  - Dedicated companion linear Value/Lightness slider beside the wheel.
