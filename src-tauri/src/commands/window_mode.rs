// 창 모드 전환(ADR-008). 하나의 `main` 창을 바·앱·오버레이 세 모드로 변형한다.
//
// 창 하나를 변형하는 이유는 Tauri WebviewWindow마다 JS 컨텍스트가 분리되기 때문이다.
// 둘째 창을 만들면 토큰(모듈 메모리)·Zustand·Query 캐시를 전혀 공유하지 못한다.
//
// 개별 창 조작을 JS에서 조합하지 않고 command 하나가 원자적으로 처리한다. 중간에
// 실패하면 반쯤 전환된 창이 남고, JS로 하면 core:window 권한을 7개 이상 열어야 한다
// (docs/11 §3 최소 capability). 자체 command는 permission 대상이 아니다.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

/// 앱 모드의 최소 크기(CLAUDE.md §11 최소 권장 창 크기 960×640).
const APP_MIN_WIDTH: f64 = 960.0;
const APP_MIN_HEIGHT: f64 = 640.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowModeRequest {
    /// "bar" | "app" | "overlay"
    mode: String,
    /// 바 모드의 목표 크기. 크기 표는 UI 관심사라 TS가 소유한다(CLAUDE.md §9).
    width: Option<f64>,
    height: Option<f64>,
}

#[derive(Serialize)]
pub struct WindowError {
    code: String,
    message: String,
}

impl WindowError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, WindowError> {
    app.get_webview_window("main")
        .ok_or_else(|| WindowError::new("NO_WINDOW", "메인 창을 찾지 못했습니다."))
}

/// 바가 화면 밖으로 나가지 않게 현재 모니터 작업 영역 안으로 위치를 민다.
///
/// 모니터 해상도가 바뀌거나 저장된 위치가 사라진 모니터를 가리킬 때 바가 보이지 않는
/// 사고를 막는다. 모니터 정보 접근이 여기 있으므로 클램프도 여기서 한다.
fn clamp_into_monitor(window: &WebviewWindow, width: f64, height: f64) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);

    let Ok(current) = window.outer_position() else {
        return;
    };
    let current = current.to_logical::<f64>(scale);

    // 창이 최소한 화면 안에 완전히 들어오도록 민다. 화면보다 크면 좌상단에 붙인다.
    let max_x = (origin.x + area.width - width).max(origin.x);
    let max_y = (origin.y + area.height - height).max(origin.y);
    let x = current.x.clamp(origin.x, max_x);
    let y = current.y.clamp(origin.y, max_y);

    if (x - current.x).abs() > 0.5 || (y - current.y).abs() > 0.5 {
        let _ = window.set_position(LogicalPosition::new(x, y));
    }
}

/// 창 모드를 원자적으로 전환한다.
///
/// 전환 순서가 중요하다. 바·오버레이로 갈 때는 최소 크기 제약을 먼저 풀어야 한다 —
/// tauri.conf.json의 minWidth/minHeight(960×640) 때문에 그냥 줄이면 56×56이 거부된다.
#[tauri::command]
pub fn set_window_mode(app: AppHandle, req: WindowModeRequest) -> Result<(), WindowError> {
    let window = main_window(&app)?;

    match req.mode.as_str() {
        "bar" => {
            let width = req.width.unwrap_or(360.0);
            let height = req.height.unwrap_or(64.0);

            // 최소 크기 해제가 반드시 먼저다.
            let _ = window.set_min_size(None::<LogicalSize<f64>>);
            let _ = window.set_fullscreen(false);
            let _ = window.set_decorations(false);
            let _ = window.set_resizable(false);
            let _ = window.set_always_on_top(true);
            window
                .set_size(LogicalSize::new(width, height))
                .map_err(|e| WindowError::new("RESIZE_FAILED", e.to_string()))?;
            clamp_into_monitor(&window, width, height);
        }

        "overlay" => {
            // 프리즈 프레임이 화면과 1:1로 맞아야 하므로 전체화면으로 덮는다.
            let _ = window.set_min_size(None::<LogicalSize<f64>>);
            let _ = window.set_decorations(false);
            let _ = window.set_resizable(false);
            let _ = window.set_always_on_top(true);
            window
                .set_fullscreen(true)
                .map_err(|e| WindowError::new("RESIZE_FAILED", e.to_string()))?;
        }

        "app" => {
            let width = req.width.unwrap_or(1280.0);
            let height = req.height.unwrap_or(800.0);

            let _ = window.set_fullscreen(false);
            let _ = window.set_always_on_top(false);
            let _ = window.set_decorations(true);
            let _ = window.set_resizable(true);
            // 크기를 키운 뒤 최소 크기를 복원한다(순서가 반대면 거부될 수 있다).
            let _ = window.set_size(LogicalSize::new(width, height));
            let _ = window.set_min_size(Some(LogicalSize::new(APP_MIN_WIDTH, APP_MIN_HEIGHT)));
            let _ = window.center();
        }

        other => {
            return Err(WindowError::new(
                "UNKNOWN_MODE",
                format!("알 수 없는 창 모드입니다: {other}"),
            ));
        }
    }

    Ok(())
}

/// 바 위치를 저장하기 위해 현재 좌표를 읽는다. 논리 좌표로 돌려준다.
#[derive(Serialize)]
pub struct WindowPosition {
    x: f64,
    y: f64,
}

#[tauri::command]
pub fn get_window_position(app: AppHandle) -> Result<WindowPosition, WindowError> {
    let window = main_window(&app)?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window
        .outer_position()
        .map_err(|e| WindowError::new("POSITION_FAILED", e.to_string()))?
        .to_logical::<f64>(scale);
    Ok(WindowPosition { x: pos.x, y: pos.y })
}

/// 저장해 둔 바 위치를 복원한다. 화면 밖이면 작업 영역 안으로 민다.
#[tauri::command]
pub fn set_window_position(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), WindowError> {
    let window = main_window(&app)?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| WindowError::new("POSITION_FAILED", e.to_string()))?;
    clamp_into_monitor(&window, width, height);
    Ok(())
}
