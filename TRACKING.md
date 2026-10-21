# Project Progress & Roadmap Tracker

> **Architecture Mandates**: 100% Client-Side Static PWA • Origin Private File System (OPFS) • Decoupled Engine Core (1:1 C++/Rust translatable) • Strict Contract-First Design • Standardized Iconography (`lucide-react`) • Zero Unchecked Globals.

---

## High-Level Milestone Tracker

| Phase | Milestone | Status | Description |
|---|---|---|---|
| **Step 1** | **Creative UI Shell & Canvas Setup** | **Completed** | Procreate minimalist interface + Photoshop document dialog |
| **Step 2** | **Core Brush Engine & Krita/ABR Science** | **In Progress** | Pixel brush engine, Krita .kpp parser & viewport drawing complete; Smudge, MyPaint & ABR next |
| **Step 3** | **Non-Destructive Layers & Tile History** | **In Progress** | Layer stack contracts, store actions & floating UI panel completed; OPFS tile caching & history next |

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
- [x] **Dual-Mode Interactive Color Picker Popover (Automatic Bidirectional Sync + Krita Fidelity)**
  - [`src/ui/components/ColorPickerPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/ColorPickerPopover.tsx) — Full automatic bidirectional synchronization between Classic HSV and Artistic RYB modes (hue, saturation, and photometric value ladder stay in lockstep across tab switches, wheel interactions, and hex inputs); Full `setPointerCapture` across all surfaces; Classic Mode with **true Barycentric Triangle** mapping & edge clamping; **Krita-style Artistic RYB Wheel** with configurable discrete Hue sectors (6–36), Saturation rings (2–10), Value steps (4–20), Continuous ($\infty$) toggle, and companion stepped Value ladder.
- [x] **Barycentric Triangle Mathematics**
  - [`src/engine/color/barycentric_triangle.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/barycentric_triangle.ts) — Pure barycentric projection for equilateral triangle color pickers $(x, y) \leftrightarrow (S, V)$ with perimeter segment clamping.
- [x] **Discrete Wheel & Value Ladder Quantization**
  - [`src/engine/color/discrete_wheel.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/discrete_wheel.ts) — Sector/ring quantization, center neutral gray detection, discrete value steps generation.
- [x] **Unified Color Harmony Engine (Classic RGB & Artist RYB)**
  - [`src/engine/color/harmonies.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/color/harmonies.ts) — Multi-type color harmony generator (Complementary, Split-Complementary, Triadic, Tetradic/Square, Analogous) for both Classic 360° Hue ring and Artist RYB wheel, with geometric chord overlay lines.
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
  - 96 unit tests across `harmonies.test.ts`, `hsy.test.ts`, `ryb.test.ts`, `soft_proofing.test.ts`, `color_conversions.test.ts`, `useDocumentStore.test.ts`, `barycentric_triangle.test.ts`, `discrete_wheel.test.ts`, `gamut_mask.test.ts`, `canvas_transform.test.ts`, and `useDraggableWindow.test.ts` passing in <180ms.
- [x] **Brush Library Popover**
  - [`src/ui/components/BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx) — Categories, presets list tagged by engine, import buttons, wrapped in `<FloatingWindowPanel>` with dragging, snapping, and secondary monitor tear-off.
- [x] **Procreate & Photoshop-Grade Canvas Viewport Navigation**
  - [`src/ui/components/CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) — Zero-latency 1:1 hardware feel (removed CSS transition delay); Spacebar-drag pan navigation with grab/grabbing cursor; Middle-click drag pan; Backdrop drag pan; Non-passive native wheel/trackpad pan & exponential focal-point zoom; 2-finger multi-touch pinch-to-zoom and pan (with stroke cancel); Cmd/Ctrl + 0 / 1 / + / - shortcuts; double-click auto-fit.
  - [`src/engine/math/canvas_transform.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/math/canvas_transform.ts) — Pure mathematical transformations for focal zoom, fit-to-screen, and two-finger pinch.
- [x] **App Shell Assembly**
  - [`src/App.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/App.tsx) — Integrated workspace shell wiring TopNavBar, SidebarRail, CanvasViewport, ColorPickerPopover, LayersPopover, and BrushLibraryPopover.
- [x] **Unified Floating Window & Physics-Based Snapping Framework**
  - [`src/ui/hooks/useDraggableWindow.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/hooks/useDraggableWindow.ts) — Reusable headless window physics hook with strict navbar barrier protection ($\text{minY} = 0$, guaranteeing popovers never overlap the 56px navbar), soft magnetic drag resistance ($24\text{px}$ band with $0.4\times$ damping), smooth release-to-snap (`transition: translate 0.36s cubic-bezier(0.16, 1, 0.3, 1)`), double-click header reset to home dock, and Tier 1 multi-monitor resolution adaptation (`window.resize`).
  - [`src/ui/components/FloatingWindowPanel.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/FloatingWindowPanel.tsx) — Standardized floating window shell with grab handles, accessibility labels, and Tier 2 multi-monitor tear-off portal (`ExternalLink` button opening a native secondary window with zero-latency live state via React `createPortal`).
- [x] **Color Picker UI/UX Redesign & Rotatable Gamut Mask System**
  - [`src/ui/components/ColorPickerPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/ColorPickerPopover.tsx) — Streamlined 5-layer hierarchy; sub-pixel anti-aliased barycentric triangle picker with signed distance edge clamping; James Gurney rotatable vector color gamut masks (Triad, Complementary, Square, Atmospheric Dominance) with degree badge indicator; Procreate-style single harmony cycle button; 100% persistent HSV sliders with dedicated quick-pick harmony swatch layer.
- [ ] **Dedicated Color Palette Docker / Panel** (Queued: custom palettes, GIMP `.gpl` / Photoshop `.aco` palette import/export).

---

### 🎨 Step 2: The Core Brush Engine (The "Real Stuff")
*Goal: Implement Krita's documented brush dynamics, stroke smoothing, and preset compatibility.*

#### Part A: Stroke Smoothing & Anti-Faceting Pipeline
- [x] Define normalized stroke contracts ([`src/types/stroke.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/stroke.ts), [`src/types/brush.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/brush.ts)).
- [x] Implement 2D vector & spline math primitives ([`src/engine/math/vector2d.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/math/vector2d.ts), [`src/engine/math/dynamics_curve.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/math/dynamics_curve.ts)).
- [x] Implement **Streamline Smoother** ([`src/engine/stroke/streamline_smoother.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/streamline_smoother.ts)):
  - Velocity-adaptive pull-string mechanics.
  - Position & pressure exponential moving average (EMA).
- [x] Implement **Moving Average Smoother** ([`src/engine/stroke/moving_average_smoother.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/moving_average_smoother.ts)).
- [x] Implement **Predictive Bézier Smoother** ([`src/engine/stroke/predictive_bezier_smoother.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/predictive_bezier_smoother.ts)):
  - Velocity/acceleration look-ahead extrapolation.
  - Catmull-Rom to cubic Bézier spline fitting for true C¹ anti-faceting.
- [x] Implement **Stroke Interpolator & Dab Spacing Calculator** ([`src/engine/stroke/dab_spacing_calculator.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/dab_spacing_calculator.ts)).

#### Part B: Multi-Engine Brush Core & Raster Blitter
- [x] Define raster contracts & W3C blend modes ([`src/types/raster.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/raster.ts), [`src/engine/raster/blend_modes.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/blend_modes.ts)).
- [x] Implement headless in-memory raster buffer ([`src/engine/raster/memory_raster_buffer.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/memory_raster_buffer.ts)).
- [x] Implement **Canvas2dRasterTarget** ([`src/engine/raster/canvas2d_raster_target.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/canvas2d_raster_target.ts)) — Direct 60–120fps hardware blitting with scratch canvas reuse and software fallback.
- [x] Implement **Pixel Brush Engine** ([`src/engine/brush/pixel_brush_engine.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/pixel_brush_engine.ts)):
  - Anti-aliased Gaussian & circular procedural dab generator ($A(r) = \exp(-r^2 / 2\sigma^2)$).
  - Pressure & velocity dynamics curve evaluation (size, opacity, flow).
  - Uniform fractional dab spacing calculator.
- [x] Implement **Drawing App Engine Facade** ([`src/engine/drawing_app_engine.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/drawing_app_engine.ts), [`drawing_engine_instance.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/drawing_engine_instance.ts)) with 4 built-in production presets (Studio Pen, 6B Pencil, Soft Airbrush, Hard Round).
- [x] Implement **Pointer Event Normalizer** ([`src/input/pointer/pointer_event_normalizer.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/input/pointer/pointer_event_normalizer.ts)) — 120–240Hz coalesced event extraction, canvas coordinate unprojection, and velocity tracking.
- [x] Connect brush engine to [`CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) — Real-time drawing, pressure response, eraser blend mode, and seamless coexistence with multi-touch gestures.
- [ ] Implement **Color Smudge Engine** (`src/engine/brush/color_smudge_engine.ts`):
  - Dynamic canvas sampling, mixing rates, and smearing.
- [ ] Implement **MyPaint Engine** (`src/engine/brush/mypaint_engine.ts`):
  - WASM adapter wrapping `libmypaint`.

#### Part C: Preset Parsers & Live Import
- [x] Implement **Krita Preset Parser** ([`src/engine/brush/kpp_parser.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/kpp_parser.ts)):
  - Zero-dependency PNG byte scanner (`validatePngHeader`, `scanPngChunks`).
  - Dual-environment `zTXt`/`tEXt` decompression (Web `DecompressionStream` + Node `node:zlib`).
  - Embedded XML parameter parser (paintopid, size, spacing, softness, dynamics curves).
  - Embedded thumbnail extraction directly from PNG payload.
- [x] Implement **Krita Bundle Extractor** ([`src/engine/brush/bundle_parser.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/bundle_parser.ts), [`src/engine/brush/zip_reader.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/zip_reader.ts)):
  - Zero-dependency PKZIP 2.0 archive reader.
  - Extracts `meta.xml` bundle metadata (name, author, description).
  - Unpacks all `paintoppresets/*.kpp` presets in parallel.
  - Seamless multi-brush bundle loading in [`BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx) with dedicated bundle category tabs.
#### Part D: High-Resolution (A4/A3 @ 300 DPI) & iPad 9th Gen Baseline Architecture
- [x] **Continuous Bézier Spline Interpolation & Arc-Length Constant Spacing**:
  - [`src/engine/stroke/spline_interpolator.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/spline_interpolator.ts) — Streaming C¹ continuous Catmull-Rom to Cubic Bézier spline curve generator and Procreate/Paper-style midpoint Bézier generator with degree elevation and sensor dynamics interpolation.
  - [`src/engine/math/bezier_arc_length.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/math/bezier_arc_length.ts) — Exact 5-point Gauss-Legendre quadrature integration with bracketed Newton-Raphson parameter inversion ($S(t) - s = 0$) achieving sub-pixel ($<10^{-9}\text{px}$) accuracy.
  - [`src/engine/stroke/dab_spacing_calculator.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/stroke/dab_spacing_calculator.ts) — Upgraded with arc-length parameterization, placing dabs at exact Euclidean intervals regardless of curvature or drawing speed, with seamless `leftoverDistance` continuity between segments.
  - Integrated into [`DrawingAppEngine.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/drawing_app_engine.ts) for real-time spline streaming.
- [x] **High-Resolution Active Stroke Layer & Memory Architecture**:
  - [`src/engine/raster/active_stroke_layer.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/active_stroke_layer.ts) — Dual-buffer active stroke scratch overlay with stroke bounding box dirty rect tracking. On `endStroke()`, commits only the accumulated dirty rect down to the master raster target.
  - [`src/engine/raster/pixel_buffer_pool.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/pixel_buffer_pool.ts) — Zero-allocation memory pooling recycling `Uint8ClampedArray` buffers without memory fragmentation or garbage collection pauses.
  - [`src/engine/raster/sub_rect_blitter.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/sub_rect_blitter.ts) — 32-bit integer row zeroing (`clearSubRectUint32`) clearing dirty rect regions in <0.2ms, avoiding 70MB full-canvas blits on A3/A4.
- [x] **Sub-Pixel Anti-Aliasing & Blitting Overhaul**:
  - [`src/engine/raster/canvas2d_raster_target.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/raster/canvas2d_raster_target.ts) — Preserved floating-point sub-pixel coordinates `dabLeft` & `dabTop` in `blitDab()` for GPU hardware-accelerated bilinear filtering via `ctx.drawImage()`; explicitly set `imageSmoothingEnabled = true` and `imageSmoothingQuality = "high"`.
  - [`src/engine/brush/pixel_brush_engine.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/pixel_brush_engine.ts) — Replaced abrupt step cutoffs with a continuous $C^1$ Hermite cubic falloff ($1 - 3u^2 + 2u^3$) with zero slope at both core exit and outer perimeter ($r = dabRadius$).
  - [`src/ui/components/CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) — Added explicit `imageRendering: "auto"` to canvas element.
- [x] **Interactive Brush Settings Studio & Scratchpad**:
  - [`src/ui/components/BrushSettingsPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushSettingsPopover.tsx) — Full-featured floating panel with live controls for Hardness, Spacing, Flow, Aspect Ratio, Rotation Angle, Spline Mode (`Midpoint Bézier` vs `Catmull-Rom`), Smoothing Mode (`Moving Average`, `Streamline`, `None`), Pressure Dynamics toggles, and an interactive live test scratchpad.
  - Linked to Top Navigation Bar via the `SlidersHorizontal` icon button and via the edit button in [`BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx).
- [x] **Automated Unit Testing & Build Validation**:
  - 26 test suites, 265 automated unit tests passing headlessly in 380ms; zero TypeScript/Vite build errors.
- [x] **Strict Palm Rejection & Multi-Touch Gestures**:
  - [`src/ui/components/CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) — Strict Procreate ergonomics: Apple Pencil (`pointerType === "pen"`) exclusively draws ink; Finger (`pointerType === "touch"`) navigates or is rejected when stylus draws; 2 touches pinch, zoom, and rotate.
  - Added on-screen `Stylus-Only Mode` quick toggle indicator with `PenTool` icon.
- [x] **Canvas Rotation & Direct DOM rAF Optimization**:
  - [`src/engine/math/canvas_transform.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/math/canvas_transform.ts) — Two-finger twist rotation calculation with magnetic snapping (`snapRotationAngle`) at 0°, 90°, 180°, and 270° ($\pm 5^\circ$ tolerance).
  - Desktop 'R' key + drag rotation shortcut.
  - Direct DOM CSS transform bypass via `requestAnimationFrame` on canvas wrapper div, eliminating 120Hz React state re-render storms on iPad / ProMotion displays.
  - Stripped heavy 60px blur CSS box-shadow (`shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]`), eliminating Mobile Safari GPU texture blur re-rasterization memory spikes on 35MB–70MB surfaces.
- [x] **Universal iOS Safari Bundle Import & Canvas Drag-and-Drop**:
  - [`src/ui/components/BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx) — Universal iOS file input accept string (`.bundle,.kpp,.zip,application/zip,application/octet-stream,application/x-krita-bundle,*/*`) preventing iOS Files app from graying out `.bundle` files.
  - [`src/engine/brush/inflate.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/engine/brush/inflate.ts) — Pure-JS RFC 1951 Deflate engine guaranteeing decompression on iOS Safari 16–17.1 where `DecompressionStream("deflate-raw")` throws `TypeError`.
  - Native HTML5 Drag-and-Drop on [`CanvasViewport.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/CanvasViewport.tsx) and [`BrushLibraryPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/BrushLibraryPopover.tsx) with visual drop overlays.

---

### 🚀 Step 3: Non-Destructive Layers & Tile History
- [x] **Layer Contracts & Composite Stack Architecture**
  - [`src/types/layer.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/types/layer.ts) — Clean POD data structures for `LayerItem`, `LayerStack`, `LayerBlendMode` (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`), and `createDefaultLayerStack()`.
- [x] **Layer Stack State & Immutable Store Actions**
  - [`src/ui/hooks/useDocumentStore.ts`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/hooks/useDocumentStore.ts) — Reactive layer management (`addLayer`, `deleteLayer`, `duplicateLayer`, `toggleLayerVisibility`, `toggleLayerLock`, `setLayerOpacity`, `setLayerBlendMode`, `renameLayer`) with full Vitest unit test coverage.
- [x] **Procreate-Style Floating Layers Panel**
  - [`src/ui/components/LayersPopover.tsx`](file:///Users/ganeshmarpuri/development/sketch_app/src/ui/components/LayersPopover.tsx) — Draggable and snappable floating panel with thumbnail previews, inline double-click rename, opacity slider ($0\%-100\%$), blend mode selector, lock/visibility toggles, and secondary monitor tear-off.
- [ ] Tile-based non-destructive undo/redo history.
- [ ] Origin Private File System (OPFS) tile caching for multi-gigabyte document support.

---

### 🖥️ Native Desktop Architecture & AppKit Hardware Workspace
*Status: Architecture Proven & Initial Foundation Complete — Paused to Focus on Stroke Engine Perfection*

#### Completed Milestones:
- [x] **Full-Window Native Workspace (`NativeBackgroundWorkspaceView`)**:
  - Replaced floating overlay with a full-window NSView positioned directly behind the transparent WKWebView (`NSWindowBelow`).
  - Added native `CALayer` 12px rounded corners (`cornerRadius = 12.0f; masksToBounds = YES;`) matching `rounded-xl` and macOS borderless window geometry.
- [x] **Native Canvas Artboard Composition**:
  - Native rendering of dark/light workbench backdrop, artboard paper surface with drop shadow, border, and direct CoreGraphics blitting of the Rust pixel buffer.
  - Zero-latency 120Hz/240Hz Apple Pencil and stylus hardware event pipeline directly from Cocoa `NSEvent` to Rust `PixelBrushEngine`.
- [x] **Dynamic Theme Synchronization**:
  - Native background dynamically switches between dark workbench (`#18181b`) and light workbench (`#e4e4e7`) with adjusted paper shadows when toggling theme in React.
- [x] **Native Window Destruction**:
  - Added native `close_window` Rust command using `window.destroy()` for detached secondary windows.

#### Documented Observations & Polish Backlog (To Revisit):
- [ ] **UI Exclusion Rect Coordinate Calibration**:
  - In certain overlap configurations (e.g., Color Picker or Zoom pill over canvas), clicks can sometimes bleed into the canvas monitor if WebKit `getBoundingClientRect` and Cocoa window coordinates have slight scaling or titlebar offset discrepancies (e.g. Plus button registers while Minus button hits canvas).
  - When closing a detached window, mouse up/down can register on the main window canvas underneath.
  - *Future Plan*: Implement strict Cocoa-side view hierarchy hit checking or a robust hit map to completely isolate front UI elements from canvas input.

---

### 🖌️ Next Immediate Focus: Stroke Engine Perfection
*Goal: Perfect the brush stroke feel, pressure curve dynamics, dab interpolation, and rendering fidelity.*

---

- [x] **Krita Artistic Color Selector (Core Science & UI)**:
  - Reference: [`invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector`](https://invent.kde.org/graphics/krita/-/tree/master/plugins/dockers/artisticcolorselector)
  - **Artist RYB Color Space**: Johannes Itten color wheel (Blue ↔ Orange, Yellow ↔ Purple, Red ↔ Green complements).
  - **Perceptual Value ($Y'$ Luma / Rec. 709)**: Preserves perceived lightness around the wheel.
  - **Isoluminant Desaturation**: Desaturating radially inward leads to the exact neutral gray of that same luminance.
  - **Dedicated Companion Value Slider**: Linear value scale beside the wheel.
  - **Harmonic Chords**: Interactive complementary and triadic indicators.
  - **James Gurney Vector Gamut Masks**: Rotatable polygons (Triad, Complementary, Square, Atmospheric Dominance) with barycentric radial boundary clamping, auto-color clamping, and live degree badge.
