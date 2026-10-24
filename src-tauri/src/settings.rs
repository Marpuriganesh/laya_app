use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_preset")]
    pub last_brush_preset_id: String,
    #[serde(default = "default_size")]
    pub brush_size: f32,
    #[serde(default = "default_opacity")]
    pub brush_opacity: f32,
    #[serde(default = "default_color")]
    pub active_color: String,
    #[serde(default = "default_true")]
    pub moving_average_enabled: bool,
    #[serde(default = "default_window_size")]
    pub moving_average_window: u32,
    #[serde(default = "default_velocity_multiplier")]
    pub moving_average_velocity_multiplier: f32,
    #[serde(default = "default_false")]
    pub pull_string_enabled: bool,
    #[serde(default = "default_string_length")]
    pub pull_string_radius: f32,
}

fn default_version() -> u32 { 1 }
fn default_theme() -> String { "dark".into() }
fn default_preset() -> String { "default-technical-pencil".into() }
fn default_size() -> f32 { 24.0 }
fn default_opacity() -> f32 { 1.0 }
fn default_color() -> String { "#18181b".into() }
fn default_true() -> bool { true }
fn default_false() -> bool { false }
fn default_window_size() -> u32 { 8 }
fn default_velocity_multiplier() -> f32 { 1.5 }
fn default_string_length() -> f32 { 24.0 }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            theme: "dark".into(),
            last_brush_preset_id: "default-technical-pencil".into(),
            brush_size: 24.0,
            brush_opacity: 1.0,
            active_color: "#18181b".into(),
            moving_average_enabled: true,
            moving_average_window: 8,
            moving_average_velocity_multiplier: 1.5,
            pull_string_enabled: false,
            pull_string_radius: 24.0,
        }
    }
}

pub fn get_settings_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join("Library/Application Support/com.sketch.dev")
        });
    let _ = fs::create_dir_all(&dir);
    dir.join("config.json")
}

pub fn read_settings_from_disk(app: &tauri::AppHandle) -> AppSettings {
    let path = get_settings_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub fn write_settings_to_disk(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app);
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rust_settings_load(app: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(read_settings_from_disk(&app))
}

#[tauri::command]
pub async fn rust_settings_save(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    write_settings_to_disk(&app, &settings)
}
