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
const uint8_t* rust_overlay_get_pixels(int32_t* out_width, int32_t* out_height);
float rust_overlay_get_diameter(void);
bool rust_overlay_get_size_dynamics(void);

// Exported by Objective-C (native_overlay.m)
void setup_native_canvas_overlay(void *ns_window_ptr, void *ns_view_ptr);
void set_native_overlay_modal_open(bool is_open);
void trigger_native_overlay_repaint(void);

#ifdef __cplusplus
}
#endif

#endif // NATIVE_OVERLAY_H
