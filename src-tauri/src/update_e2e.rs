//! Test-only bridge. This module and its pinned TLS root are absent from normal builds.
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf};
use tauri::{AppHandle, Manager};

const IDENTIFIER: &str = "app.standin.desktop.update-e2e";

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
    let value = fs::read(root(&app)?.join("control.json")).map_err(|e| e.to_string())?;
    serde_json::from_slice(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn e2e_report(app: AppHandle, event: Value) -> Result<(), String> {
    let record = json!({
        "version": app.package_info().version.to_string(),
        "pid": std::process::id(),
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
    app.exit(0);
    Ok(())
}

pub fn handle(invoke: tauri::ipc::Invoke) -> bool {
    let handler: fn(tauri::ipc::Invoke) -> bool =
        tauri::generate_handler![e2e_control, e2e_report, e2e_exit];
    handler(invoke)
}
