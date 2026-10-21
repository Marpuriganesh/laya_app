#ifndef SKETCH_CANVAS_VIEW_H
#define SKETCH_CANVAS_VIEW_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float diameter;
    float softness;
    float spacing;
    float opacity;
    float flow;
    bool size_by_pressure;
    bool opacity_by_pressure;
    bool is_erase;
    uint8_t color_r;
    uint8_t color_g;
    uint8_t color_b;
    uint8_t preset_index; // 1..=5
} NativeBrushInfo;

// Exported by Rust (main.rs)
void rust_native_init(uint32_t width, uint32_t height);
void rust_native_begin_stroke(float x, float y, float pressure);
void rust_native_paint_event(float x, float y, float pressure);
void rust_native_end_stroke(void);
const uint8_t* rust_native_get_pixels(int32_t* out_width, int32_t* out_height);
void rust_native_on_key(char key_char);
void rust_native_get_brush_info(NativeBrushInfo* out_info);
void rust_native_set_preset(uint8_t preset_index);

// Exported by Cocoa (sketch_canvas_view.m)
int run_native_cocoa_app(int width, int height, const char* title);

#ifdef __cplusplus
}
#endif

#endif // SKETCH_CANVAS_VIEW_H
