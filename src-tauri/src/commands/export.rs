use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
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

/// 저장을 허용하는 확장자. 이 목록 밖의 이름은 .bvh로 강제한다.
///
/// 확장자를 프론트가 정하되 아무 값이나 받지는 않는다. 여기가 열려 있으면 파일명 문자열
/// 하나로 임의 확장자를 쓸 수 있게 되고, 그건 저장 폴더에 무엇이든 만들 수 있다는 뜻이다.
const ALLOWED_EXTENSIONS: &[&str] = &[".bvh", ".fbx", ".zip"];

#[cfg(test)]
mod csp_save_tests {
    use super::sanitize_file_name;
    #[test]
    fn csp_zip_extension_is_preserved_and_paths_cannot_escape() {
        assert_eq!(sanitize_file_name("standin_CSP.zip"), "standin_CSP.zip");
        assert_eq!(sanitize_file_name("../CSP.zip"), "..CSP.zip");
        assert_eq!(sanitize_file_name("unsafe.exe"), "unsafe.exe.bvh");
    }
}

/// 파일명에서 경로 구분자·예약 문자를 제거하고 허용 확장자를 강제한다(ADR-006).
fn sanitize_file_name(raw: &str) -> String {
    let cleaned: String = raw.chars().filter(|c| !INVALID_CHARS.contains(c)).collect();
    let trimmed = cleaned.trim();
    let base = if trimmed.is_empty() { "standin_pose" } else { trimmed };

    let lower = base.to_lowercase();
    if ALLOWED_EXTENSIONS.iter().any(|ext| lower.ends_with(ext)) {
        base.to_string()
    } else {
        format!("{base}.bvh")
    }
}

#[path = "unique_file.rs"]
mod unique_file;

/// 드래그 미리보기 이미지. tauri-plugin-drag가 이미지 파일 **경로**를 요구하므로
/// 바이너리에 넣어 두고 필요할 때 앱 데이터 폴더에 풀어 쓴다. 번들 리소스로 두면
/// tauri.conf 설정이 필요하고 개발·배포 경로가 갈리는데, 이 방식은 양쪽에서 같다.
const DRAG_PREVIEW_PNG: &[u8] = include_bytes!("../../icons/64x64.png");

/// 드래그 미리보기 이미지 경로. 없으면 한 번 만들고 이후에는 같은 경로를 돌려준다(ADR-009).
#[tauri::command]
pub fn drag_icon_path(app: AppHandle) -> Result<String, ExportError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ExportError::new("UNSUPPORTED", e.to_string()))?;

    fs::create_dir_all(&dir).map_err(|e| ExportError::new("WRITE_FAILED", e.to_string()))?;

    let path = dir.join("drag-preview.png");
    if !path.exists() {
        fs::write(&path, DRAG_PREVIEW_PNG)
            .map_err(|e| ExportError::new("WRITE_FAILED", e.to_string()))?;
    }

    Ok(path.to_string_lossy().to_string())
}

/// 폴더가 아직 존재하는지 확인한다. 설정에 저장해둔 폴더가 삭제됐을 때 안내하려고 쓴다(docs/03 §9).
#[tauri::command]
pub fn folder_exists(path: String) -> bool {
    !path.is_empty() && Path::new(&path).is_dir()
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

/// 선택된 폴더에 포즈 파일을 쓴다(BVH 또는 FBX).
///
/// 본문을 base64로 받는 이유는 FBX가 **텍스트가 아니기** 때문이다. String으로 받으면
/// Rust가 UTF-8을 강제하므로 FBX 바이너리는 애초에 전달되지 않고, Vec<u8>로 받으면
/// IPC가 바이트당 숫자 하나짜리 JSON 배열이 되어 수 MB 파일에서 눈에 띄게 느려진다.
#[tauri::command]
pub fn save_pose_file(
    folder: String,
    file_name: String,
    content_base64: String,
    scene_metadata: Option<String>,
) -> Result<SavedFile, ExportError> {
    let folder_path = Path::new(&folder);
    if !folder_path.is_dir() {
        return Err(ExportError::new("INVALID_FOLDER", "선택한 폴더를 찾을 수 없습니다."));
    }

    let bytes = BASE64
        .decode(content_base64.as_bytes())
        .map_err(|e| ExportError::new("WRITE_FAILED", e.to_string()))?;

    let safe_name = sanitize_file_name(&file_name);
    if let Some(metadata) = &scene_metadata {
        if metadata.len() > 128 * 1024 {
            return Err(ExportError::new("WRITE_FAILED", "장면 정보를 확인하지 못했습니다."));
        }
        let parsed: serde_json::Value = serde_json::from_str(metadata)
            .map_err(|_| ExportError::new("WRITE_FAILED", "장면 정보를 확인하지 못했습니다."))?;
        if !safe_name.to_lowercase().ends_with(".fbx")
            || parsed["version"] != "csp-scene-manifest-v1"
            || parsed["artifact"]["sha256"].as_str().is_none_or(|sha| sha.len() != 64) {
            return Err(ExportError::new("WRITE_FAILED", "장면 정보를 확인하지 못했습니다."));
        }
    }
    let final_path = match scene_metadata.as_deref() {
        Some(metadata) => unique_file::write_unique_with_sidecar(folder_path, &safe_name, &bytes, Some(metadata.as_bytes())),
        None => unique_file::write_unique(folder_path, &safe_name, &bytes),
    }.map_err(|e| ExportError::new("WRITE_FAILED", e.to_string()))?;

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
