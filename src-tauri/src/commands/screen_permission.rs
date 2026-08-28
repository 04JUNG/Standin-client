//! 화면 기록 권한. 운영체제 분기를 이 파일 하나에 모은다(CLAUDE.md §10, docs/07 §4).
//!
//! macOS에만 실제 검사가 있다. xcap은 `CGWindowListCreateImage`로 화면을 읽는데, 이
//! API는 화면 기록 권한이 없어도 **실패하지 않는다**. 대신 다른 앱 창이 전부 빠진,
//! 바탕화면만 담긴 이미지를 돌려준다. 캡처 직전 우리 창까지 숨기므로 결과는 순수한
//! 배경화면 한 장이다 — 0.1.1-beta 릴리스에서 "캡처를 누르면 배경화면이 뜬다"로
//! 보고된 증상이 이것이다.
//!
//! 개발 빌드에서 드러나지 않은 이유도 같다. `tauri dev`로 띄운 바이너리는 터미널이
//! 이미 받아 둔 권한을 타지만, 서명된 .app 번들은 별도의 TCC 주체라 권한을 처음부터
//! 다시 받아야 한다. 그래서 릴리스에서만 재현된다.
//!
//! 결론: 캡처 전에 권한을 직접 확인하고, 없으면 캡처를 시도하지 않고 오류로 알린다.

use serde::Serialize;

/// 화면 기록 권한 상태. 프론트가 온보딩 단계에서 안내를 고르는 데 쓴다.
///
/// 어느 플랫폼에서 컴파일하든 일부 variant는 생성되지 않는다 — Windows는 `NotRequired`만,
/// macOS는 나머지 둘만 쓴다. 계약 자체는 플랫폼 공통이므로 dead_code를 끈다.
#[allow(dead_code)]
#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScreenPermissionStatus {
    Granted,
    Denied,
    /// 권한 개념이 없는 플랫폼(Windows). "거부됨"과 섞으면 없는 설정 화면을 안내하게 된다.
    NotRequired,
}

/// 프롬프트 없이 현재 상태만 읽는다.
///
/// 요청과 조회를 분리하는 이유는 온보딩이다. 화면을 열자마자 프롬프트가 뜨면 사용자는
/// 무엇을 허용하는지 모른 채 결정하게 된다. 먼저 이유를 읽고, 버튼을 눌렀을 때만 뜬다.
#[tauri::command]
pub fn screen_recording_status() -> ScreenPermissionStatus {
    status()
}

/// 시스템 프롬프트를 띄우고 그 뒤의 상태를 돌려준다.
///
/// 프롬프트가 떠도 사용자가 아직 응답하지 않았으므로 보통 `Denied`가 나온다. 호출부는
/// 이것을 실패가 아니라 "허용 후 앱 재실행" 안내로 이어가야 한다.
#[tauri::command]
pub fn request_screen_recording() -> ScreenPermissionStatus {
    if ensure_screen_access() {
        ScreenPermissionStatus::Granted
    } else {
        status()
    }
}

#[cfg(target_os = "macos")]
fn status() -> ScreenPermissionStatus {
    if objc2_core_graphics::CGPreflightScreenCaptureAccess() {
        ScreenPermissionStatus::Granted
    } else {
        ScreenPermissionStatus::Denied
    }
}

#[cfg(not(target_os = "macos"))]
fn status() -> ScreenPermissionStatus {
    ScreenPermissionStatus::NotRequired
}

/// 화면 기록 권한이 있는지 확인하고, 없으면 시스템 프롬프트를 띄운다.
///
/// 반환값은 **지금 이 순간** 캡처가 가능한지다. 프롬프트를 띄운 직후에는 사용자가
/// 아직 응답하지 않았으므로 false다. 권한을 켜도 macOS는 프로세스 재시작 전까지
/// 기존 캡처 API에 반영하지 않으므로, 호출부는 "허용 후 앱 재실행"을 안내한다.
#[cfg(target_os = "macos")]
pub fn ensure_screen_access() -> bool {
    use objc2_core_graphics::{CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess};

    if CGPreflightScreenCaptureAccess() {
        return true;
    }

    // 아직 물어본 적이 없으면 여기서 시스템 프롬프트가 뜬다. 이미 거부된 적이 있으면
    // 프롬프트 없이 곧바로 false다 — 그때는 사용자가 시스템 설정에서 직접 켜야 한다.
    CGRequestScreenCaptureAccess()
}

/// macOS 외 플랫폼에는 화면 기록 권한 개념이 없다. Windows는 별도 권한 없이 캡처된다.
#[cfg(not(target_os = "macos"))]
pub fn ensure_screen_access() -> bool {
    true
}

/// 화면 기록 설정 화면을 연다(docs/07 §4의 "시스템 설정으로 이동하는 안내").
///
/// 한 번 거부하면 시스템 프롬프트가 다시 뜨지 않으므로, 사용자가 스스로 설정을
/// 찾아가야 하는 상태가 된다. 그 경로를 앱이 대신 열어준다.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// macOS 외에는 열 설정 화면이 없다. 프론트가 플랫폼 분기 없이 호출할 수 있도록 no-op을 둔다.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    Ok(())
}
