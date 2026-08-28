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
use tauri::AppHandle;

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

/// 시스템 프롬프트를 띄우고 **지금 시점의** 상태를 돌려준다.
///
/// 프롬프트의 응답을 여기서 기다리지 않는다. `CGRequestScreenCaptureAccess`는 대화상자를
/// 띄우는 UI 호출이라 메인 스레드에 맡기고, command는 곧바로 돌아온다. 기다렸다가
/// 사용자가 대화상자를 그대로 두면 command가 영영 돌아오지 않고, 화면은 로딩에 갇힌다
/// (0.1.1-beta.5 드래프트에서 실측 — 바의 캡처 버튼이 아무 반응도 하지 않게 됐다).
///
/// 그래서 보통 `Denied`가 돌아온다. 사용자가 허용하면 창이 다시 활성화될 때 프론트가
/// 상태를 다시 읽어 반영한다(`useScreenPermission`).
#[tauri::command]
pub fn request_screen_recording(app: AppHandle) -> ScreenPermissionStatus {
    #[cfg(target_os = "macos")]
    if !objc2_core_graphics::CGPreflightScreenCaptureAccess() {
        let _ = app.run_on_main_thread(|| {
            objc2_core_graphics::CGRequestScreenCaptureAccess();
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;

    status()
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

/// 지금 캡처가 가능한지. **TCC 데이터베이스를 읽기만 한다** — 대화상자를 띄우지 않으므로
/// 응답을 기다리는 일이 없다.
///
/// 캡처 경로가 이 함수만 쓰는 이유가 여기 있다. 캡처는 즉시 성공하거나 즉시 실패해야
/// 한다. 프롬프트를 띄우고 응답을 기다리면 그동안 캡처 흐름이 "진행 중"에 묶이고,
/// 재진입 방지에 걸려 이후 클릭이 전부 무시된다. 프롬프트는 사용자가 "권한 허용하기"를
/// 눌렀을 때만 뜬다(`request_screen_recording`).
pub fn has_screen_access() -> bool {
    status() != ScreenPermissionStatus::Denied
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
