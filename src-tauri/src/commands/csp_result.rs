use super::screen_permission;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::io::Cursor;
use xcap::{image::ImageFormat, Window};
#[derive(Serialize)]
pub struct CspError {
    code: &'static str,
}
fn error(code: &'static str) -> CspError {
    CspError { code }
}
fn is_csp(window: &Window) -> bool {
    let name = window.app_name().unwrap_or_default().to_lowercase();
    name.contains("clip studio paint") || name == "clipstudiopaint" || name == "clipstudiopaint.exe"
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CspWindow {
    id: u32,
    label: String,
    minimized: bool,
}
#[tauri::command]
pub async fn list_csp_windows() -> Result<Vec<CspWindow>, CspError> {
    tauri::async_runtime::spawn_blocking(|| {
        let windows = Window::all().map_err(|_| error("UNSUPPORTED"))?;
        Ok(windows
            .into_iter()
            .filter(is_csp)
            .filter_map(|w| {
                Some(CspWindow {
                    id: w.id().ok()?,
                    label: w.title().unwrap_or_else(|_| "CLIP STUDIO PAINT".into()),
                    minimized: w.is_minimized().unwrap_or(true),
                })
            })
            .collect())
    })
    .await
    .map_err(|_| error("UNSUPPORTED"))?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CspFrame {
    data_url: String,
    width: u32,
    height: u32,
}
/// Only an explicitly selected CSP window. No monitor/desktop fallback and no inference of import.
#[tauri::command]
pub async fn capture_csp_result(window_id: u32) -> Result<CspFrame, CspError> {
    tauri::async_runtime::spawn_blocking(move || {
        if !screen_permission::ensure_screen_access() {
            return Err(error("PERMISSION_DENIED"));
        }
        let window = Window::all()
            .map_err(|_| error("UNSUPPORTED"))?
            .into_iter()
            .find(|w| w.id().ok() == Some(window_id) && is_csp(w))
            .ok_or_else(|| error("TARGET_CLOSED"))?;
        if window.is_minimized().unwrap_or(true) {
            return Err(error("TARGET_MINIMIZED"));
        }
        let image = window
            .capture_image()
            .map_err(|_| error("CAPTURE_FAILED"))?;
        let (width, height) = image.dimensions();
        if width < 32 || height < 32 {
            return Err(error("EMPTY_FRAME"));
        }
        let mut minimum = 255u8;
        let mut maximum = 0u8;
        for pixel in image.pixels().step_by(97) {
            if pixel[3] > 0 {
                for channel in &pixel.0[..3] {
                    minimum = minimum.min(*channel);
                    maximum = maximum.max(*channel);
                }
            }
        }
        if maximum.saturating_sub(minimum) < 3 {
            return Err(error("EMPTY_FRAME"));
        }
        let mut bytes = Cursor::new(Vec::new());
        image
            .write_to(&mut bytes, ImageFormat::Png)
            .map_err(|_| error("CAPTURE_FAILED"))?;
        if bytes.get_ref().len() > 8 * 1024 * 1024 {
            return Err(error("FRAME_TOO_LARGE"));
        }
        Ok(CspFrame {
            data_url: format!("data:image/png;base64,{}", STANDARD.encode(bytes.get_ref())),
            width,
            height,
        })
    })
    .await
    .map_err(|_| error("CAPTURE_FAILED"))?
}
