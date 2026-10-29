use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceItemDto {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub resource_type: String, // "brushes", "patterns", "presets"
    pub file_size_bytes: u64,
}

pub fn get_resources_root(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join("Library/Application Support/com.sketch.dev")
        });
    app_dir.join("resources")
}

pub fn ensure_resource_directories(app: &tauri::AppHandle) -> Result<(), String> {
    let root = get_resources_root(app);
    let subdirs = ["brushes", "patterns", "presets"];
    for sub in &subdirs {
        let dir = root.join(sub);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    // Seed real default assets if brushes folder is empty
    let brushes_dir = root.join("brushes");
    if let Ok(entries) = fs::read_dir(&brushes_dir) {
        if entries.count() == 0 {
            seed_default_brushes(app, &brushes_dir);
        }
    }

    let patterns_dir = root.join("patterns");
    if let Ok(entries) = fs::read_dir(&patterns_dir) {
        if entries.count() == 0 {
            seed_default_patterns(app, &patterns_dir);
        }
    }

    Ok(())
}

fn seed_default_brushes(app: &tauri::AppHandle, brushes_dir: &PathBuf) {
    let candidates = [
        PathBuf::from("resources/brushes"),
        PathBuf::from("../resources/brushes"),
        app.path().resource_dir().map(|p| p.join("resources/brushes")).unwrap_or_default(),
    ];

    for src_dir in &candidates {
        if src_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(src_dir) {
                for entry in entries.flatten() {
                    let dest = brushes_dir.join(entry.file_name());
                    let _ = fs::copy(entry.path(), dest);
                }
                return;
            }
        }
    }
}

fn seed_default_patterns(app: &tauri::AppHandle, patterns_dir: &PathBuf) {
    let candidates = [
        PathBuf::from("resources/patterns"),
        PathBuf::from("../resources/patterns"),
        app.path().resource_dir().map(|p| p.join("resources/patterns")).unwrap_or_default(),
    ];

    for src_dir in &candidates {
        if src_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(src_dir) {
                for entry in entries.flatten() {
                    let dest = patterns_dir.join(entry.file_name());
                    let _ = fs::copy(entry.path(), dest);
                }
                return;
            }
        }
    }
}

#[tauri::command]
pub async fn rust_resource_list(
    app: tauri::AppHandle,
    resource_type: String,
) -> Result<Vec<ResourceItemDto>, String> {
    ensure_resource_directories(&app)?;
    let root = get_resources_root(&app);
    let target_dir = root.join(&resource_type);

    if !target_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    let entries = fs::read_dir(&target_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Filter hidden files
            if file_name.starts_with('.') {
                continue;
            }

            let file_size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| file_name.clone());

            let name = stem.replace('_', " ");
            let id = format!("{}:{}", resource_type, stem);

            items.push(ResourceItemDto {
                id,
                name,
                file_name,
                path: path.to_string_lossy().to_string(),
                resource_type: resource_type.clone(),
                file_size_bytes,
            });
        }
    }

    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(items)
}

#[tauri::command]
pub async fn rust_resource_read_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub async fn rust_resource_open_folder(
    app: tauri::AppHandle,
    resource_type: String,
) -> Result<(), String> {
    ensure_resource_directories(&app)?;
    let root = get_resources_root(&app);
    let target_dir = root.join(&resource_type);

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = target_dir;
    }

    Ok(())
}
