// 네이티브 command는 작고 단일 책임으로 추가한다(CLAUDE.md §10).
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 데스크톱에서 딥링크(standin://)가 이미 실행 중인 앱으로 전달되도록 single-instance 필요.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            // Windows/Linux 개발 환경에선 런타임에 스킴을 등록해야 딥링크가 잡힌다.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::capture::grab_screen])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
