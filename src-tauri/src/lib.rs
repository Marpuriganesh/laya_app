use tauri::Manager;

pub mod brush_commands;
use brush_commands::{
  rust_brush_clear, rust_brush_set_config, rust_brush_set_modal_open,
  BrushEngineState,
};

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
      rust_brush_set_config,
      rust_brush_set_modal_open,
      rust_brush_clear
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
