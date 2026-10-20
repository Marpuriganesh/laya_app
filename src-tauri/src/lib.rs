use tauri::Manager;

#[tauri::command]
async fn detach_panel(
  app: tauri::AppHandle,
  label: String,
  title: String,
  panel_id: String,
  width: f64,
  height: f64,
) -> Result<(), String> {
  // If window already exists, bring it to front and focus
  if let Some(existing_window) = app.get_webview_window(&label) {
    let _ = existing_window.show();
    let _ = existing_window.unminimize();
    let _ = existing_window.set_focus();
    return Ok(());
  }

  let url = format!("/?detached={}", panel_id);
  let win_builder = tauri::WebviewWindowBuilder::new(
    &app,
    &label,
    tauri::WebviewUrl::App(url.into()),
  )
  .title(&title)
  .inner_size(width, height)
  .min_inner_size(240.0, 200.0)
  .resizable(true)
  .decorations(false)
  .transparent(true)
  .shadow(false);

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
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![detach_panel, set_always_on_top])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
