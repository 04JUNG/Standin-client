// 창 모드 전환(ADR-008). 하나의 `main` 창을 바·앱·오버레이 세 모드로 변형한다.
//
// 창 하나를 변형하는 이유는 Tauri WebviewWindow마다 JS 컨텍스트가 분리되기 때문이다.
// 둘째 창을 만들면 토큰(모듈 메모리)·Zustand·Query 캐시를 전혀 공유하지 못한다.
//
// 개별 창 조작을 JS에서 조합하지 않고 command 하나가 원자적으로 처리한다. 중간에
// 실패하면 반쯤 전환된 창이 남고, JS로 하면 core:window 권한을 7개 이상 열어야 한다
// (docs/11 §3 최소 capability). 자체 command는 permission 대상이 아니다.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};

/// 앱 모드의 최소 크기(CLAUDE.md §11 최소 권장 창 크기 960×640).
const APP_MIN_WIDTH: f64 = 960.0;
const APP_MIN_HEIGHT: f64 = 640.0;

// Only semantic bar screens opt in. Native move/scale events keep the limit when the
// user drags the bar to a narrower monitor without changing the React route.
static BAR_MAX_WIDTH_FRACTION: Mutex<Option<f64>> = Mutex::new(None);

/// 창을 최소화했을 때 프론트에 "바로 접어라"를 알리는 이벤트(ADR-008).
pub const COLLAPSE_TO_BAR_EVENT: &str = "window://collapse-to-bar";

/// 창 제어(최소화·최대화·닫기). 창이 항상 무장식이라 앱 모드가 직접 제목 표시줄을 그린다.
///
/// JS 플러그인 API로 하면 core:window:allow-minimize·allow-close 등을 열어야 하지만
/// 자체 command는 권한이 필요 없다(docs/11 §3).
#[tauri::command]
pub fn window_control(app: AppHandle, action: String) -> Result<(), WindowError> {
    let window = main_window(&app)?;
    match action.as_str() {
        // 최소화는 on_window_event가 가로채 플로팅 바로 접는다.
        "minimize" => {
            let _ = window.minimize();
        }
        "toggleMaximize" => {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
        "close" => {
            let _ = window.close();
        }
        other => {
            return Err(WindowError::new(
                "UNKNOWN_ACTION",
                format!("알 수 없는 창 동작입니다: {other}"),
            ));
        }
    }
    Ok(())
}

/// 오버레이를 띄울 모니터의 물리 픽셀 경계. `capture.rs`의 `MonitorBounds`가 그대로 온다.
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct MonitorRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowModeRequest {
    /// "bar" | "app" | "overlay"
    mode: String,
    /// 바 모드의 목표 크기. 크기 표는 UI 관심사라 TS가 소유한다(CLAUDE.md §9).
    width: Option<f64>,
    height: Option<f64>,
    /// 오버레이 모드에서 덮을 모니터. 캡처한 모니터를 그대로 받는다.
    monitor: Option<MonitorRect>,
    max_width_fraction: Option<f64>,
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
    let area = monitor.work_area().size.to_logical::<f64>(scale);
    let origin = monitor.work_area().position.to_logical::<f64>(scale);

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

fn validated_width_fraction(value: Option<f64>) -> Result<Option<f64>, WindowError> {
    match value {
        Some(value) if !value.is_finite() || value <= 0.0 || value > 1.0 => Err(WindowError::new(
            "INVALID_WIDTH_LIMIT",
            "창 너비 제한이 올바르지 않습니다.",
        )),
        _ => Ok(value),
    }
}

fn fit_bar_dimensions(
    width: f64,
    height: f64,
    physical_area: (u32, u32),
    scale: f64,
    max_width_fraction: Option<f64>,
) -> (f64, f64) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let area_width = physical_area.0 as f64 / scale;
    let area_height = physical_area.1 as f64 / scale;
    // Round down in physical pixels so a fractional DPI cannot round the actual
    // window one pixel past the requested screen fraction.
    let width_limit = max_width_fraction
        .map(|fraction| ((physical_area.0 as f64 * fraction).floor() / scale).max(1.0))
        .unwrap_or(area_width);
    (
        width.min(area_width).min(width_limit).max(1.0),
        height.min(area_height).max(1.0),
    )
}

fn fit_bar_to_work_area(
    window: &WebviewWindow,
    width: f64,
    height: f64,
    max_width_fraction: Option<f64>,
) -> (f64, f64) {
    let current = window.current_monitor().ok().flatten();
    let monitors = current.map(|monitor| vec![monitor]).or_else(|| {
        // Some window managers briefly cannot identify a monitor during dragging.
        // For the restricted semantic bar use the smallest available work area,
        // which is safe whichever destination monitor eventually owns the window.
        if max_width_fraction.is_some() {
            window
                .available_monitors()
                .ok()
                .filter(|monitors| !monitors.is_empty())
        } else {
            None
        }
    });
    monitors
        .map(|monitors| {
            monitors
                .into_iter()
                .map(|monitor| {
                    let area = monitor.work_area().size;
                    fit_bar_dimensions(
                        width,
                        height,
                        (area.width, area.height),
                        monitor.scale_factor(),
                        max_width_fraction,
                    )
                })
                .fold((width, height), |fitted, next| {
                    (fitted.0.min(next.0), fitted.1.min(next.1))
                })
        })
        // If the OS supplies no monitor information at all, retain the existing
        // request and policy; the next native move/DPI event retries the constraint.
        .unwrap_or((width, height))
}

/// Called only for native move/DPI events. Rough bars have no policy and remain
/// unchanged. Do not clamp position here: that would interrupt cross-monitor dragging.
pub fn enforce_bar_width_for_monitor(window: &tauri::Window) {
    if window.label() != "main" {
        return;
    }
    let fraction = *BAR_MAX_WIDTH_FRACTION
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let Some(fraction) = fraction else {
        return;
    };
    let Some(webview) = window.app_handle().get_webview_window("main") else {
        return;
    };
    let Ok(size) = webview.inner_size() else {
        return;
    };
    let scale = webview.scale_factor().unwrap_or(1.0);
    let logical = size.to_logical::<f64>(scale);
    let (width, height) =
        fit_bar_to_work_area(&webview, logical.width, logical.height, Some(fraction));
    if (logical.width - width).abs() > 0.5 / scale || (logical.height - height).abs() > 0.5 / scale
    {
        let _ = webview.set_size(LogicalSize::new(width, height));
    }
}

/// 창을 지금 있는 모니터 전체에 맞춘다. macOS에서 네이티브 전체화면 대신 쓰는 경로다.
///
/// 오버레이가 덮을 모니터는 보통 캡처한 쪽이 알려주므로(`req.monitor`) 이 함수는 그 값이
/// 없을 때의 폴백이다.
#[cfg(target_os = "macos")]
fn cover_current_monitor(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let origin = monitor.position();
    let size = monitor.size();
    let _ = window.set_position(PhysicalPosition::new(origin.x, origin.y));
    let _ = window.set_size(PhysicalSize::new(size.width, size.height));
}

/// 창 모드를 원자적으로 전환한다.
///
/// 전환 순서가 중요하다. 바·오버레이로 갈 때는 최소 크기 제약을 먼저 풀어야 한다 —
/// tauri.conf.json의 minWidth/minHeight(960×640) 때문에 그냥 줄이면 56×56이 거부된다.
#[tauri::command]
pub fn set_window_mode(app: AppHandle, req: WindowModeRequest) -> Result<(), WindowError> {
    let window = main_window(&app)?;
    let max_width_fraction = validated_width_fraction(req.max_width_fraction)?;
    // Clear the policy before an app/overlay resize emits native window events.
    *BAR_MAX_WIDTH_FRACTION
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = if req.mode == "bar" {
        max_width_fraction
    } else {
        None
    };

    match req.mode.as_str() {
        "bar" => {
            let width = req.width.unwrap_or(360.0);
            let height = req.height.unwrap_or(64.0);
            let (width, height) = fit_bar_to_work_area(&window, width, height, max_width_fraction);

            // 최대화 상태에서는 Windows가 set_size를 무시한다. 해제가 먼저다(실측).
            let _ = window.unmaximize();
            // 최소 크기 해제도 축소 전에 해야 한다.
            let _ = window.set_min_size(None::<LogicalSize<f64>>);
            let _ = window.set_fullscreen(false);
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
            let _ = window.set_resizable(false);
            let _ = window.set_always_on_top(true);

            // 캡처한 모니터로 창을 먼저 옮긴다.
            //
            // set_fullscreen은 "창이 지금 있는 모니터"를 덮는다. 캡처 대상은 커서가
            // 있는 모니터인데 창은 바가 있던 자리에 그대로라, 옮기지 않으면 A 모니터
            // 사진을 B 모니터에 띄우게 된다. 듀얼 모니터 시연이 이렇게 깨졌다.
            //
            // 캡처 대상과 오버레이 위치를 **한 값**에서 파생시켜 둘이 갈라질 수 없게 한다.
            if let Some(rect) = req.monitor {
                // 전체화면 상태에서는 이동이 먹지 않는다. 먼저 푼다.
                let _ = window.set_fullscreen(false);

                // 크기까지 맞춰야 창 전체가 목적지 모니터 안에 들어간다. 걸쳐 있으면
                // OS가 어느 쪽을 "현재 모니터"로 볼지 보장되지 않는다.
                //
                // ⚠ 단위가 OS마다 다르다. xcap이 주는 값은 그 OS의 전역 창 좌표계
                // 그대로다 — Windows는 물리 픽셀, macOS는 points다(CGDisplayBounds).
                // macOS 값을 PhysicalSize로 넘기면 tao가 배율로 한 번 더 나눠, Retina
                // 에서 창이 화면의 절반 크기로 뜬다(0.1.1-beta.6에서 실측). 전체화면을
                // 쓸 때는 OS가 크기를 덮어써서 이 오류가 가려져 있었다.
                #[cfg(target_os = "macos")]
                {
                    let _ = window.set_position(LogicalPosition::new(rect.x as f64, rect.y as f64));
                    let _ =
                        window.set_size(LogicalSize::new(rect.width as f64, rect.height as f64));
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
                    let _ = window.set_size(PhysicalSize::new(rect.width, rect.height));
                }
            }

            // macOS에서는 네이티브 전체화면을 쓰지 않는다. 위에서 맞춘 크기가 곧 오버레이다.
            //
            // macOS의 전체화면 전환은 **비동기**다(tao가 `toggleFullScreen:`을 async로
            // 부른다). 그래서 오버레이를 빠져나올 때 set_fullscreen(false) 직후의
            // set_size가 전환 애니메이션에 덮여 없던 일이 된다. 스타일 마스크 복원도
            // 전환이 끝난 뒤로 미뤄져 무장식 창에 제목 표시줄이 되살아난다.
            //
            // 결과는 "캡처 후 앱이 화면 전체를 검게 덮고 그 안에 바가 떠 있는" 상태다
            // (0.1.1-beta.4에서 실측). 모니터 좌표로 직접 맞추면 전부 동기라 이 창이 없다.
            //
            // 잃는 것: 메뉴 막대와 Dock이 오버레이 위에 남는다. 전체화면일 때도 메뉴
            // 막대는 이미 보였고, 바가 깨지는 것보다 낫다.
            #[cfg(target_os = "macos")]
            if req.monitor.is_none() {
                cover_current_monitor(&window);
            }

            #[cfg(not(target_os = "macos"))]
            window
                .set_fullscreen(true)
                .map_err(|e| WindowError::new("RESIZE_FAILED", e.to_string()))?;
        }

        "app" => {
            let width = req.width.unwrap_or(1280.0);
            let height = req.height.unwrap_or(800.0);

            let _ = window.set_fullscreen(false);
            let _ = window.set_always_on_top(false);
            let _ = window.set_resizable(true);
            let _ = window.set_min_size(Some(LogicalSize::new(APP_MIN_WIDTH, APP_MIN_HEIGHT)));

            // 사용자가 최대화해 둔 창은 그대로 둔다 — 앱 화면 사이를 오갈 때마다
            // 크기를 되돌리면 의도를 빼앗는다. 작은 상태에서 올 때만 기본 크기로 맞춘다.
            if !window.is_maximized().unwrap_or(false) {
                let (w, h) = window
                    .inner_size()
                    .map(|s| {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        (s.width as f64 / scale, s.height as f64 / scale)
                    })
                    .unwrap_or((0.0, 0.0));
                // 이미 앱 크기라면(앱 화면 간 이동) 건드리지 않는다.
                if w < APP_MIN_WIDTH || h < APP_MIN_HEIGHT {
                    let _ = window.set_size(LogicalSize::new(width, height));
                    let _ = window.center();
                }
            }
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
    max_width_fraction: Option<f64>,
) -> Result<(), WindowError> {
    let max_width_fraction = validated_width_fraction(max_width_fraction)?;
    let window = main_window(&app)?;
    *BAR_MAX_WIDTH_FRACTION
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = max_width_fraction;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| WindowError::new("POSITION_FAILED", e.to_string()))?;
    let (width, height) = fit_bar_to_work_area(&window, width, height, max_width_fraction);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| WindowError::new("RESIZE_FAILED", e.to_string()))?;
    clamp_into_monitor(&window, width, height);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semantic_bar_stays_below_half_on_common_screens() {
        for screen in [1280, 1440, 1920] {
            let (width, _) = fit_bar_dimensions(720.0, 560.0, (screen, 1080), 1.0, Some(0.49));
            assert!(width < screen as f64 * 0.5);
            assert!(width <= screen as f64 * 0.49);
        }
    }

    #[test]
    fn width_limit_uses_logical_size_at_retina_and_fractional_dpi() {
        for scale in [1.25, 1.5, 2.0] {
            let (width, _) = fit_bar_dimensions(720.0, 560.0, (1920, 1080), scale, Some(0.49));
            assert!(width <= (1920.0 / scale) * 0.49);
            assert!(width * scale <= (1920.0_f64 * 0.49).floor());
        }
    }

    #[test]
    fn narrow_work_area_and_short_screen_keep_bar_inside_screen() {
        assert_eq!(
            fit_bar_dimensions(720.0, 760.0, (800, 600), 1.0, Some(0.49)),
            (392.0, 600.0)
        );
        assert_eq!(
            fit_bar_dimensions(720.0, 760.0, (640, 480), 2.0, Some(0.49)),
            (156.5, 240.0)
        );
    }

    #[test]
    fn rough_bar_has_no_fraction_limit() {
        assert_eq!(
            fit_bar_dimensions(720.0, 560.0, (1280, 1080), 1.0, None),
            (720.0, 560.0)
        );
    }

    #[test]
    fn malformed_width_limits_are_rejected() {
        for fraction in [0.0, -0.5, 1.1, f64::NAN, f64::INFINITY] {
            assert!(validated_width_fraction(Some(fraction)).is_err());
        }
        assert_eq!(validated_width_fraction(None).ok(), Some(None));
        assert_eq!(validated_width_fraction(Some(0.49)).ok(), Some(Some(0.49)));
    }
}
