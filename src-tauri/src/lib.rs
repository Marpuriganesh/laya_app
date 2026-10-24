use tauri::Manager;

pub mod brush_commands;
pub mod resources;
pub mod settings;

use brush_commands::{
    rust_brush_clear, rust_brush_clear_dynamics, rust_brush_set_blend_mode, rust_brush_set_config,
    rust_brush_set_dynamics_mapping, rust_brush_set_modal_open,
    rust_brush_set_moving_average_config, rust_brush_set_pan_active,
    rust_brush_set_pressure_lut, rust_brush_set_pull_string_config,
    rust_layer_add, rust_layer_clear_active, rust_layer_delete,
    rust_layer_duplicate, rust_layer_reorder, rust_layer_set_active,
    rust_layer_set_blend_mode, rust_layer_set_opacity, rust_layer_set_visibility,
    rust_resource_register_pattern_grayscale, rust_resource_register_pattern_pat,
    rust_resource_register_pattern_rgba,
    rust_resource_register_tip_gbr, rust_resource_register_tip_mask,
    rust_resource_set_active_pattern, rust_resource_set_active_tip,
    rust_set_background_color, rust_set_background_visible,
    rust_set_document_size, rust_set_ui_blocking_rects, rust_set_workspace_theme,
    rust_update_artboard_rect, BrushEngineState,
};
use resources::{rust_resource_list, rust_resource_open_folder, rust_resource_read_file};
use settings::{rust_settings_load, rust_settings_save};

#[tauri::command]
async fn detach_panel(
    app: tauri::AppHandle,
    label: String,
    title: String,
    panel_id: String,
    width: f64,
    height: f64,
    max_width: Option<f64>,
    max_height: Option<f64>,
) -> Result<(), String> {
    // If window already exists, bring it to front and focus
    if let Some(existing_window) = app.get_webview_window(&label) {
        let _ = existing_window.show();
        let _ = existing_window.unminimize();
        let _ = existing_window.set_focus();
        return Ok(());
    }

    let max_w = max_width.unwrap_or(width * 2.0);
    let max_h = max_height.unwrap_or(height * 2.0);

    let url = format!("/?detached={}", panel_id);
    let win_builder = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title)
    .inner_size(width, height)
    .min_inner_size(240.0, 200.0)
    .max_inner_size(max_w, max_h)
    .resizable(true)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .accept_first_mouse(true);

    win_builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_always_on_top(
    window: tauri::Window,
    always_on_top: bool,
) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_window(
    window: tauri::Window,
) -> Result<(), String> {
    let _ = window.destroy();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BrushEngineState::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let menu = tauri::menu::Menu::default(app.handle())?;
                app.set_menu(menu)?;
            }

            // Ensure OS application resource directories exist and default assets are seeded
            let _ = resources::ensure_resource_directories(app.handle());

            // Attach High-Performance Native Canvas Overlay on macOS
            #[cfg(target_os = "macos")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    if let (Ok(ns_win), Ok(ns_view)) = (main_window.ns_window(), main_window.ns_view()) {
                        unsafe {
                            brush_commands::setup_native_canvas_overlay(ns_win, ns_view);
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detach_panel,
            set_always_on_top,
            close_window,
            rust_brush_set_config,
            rust_brush_set_blend_mode,
            rust_brush_set_pressure_lut,
            rust_brush_set_dynamics_mapping,
            rust_brush_clear_dynamics,
            rust_brush_set_moving_average_config,
            rust_brush_set_pull_string_config,
            rust_brush_set_modal_open,
            rust_brush_clear,
            rust_update_artboard_rect,
            rust_brush_set_pan_active,
            rust_set_document_size,
            rust_set_ui_blocking_rects,
            rust_set_workspace_theme,
            // Layer Commands
            rust_layer_add,
            rust_layer_delete,
            rust_layer_duplicate,
            rust_layer_set_active,
            rust_layer_set_opacity,
            rust_layer_set_blend_mode,
            rust_layer_set_visibility,
            rust_layer_reorder,
            rust_layer_clear_active,
            rust_set_background_color,
            rust_set_background_visible,
            // Resource Commands
            rust_resource_register_tip_gbr,
            rust_resource_register_tip_mask,
            rust_resource_set_active_tip,
            rust_resource_register_pattern_pat,
            rust_resource_register_pattern_grayscale,
            rust_resource_register_pattern_rgba,
            rust_resource_set_active_pattern,
            rust_resource_list,
            rust_resource_read_file,
            rust_resource_open_folder,
            // Settings Commands
            rust_settings_load,
            rust_settings_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
