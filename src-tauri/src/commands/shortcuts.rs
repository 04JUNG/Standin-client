// 전역 단축키 등록(docs/07 §7, docs/02 §4 register_capture_shortcut).
//
// 등록을 Rust에 두는 이유는 capability 비용이다. generate_handler!에 등록한 자체
// command는 permission 대상이 아니고 JS listen()은 core:default가 커버하므로
// capabilities에 한 줄도 추가하지 않는다. JS 플러그인 API로 하면 global-shortcut
// 권한과 창 조작 권한을 함께 열어야 한다(docs/11 §3 최소 capability 원칙).
//
// global-shortcut 플러그인은 데스크톱 전용이므로 의존성도 데스크톱 타겟에만 있다.
// 그렇다고 모듈 전체를 cfg로 잘라내면 generate_handler! 목록을 플랫폼마다 중복
// 관리해야 하고 둘이 어긋날 위험이 생긴다. 그래서 모듈은 항상 컴파일하고 플러그인에
// 의존하는 본문만 cfg로 가른다 — 모바일에서는 UNSUPPORTED를 돌려준다.

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// 전역 캡처 단축키가 눌렸음을 프론트에 알리는 이벤트. 레포 최초의 Rust→프론트 이벤트다.
pub const CAPTURE_SHORTCUT_EVENT: &str = "shortcut://capture";

/// 프론트가 코드로 분기할 수 있게 capture.rs·export.rs와 같은 {code,message} 형태를 쓴다.
#[derive(Serialize)]
pub struct ShortcutError {
    code: String,
    message: String,
}

impl ShortcutError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// 전역 캡처 단축키를 등록한다. 이전 등록은 항상 먼저 해제한다(docs/07 §7 "설정에서 변경").
///
/// 앱이 쓰는 전역 단축키가 하나뿐이라 unregister_all로 충분하다. 두 개 이상으로
/// 늘어나면 State에 개별 추적을 넣어야 한다.
#[tauri::command]
pub fn register_capture_shortcut(
    app: AppHandle,
    accelerator: String,
) -> Result<(), ShortcutError> {
    #[cfg(desktop)]
    {
        use tauri::Emitter;
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

        let shortcut: Shortcut = accelerator.parse().map_err(|_| {
            ShortcutError::new("INVALID_ACCELERATOR", "단축키 형식을 인식할 수 없습니다.")
        })?;

        let global_shortcut = app.global_shortcut();
        let _ = global_shortcut.unregister_all();

        global_shortcut
            .on_shortcut(shortcut, |app, _shortcut, event| {
                // Pressed와 Released 양쪽에서 콜백이 오므로 필터가 없으면 두 번 발동한다.
                if event.state() == ShortcutState::Pressed {
                    let _ = app.emit(CAPTURE_SHORTCUT_EVENT, ());
                }
            })
            // Windows RegisterHotKey는 다른 앱이 점유 중이면 실패한다(docs/07 §7 충돌 안내).
            .map_err(|err| ShortcutError::new("REGISTER_FAILED", err.to_string()))?;

        Ok(())
    }

    #[cfg(not(desktop))]
    {
        let _ = (app, accelerator);
        Err(ShortcutError::new(
            "UNSUPPORTED",
            "이 플랫폼에서는 전역 단축키를 사용할 수 없습니다.",
        ))
    }
}

/// 명시적 해제. 앱 종료 시에는 플러그인 teardown이 알아서 해제한다.
#[tauri::command]
pub fn unregister_capture_shortcut(app: AppHandle) -> Result<(), ShortcutError> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;

        app.global_shortcut()
            .unregister_all()
            .map_err(|err| ShortcutError::new("UNREGISTER_FAILED", err.to_string()))
    }

    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(())
    }
}

/// 미인증 상태에서 단축키가 눌렸을 때 창만 앞으로 가져온다. 캡처는 시작하지 않는다.
#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), ShortcutError> {
    if let Some(window) = app.get_webview_window("main") {
        // 최소화된 창은 show()만으로 복원되지 않는다(Windows).
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}
