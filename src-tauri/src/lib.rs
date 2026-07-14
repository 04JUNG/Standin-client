// 네이티브 command는 작고 단일 책임으로 추가한다(CLAUDE.md §10).
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::capture::grab_screen])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
