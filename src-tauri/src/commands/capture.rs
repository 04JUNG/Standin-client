use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::io::Cursor;
use xcap::image::ImageFormat;
use xcap::Monitor;

/// 프리즈 프레임 결과. 프론트로 data URL과 물리 픽셀 크기를 전달한다(ADR-003).
#[derive(Serialize)]
pub struct ScreenFrame {
    #[serde(rename = "dataUrl")]
    data_url: String,
    width: u32,
    height: u32,
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

fn capture_primary() -> Result<ScreenFrame, CaptureError> {
    let monitors =
        Monitor::all().map_err(|e| CaptureError::new("CAPTURE_FAILED", e.to_string()))?;
    if monitors.is_empty() {
        return Err(CaptureError::new("UNSUPPORTED", "사용 가능한 모니터가 없습니다."));
    }

    // 주 모니터 우선, 없으면 첫 모니터(MVP는 단일 모니터, docs/07 §12).
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .unwrap_or(&monitors[0]);

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
    })
}

/// 전체 화면을 캡처해 프리즈 프레임으로 반환한다.
/// 앱 창을 잠시 숨겨 캡처에 포함되지 않게 한다. 취소는 프론트(Escape)에서 처리한다.
#[tauri::command]
pub async fn grab_screen(window: tauri::Window) -> Result<ScreenFrame, CaptureError> {
    // 창 숨김은 메인 스레드 이벤트 루프에서 처리되어야 하므로,
    // 캡처는 blocking 풀에서 짧은 지연 뒤 수행한다.
    let _ = window.hide();

    let result = tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(200));
        capture_primary()
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
