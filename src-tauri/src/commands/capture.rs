use super::screen_permission;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::io::Cursor;
use xcap::image::ImageFormat;
use xcap::Monitor;

/// 캡처한 모니터의 가상 데스크톱 상 경계. **물리 픽셀**이다.
///
/// 논리 좌표를 쓰지 않는 이유는 혼합 DPI다. Tauri는 논리 좌표를 창의 **현재** scale
/// factor로 해석하는데, 배율이 다른 모니터로 창을 옮기는 순간 그 값이 목적지와 다르다.
/// 물리 좌표는 가상 데스크톱 전체에서 하나의 좌표계라 그런 모호함이 없다.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct MonitorBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// 프리즈 프레임 결과. 프론트로 data URL과 물리 픽셀 크기를 전달한다(ADR-003).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFrame {
    data_url: String,
    width: u32,
    height: u32,
    /// 이 프레임이 어느 모니터의 것인지. 오버레이를 같은 모니터에 띄우는 데 쓴다.
    monitor: MonitorBounds,
}

/// 캡처 오류. 프론트 CaptureError로 매핑되도록 code/message로 직렬화한다(docs/07 §6).
#[derive(Serialize)]
pub struct CaptureError {
    code: String,
    message: String,
}

impl CaptureError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// 캡처 대상 모니터를 고른다. **커서가 있는 모니터**가 기준이다(docs/07 §12).
///
/// 예전에는 주 모니터를 고정으로 캡처했다. 듀얼 모니터 + 액정 타블렛 환경에서
/// 작가가 타블렛에 그리던 화면이 아니라 반대쪽 모니터가 찍혔다(작가 인터뷰).
/// 방금 손을 둔 화면 = 커서가 있는 화면이므로 이것을 기준으로 삼는다.
///
/// 커서를 못 읽거나 어느 모니터에도 속하지 않으면 주 모니터로, 그마저 없으면 첫
/// 모니터로 내려간다. 캡처 자체가 실패하는 것보다 낫다.
fn pick_monitor(cursor: Option<(i32, i32)>) -> Result<Monitor, CaptureError> {
    if let Some((x, y)) = cursor {
        if let Ok(monitor) = Monitor::from_point(x, y) {
            return Ok(monitor);
        }
    }

    let monitors =
        Monitor::all().map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?;
    monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .cloned()
        .ok_or_else(|| CaptureError::new("UNSUPPORTED", "사용 가능한 모니터가 없습니다."))
}

fn capture_monitor(cursor: Option<(i32, i32)>) -> Result<ScreenFrame, CaptureError> {
    let monitor = pick_monitor(cursor)?;

    // 경계를 이미지보다 먼저 읽는다. 캡처 뒤에 읽으면 그 사이 해상도가 바뀌었을 때
    // 프레임과 경계가 어긋난 채로 프론트에 나간다.
    let bounds = MonitorBounds {
        x: monitor
            .x()
            .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?,
        y: monitor
            .y()
            .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?,
        width: monitor
            .width()
            .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?,
        height: monitor
            .height()
            .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?,
    };

    let image = monitor
        .capture_image()
        .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?;
    let (width, height) = (image.width(), image.height());

    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| CaptureError::new("SAVE_FAILED", e.to_string()))?;

    let encoded = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(ScreenFrame {
        data_url: format!("data:image/png;base64,{encoded}"),
        width,
        height,
        monitor: bounds,
    })
}

/// 커서가 있는 화면을 캡처해 프리즈 프레임으로 반환한다.
/// 앱 창을 잠시 숨겨 캡처에 포함되지 않게 한다. 취소는 프론트(Escape)에서 처리한다.
#[tauri::command]
pub async fn grab_screen(window: tauri::Window) -> Result<ScreenFrame, CaptureError> {
    // 권한 확인은 창을 숨기기 전에, 그리고 **기다리지 않고** 한다. 확인을 건너뛰면
    // 캡처는 "성공"하고 배경화면만 담긴 프레임이 나간다(screen_permission 모듈 주석).
    //
    // 여기서 프롬프트를 띄우고 응답을 기다리면 안 된다. 그동안 이 command가 돌아오지
    // 않아 흐름이 "진행 중"에 묶이고, 재진입 방지에 걸려 이후 클릭이 전부 무시된다.
    // 사용자에게는 버튼이 아무 반응도 하지 않는 것으로 보인다(0.1.1-beta.5 실측).
    if !screen_permission::has_screen_access() {
        return Err(CaptureError::new(
            "PERMISSION_DENIED",
            "화면 기록 권한이 없어 다른 앱 창을 캡처할 수 없습니다.",
        ));
    }

    // 창을 숨기기 전에 커서를 읽는다. 숨김이 포인터를 옮기지는 않지만, 순서를 고정해야
    // "어느 시점의 커서인가"가 코드에서 분명하다.
    // 읽기에 실패하면 None으로 넘겨 주 모니터 폴백을 타게 한다.
    let cursor = window
        .cursor_position()
        .ok()
        .map(|p| (p.x as i32, p.y as i32));

    // 창 숨김은 메인 스레드 이벤트 루프에서 처리되어야 하므로,
    // 캡처는 blocking 풀에서 짧은 지연 뒤 수행한다.
    let _ = window.hide();

    let result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        capture_monitor(cursor)
    })
    .await
    .map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?;

    // 전역 단축키로 진입하면 창이 최소화 상태일 수 있다. Windows에서 최소화된 창은
    // show()만으로 복원되지 않아 오버레이가 보이지 않는다. 기존 버튼 경로에는 no-op이다.
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    result
}
