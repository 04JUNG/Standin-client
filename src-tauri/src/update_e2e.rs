//! Test-only bridge. This module and its pinned TLS root are absent from normal builds.
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf, sync::Mutex, time::SystemTime};
use tauri::{AppHandle, Manager};

const IDENTIFIER: &str = "app.standin.desktop.update-e2e";
static TRACE_LOCK: Mutex<()> = Mutex::new(());

// This starts before the WebView exists, so a missing frontend event can be
// distinguished from a blocked plugin, AppKit startup, or page/module load.
pub fn trace(stage: &str) {
    if option_env!("STANDIN_KEYRING_SERVICE") != Some(IDENTIFIER) {
        return;
    }
    let Ok(_guard) = TRACE_LOCK.lock() else {
        return;
    };
    let record = json!({
        "stage": stage,
        "pid": std::process::id(),
        "version": env!("CARGO_PKG_VERSION"),
        "architecture": std::env::consts::ARCH,
        "unixMs": SystemTime::now().duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default().as_millis(),
    });
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(PathBuf::from(env!("STANDIN_E2E_ROOT")).join("native-startup.jsonl"))
    {
        let _ = writeln!(file, "{record}");
        let _ = file.sync_all();
    }
}

pub fn probe(name: &'static str) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new(name)
        .setup(move |_, _| {
            trace(name);
            Ok(())
        })
        .build()
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    if app.config().identifier != IDENTIFIER
        || option_env!("STANDIN_KEYRING_SERVICE") != Some(IDENTIFIER)
    {
        return Err("E2E builds require an isolated identifier and credential service".into());
    }
    Ok(PathBuf::from(env!("STANDIN_E2E_ROOT")))
}

pub fn configure_client(
    builder: tauri_plugin_updater::UpdaterBuilder,
    app: &AppHandle,
) -> Result<tauri_plugin_updater::UpdaterBuilder, String> {
    root(app)?;
    let certificate = reqwest::Certificate::from_pem(include_bytes!(env!("STANDIN_E2E_CA")))
        .map_err(|e| e.to_string())?;
    // Trust exactly the ephemeral test server's certificate, without disabling TLS
    // validation or changing the operating system's trust store.
    Ok(builder.configure_client(move |client| client.add_root_certificate(certificate.clone())))
}

#[tauri::command]
fn e2e_control(app: AppHandle) -> Result<Value, String> {
    trace("control-ipc");
    let value = fs::read(root(&app)?.join("control.json")).map_err(|e| e.to_string())?;
    serde_json::from_slice(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn e2e_report(app: AppHandle, event: Value) -> Result<(), String> {
    let record = json!({
        "version": app.package_info().version.to_string(),
        "pid": std::process::id(),
        "architecture": std::env::consts::ARCH,
        "executable": std::env::current_exe().map_err(|e| e.to_string())?,
        "cacheDir": app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("updates-v1"),
        "event": event,
    });
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root(&app)?.join("events.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(file, "{record}").map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
fn e2e_exit(app: AppHandle) -> Result<(), String> {
    root(&app)?;
    trace("exit-request");
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn e2e_trace(app: AppHandle, stage: String) -> Result<(), String> {
    root(&app)?;
    trace(&stage);
    Ok(())
}

pub fn handle(invoke: tauri::ipc::Invoke) -> bool {
    let handler: fn(tauri::ipc::Invoke) -> bool =
        tauri::generate_handler![e2e_control, e2e_report, e2e_exit, e2e_trace];
    handler(invoke)
}
