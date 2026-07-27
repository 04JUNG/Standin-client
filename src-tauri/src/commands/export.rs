use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// 저장 결과. 실제로 쓰여진 경로를 프론트에 돌려준다(docs/12 §3).
#[derive(Serialize)]
pub struct SavedFile {
    path: String,
}

/// 저장 오류. 프론트 ExportError로 매핑되도록 code/message로 직렬화한다(docs/12, ADR-006).
#[derive(Serialize)]
pub struct ExportError {
    code: String,
    message: String,
}

impl ExportError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

const INVALID_CHARS: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/// 파일명에서 경로 구분자·예약 문자를 제거하고 확장자를 .bvh로 강제한다(ADR-006).
fn sanitize_file_name(raw: &str) -> String {
    let cleaned: String = raw.chars().filter(|c| !INVALID_CHARS.contains(c)).collect();
    let trimmed = cleaned.trim();
    let base = if trimmed.is_empty() { "standin_pose" } else { trimmed };

    if base.to_lowercase().ends_with(".bvh") {
        base.to_string()
    } else {
        format!("{base}.bvh")
    }
}

/// OS 다운로드 폴더 경로(docs/12 §4 기본값). 하드코딩하지 않고 Tauri path resolver로 조회한다.
#[tauri::command]
pub fn default_save_dir(app: AppHandle) -> Result<String, ExportError> {
    app.path()
        .download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| ExportError::new("UNSUPPORTED", e.to_string()))
}

/// 네이티브 폴더 선택 대화상자. 취소 시 Ok(None).
#[tauri::command]
pub async fn choose_save_folder(
    app: AppHandle,
    current: Option<String>,
) -> Result<Option<String>, ExportError> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    let mut builder = app.dialog().file().set_title("저장 폴더 선택");
    if let Some(dir) = current.as_ref().filter(|d| Path::new(d).is_dir()) {
        builder = builder.set_directory(dir);
    }

    builder.pick_folder(move |folder| {
        let _ = tx.send(folder);
    });

    let picked = rx
        .await
        .map_err(|e| ExportError::new("UNSUPPORTED", e.to_string()))?;

    Ok(picked.map(|p| p.to_string()))
}

/// 선택된 폴더에 placeholder 포즈 파일을 쓴다. 실제 서버 다운로드는 서버 준비 후 추가(ADR-006).
#[tauri::command]
pub fn save_pose_file(folder: String, file_name: String, content: String) -> Result<SavedFile, ExportError> {
    let folder_path = Path::new(&folder);
    if !folder_path.is_dir() {
        return Err(ExportError::new("INVALID_FOLDER", "선택한 폴더를 찾을 수 없습니다."));
    }

    let safe_name = sanitize_file_name(&file_name);
    let final_path: PathBuf = folder_path.join(&safe_name);

    // 경로 traversal 방지: 최종 경로는 반드시 선택한 폴더 하위여야 한다.
    if final_path.parent() != Some(folder_path) {
        return Err(ExportError::new("INVALID_FOLDER", "잘못된 파일 경로입니다."));
    }

    fs::write(&final_path, content)
        .map_err(|e| ExportError::new("WRITE_FAILED", e.to_string()))?;

    Ok(SavedFile {
        path: final_path.to_string_lossy().to_string(),
    })
}

/// 저장된 파일을 OS 파일 탐색기에서 선택된 채로 연다. OS 분기는 이 함수 안에 모은다(CLAUDE.md §10).
#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), ExportError> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(ExportError::new("INVALID_FOLDER", "파일을 찾을 수 없습니다."));
    }

    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").args(["/select,", &path]).spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").args(["-R", &path]).spawn();

    #[cfg(target_os = "linux")]
    let result = {
        let parent = path_buf.parent().unwrap_or(&path_buf);
        Command::new("xdg-open").arg(parent).spawn()
    };

    result
        .map(|_| ())
        .map_err(|e| ExportError::new("UNSUPPORTED", e.to_string()))
}
