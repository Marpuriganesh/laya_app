#ifndef NATIVE_OVERLAY_H
#define NATIVE_OVERLAY_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Exported by Rust (brush_commands.rs)
void rust_overlay_init(uint32_t width, uint32_t height);
void rust_overlay_begin_stroke(float x, float y, float pressure);
void rust_overlay_paint_event(float x, float y, float pressure);
void rust_overlay_end_stroke(void);
bool rust_overlay_begin_stroke_dirty(float x, float y, float pressure, int32_t* out_x, int32_t* out_y, int32_t* out_w, int32_t* out_h);
bool rust_overlay_begin_stroke_tilt_dirty(float x, float y, float pressure, float tilt_x, float tilt_y, int32_t* out_x, int32_t* out_y, int32_t* out_w, int32_t* out_h);
bool rust_overlay_paint_event_dirty(float x, float y, float pressure, int32_t* out_x, int32_t* out_y, int32_t* out_w, int32_t* out_h);
bool rust_overlay_paint_event_tilt_dirty(float x, float y, float pressure, float tilt_x, float tilt_y, int32_t* out_x, int32_t* out_y, int32_t* out_w, int32_t* out_h);
bool rust_overlay_end_stroke_dirty(int32_t* out_x, int32_t* out_y, int32_t* out_w, int32_t* out_h);
const uint8_t* rust_overlay_get_pixels(int32_t* out_width, int32_t* out_height);
float rust_overlay_get_diameter(void);
bool rust_overlay_get_size_dynamics(void);
bool rust_overlay_get_smoothed_tip(float* out_x, float* out_y);
void rust_overlay_get_brush_color(uint8_t* out_rgba);

// Exported by Objective-C (native_overlay.m)
void setup_native_canvas_overlay(void *ns_window_ptr, void *ns_view_ptr);
void set_native_overlay_modal_open(bool is_open);
void set_native_overlay_pan_active(bool is_panning);
void update_canvas_artboard_rect(float x, float y, float width, float height);
void trigger_native_overlay_repaint(void);
void set_ui_blocking_rects(const float *rects, uint32_t count);
void set_workspace_theme(bool is_dark);
void set_native_pressure_lut(const float *lut, int count);
void set_native_app_dock_icon(const uint8_t *bytes, uint32_t length);
void set_native_app_dock_icons(const uint8_t *light_bytes, uint32_t light_len, const uint8_t *dark_bytes, uint32_t dark_len);

#ifdef __cplusplus
}
#endif

#endif // NATIVE_OVERLAY_H
