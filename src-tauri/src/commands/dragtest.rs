//! 임시 테스트용 command — 커밋 대상 아님.
//!
//! 앱 창 → 클립스튜디오 네이티브 드래그가 실제로 동작하는지 확인하려고 임의 확장자의
//! 샘플 파일을 만든다. `export::save_pose_file`은 확장자를 `.bvh`로 강제하므로
//! PNG·OBJ 같은 다른 포맷을 테스트할 수 없어 별도로 둔다.
//!
//! 확인이 끝나면 이 모듈, lib.rs 등록, mod.rs 선언, /dev/drag-test 라우트를 함께 지운다.

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct TestFile {
    path: String,
}

#[derive(Serialize)]
pub struct TestError {
    code: String,
    message: String,
}

impl TestError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// 앱 데이터 폴더의 `drag-test/`에 샘플 파일을 쓰고 경로를 돌려준다.
///
/// 사용자 문서 폴더를 더럽히지 않으려고 앱 데이터 폴더를 쓴다. 내용은 base64로 받아
/// PNG 같은 바이너리도 그대로 다룰 수 있게 한다.
#[tauri::command]
pub fn write_drag_test_file(
    app: AppHandle,
    file_name: String,
    content_base64: String,
) -> Result<TestFile, TestError> {
    // 경로 구분자를 막아 앱 데이터 폴더 밖으로 나가지 못하게 한다.
    if file_name.is_empty() || file_name.contains(['/', '\\', ':']) || file_name.contains("..") {
        return Err(TestError::new("INVALID", "잘못된 파일 이름입니다."));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| TestError::new("UNSUPPORTED", e.to_string()))?
        .join("drag-test");

    fs::create_dir_all(&dir).map_err(|e| TestError::new("WRITE_FAILED", e.to_string()))?;

    let bytes = general_purpose::STANDARD
        .decode(content_base64.as_bytes())
        .map_err(|e| TestError::new("INVALID", e.to_string()))?;

    let path = dir.join(&file_name);
    fs::write(&path, bytes).map_err(|e| TestError::new("WRITE_FAILED", e.to_string()))?;

    Ok(TestFile {
        path: path.to_string_lossy().to_string(),
    })
}
