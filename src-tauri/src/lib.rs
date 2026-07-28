// 네이티브 command는 작고 단일 책임으로 추가한다(CLAUDE.md §10).
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 데스크톱에서 딥링크(standin://)가 이미 실행 중인 앱으로 전달되도록 single-instance 필요.
    // 두 번째 실행에서 기존 창을 앞으로 가져온다 — 그러지 않으면 아무 반응이 없어
    // 앱이 고장 난 것처럼 보인다. 딥링크 전달은 플러그인의 deep-link feature가
    // 이 콜백과 무관하게 처리하므로 영향이 없다.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    // 전역 캡처 단축키(docs/07 §7). 등록 자체는 프론트가 저장된 accelerator로 호출한다.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Windows/Linux 개발 환경에선 런타임에 스킴을 등록해야 딥링크가 잡힌다.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture::grab_screen,
            commands::export::default_save_dir,
            commands::export::choose_save_folder,
            commands::export::save_pose_file,
            commands::export::reveal_in_folder,
            commands::shortcuts::register_capture_shortcut,
            commands::shortcuts::unregister_capture_shortcut,
            commands::shortcuts::focus_main_window,
            commands::window_mode::set_window_mode,
            commands::window_mode::get_window_position,
            commands::window_mode::set_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
