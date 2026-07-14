// 네이티브 command는 작고 단일 책임으로 추가한다(CLAUDE.md §10).
// capture/files/shortcuts/storage command는 후속 브랜치에서 commands/ 모듈로 붙인다.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
