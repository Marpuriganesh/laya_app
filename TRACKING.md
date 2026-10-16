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
- [x] **Document Store (Zustand)**
  - [`src/ui/hooks/useDocumentStore.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/hooks/useDocumentStore.ts) — Centralized Zustand reactive store for document, tool, size, opacity, color, zoom/pan transforms, soft proofing, and popover dialogs (with selective subscribing and non-React external access via `useDocumentStore.getState()`).
- [x] **Photoshop-Style New Canvas Setup Modal**
  - [`src/ui/components/NewCanvasModal.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/NewCanvasModal.tsx) — Presets, custom dimension inputs with unit switcher (px, in, cm, mm), resolution/DPI, color space, and background choice.
- [x] **Procreate-Style Minimalist Top Navigation Bar**
  - [`src/ui/components/TopNavBar.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/TopNavBar.tsx) — Actions, Adjustments, Select, Move; Paint, Smudge, Erase, Layers, and Active Color swatch.
- [x] **Procreate-Style Floating Sidebar Rail**
  - [`src/ui/components/SidebarRail.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/SidebarRail.tsx) — Vertical brush size slider (with live tooltip), vertical opacity slider, Undo & Redo.
- [x] **Dual-Mode Interactive Color Picker Popover (Krita Fidelity + Robust Pointer Capture)**
  - [`src/ui/components/ColorPickerPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/ColorPickerPopover.tsx) — Full `setPointerCapture` across all surfaces; Classic Mode with **true Barycentric Triangle** mapping & edge clamping; **Krita-style Artistic RYB Wheel** with configurable discrete Hue sectors (6–36), Saturation rings (2–10), Value steps (4–20), Continuous ($\infty$) toggle, and stepped Value ladder.
- [x] **Barycentric Triangle Mathematics**
  - [`src/engine/color/barycentric_triangle.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/barycentric_triangle.ts) — Pure barycentric projection for equilateral triangle color pickers $(x, y) \leftrightarrow (S, V)$ with perimeter segment clamping.
- [x] **Discrete Wheel & Value Ladder Quantization**
  - [`src/engine/color/discrete_wheel.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/discrete_wheel.ts) — Sector/ring quantization, center neutral gray detection, discrete value steps generation.
- [x] **HSY' Isoluminant Color Generation (Krita Constant Perceived Value)**
  - [`src/engine/color/hsy.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/hsy.ts) — Rec. 709 isoluminant color conversion ($0.2126R + 0.7152G + 0.0722B \equiv Y'_{\text{target}}$ across all hues and saturations). Guarantees all colors on the wheel evaluate to the exact same gray in B&W soft proofing, with zero value drift or darkening feedback loops.
- [x] **Artist RYB Color Space & Perceptual Lightness Mathematics**
  - [`src/engine/color/ryb.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/ryb.ts) — Johannes Itten color wheel knot mappings, smooth interpolations, Rec. 709 perceptual luma ($Y' = 0.2126R + 0.7152G + 0.0722B$), and color harmony chord calculations.
- [x] **Non-Destructive Viewport Soft Proofing**
  - [`src/engine/color/soft_proofing.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/soft_proofing.ts) — Pure transformations for grayscale tonal evaluation, CMYK pigment print simulation (with paper reflectance factor), and CSS display filter mapping.
  - Connected to [`TopNavBar.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/TopNavBar.tsx) (interactive dropdown with live badge) and [`CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) (non-destructive artboard presentation filter).
- [x] **Pure Color Space Conversions**
  - [`src/engine/color/color_conversions.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/color_conversions.ts) — `hsvToRgb`, `rgbToHsv`, `rgbToHex`, `hexToRgb`.
- [x] **Automated Headless Test Suite (Vitest)**
  - 51 unit tests across `hsy.test.ts`, `ryb.test.ts`, `soft_proofing.test.ts`, `color_conversions.test.ts`, `useDocumentStore.test.ts`, `barycentric_triangle.test.ts`, and `discrete_wheel.test.ts` passing in <100ms.
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

- [x] **Krita Artistic Color Selector (Core Science & UI)**:
  - Reference: [`invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector`](https://invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector)
  - **Artist RYB Color Space**: Johannes Itten color wheel (Blue ↔ Orange, Yellow ↔ Purple, Red ↔ Green complements).
  - **Perceptual Value ($Y'$ Luma / Rec. 709)**: Preserves perceived lightness around the wheel.
  - **Isoluminant Desaturation**: Desaturating radially inward leads to the exact neutral gray of that same luminance.
  - **Dedicated Companion Value Slider**: Linear value scale beside the wheel.
  - **Harmonic Chords**: Interactive complementary and triadic indicators.
  - *Future Enhancements*: James Gurney rotatable vector gamut masks (`.kgm` format).
