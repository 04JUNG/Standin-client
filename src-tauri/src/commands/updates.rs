//! Persist verified downloads across restarts; reverify cached bytes before install.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, path::PathBuf, time::Duration};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct UpdateRuntime(pub Mutex<Option<Update>>);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedUpdate {
    pub version: String,
    pub notes: Option<String>,
    signature: String,
    pub attempted: bool,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Availability {
    Disabled,
    UpToDate,
    Available {
        version: String,
        notes: Option<String>,
    },
}

#[derive(Clone, Serialize)]
pub struct Progress {
    ratio: Option<f64>,
}

#[tauri::command]
pub fn updates_configured(app: AppHandle) -> bool {
    configured(&app)
}

fn configured(app: &AppHandle) -> bool {
    let Some(config) = app.config().plugins.0.get("updater") else {
        return false;
    };
    config
        .get("pubkey")
        .and_then(|v| v.as_str())
        .is_some_and(|v| !v.trim().is_empty())
        && config
            .get("endpoints")
            .and_then(|v| v.as_array())
            .is_some_and(|v| !v.is_empty())
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("updates-v1"))
        .map_err(|e| e.to_string())
}

fn remove_cache(dir: &Path) -> Result<(), String> {
    // Fixed filenames only; never delete a directory supplied by the frontend.
    for name in [
        "pending.json",
        "package.bin",
        "pending.json.tmp",
        "package.bin.tmp",
    ] {
        match fs::remove_file(dir.join(name)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

fn read_cache(dir: &Path, current: &Version) -> Result<Option<CachedUpdate>, String> {
    let manifest = dir.join("pending.json");
    if !manifest.exists() {
        return Ok(None);
    }
    let cached = fs::read(&manifest)
        .ok()
        .filter(|bytes| bytes.len() <= 64 * 1024)
        .and_then(|bytes| serde_json::from_slice::<CachedUpdate>(&bytes).ok());
    match cached {
        Some(cached)
            if Version::parse(&cached.version).is_ok_and(|v| v > *current)
                && !cached.signature.is_empty()
                && dir.join("package.bin").is_file() =>
        {
            Ok(Some(cached))
        }
        _ => {
            remove_cache(dir)?;
            Ok(None)
        }
    }
}

pub(super) fn atomic_write(dir: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temporary = dir.join(format!("{name}.tmp"));
    let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(temporary, dir.join(name)).map_err(|e| e.to_string())
}

fn save_manifest(dir: &Path, cached: &CachedUpdate) -> Result<(), String> {
    atomic_write(
        dir,
        "pending.json",
        &serde_json::to_vec(cached).map_err(|e| e.to_string())?,
    )
}

fn verify(bytes: &[u8], signature: &str, key: &str) -> Result<(), String> {
    let decode = |value: &str| -> Result<String, String> {
        String::from_utf8(STANDARD.decode(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    };
    let result = (|| {
        let public = PublicKey::decode(&decode(key)?).map_err(|e| e.to_string())?;
        let signature = Signature::decode(&decode(signature)?).map_err(|e| e.to_string())?;
        public
            .verify(bytes, &signature, true)
            .map_err(|e| e.to_string())
    })();
    result.map_err(|e| format!("signature verification failed: {e}"))
}

async fn check_feed(app: &AppHandle) -> Result<Option<Update>, String> {
    if !configured(app) {
        return Err("이 빌드는 자동 업데이트를 사용하지 않습니다.".into());
    }
    let builder = app.updater_builder().timeout(Duration::from_secs(5));
    #[cfg(feature = "update-e2e")]
    let builder = crate::update_e2e::configure_client(builder, app)?;
    builder
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn updates_cached(
    app: AppHandle,
    state: State<'_, UpdateRuntime>,
) -> Result<Option<CachedUpdate>, String> {
    let _guard = state.0.lock().await;
    if !configured(&app) {
        return Ok(None);
    }
    read_cache(&cache_dir(&app)?, &app.package_info().version)
}

#[tauri::command]
pub async fn updates_check(
    app: AppHandle,
    state: State<'_, UpdateRuntime>,
) -> Result<Availability, String> {
    let mut pending = state.0.lock().await;
    if !configured(&app) {
        *pending = None;
        return Ok(Availability::Disabled);
    }
    *pending = check_feed(&app).await?;
    Ok(match pending.as_ref() {
        Some(update) => Availability::Available {
            version: update.version.clone(),
            notes: update.body.clone(),
        },
        None => {
            remove_cache(&cache_dir(&app)?)?;
            Availability::UpToDate
        }
    })
}

#[tauri::command]
pub async fn updates_download(
    app: AppHandle,
    state: State<'_, UpdateRuntime>,
    on_progress: Channel<Progress>,
) -> Result<CachedUpdate, String> {
    let pending = state.0.lock().await;
    let mut update = pending
        .as_ref()
        .ok_or("업데이트를 먼저 확인해 주세요.")?
        .clone();
    let dir = cache_dir(&app)?;
    if let Some(cached) = read_cache(&dir, &app.package_info().version)? {
        // Repeated checks must not re-enable auto-install after a failed attempt.
        if cached.version == update.version && cached.signature == update.signature {
            let key = app.config().plugins.0["updater"]["pubkey"]
                .as_str()
                .ok_or("업데이트 서명 키가 없습니다.")?;
            let bytes = fs::read(dir.join("package.bin")).map_err(|e| e.to_string())?;
            if verify(&bytes, &cached.signature, key).is_ok() {
                return Ok(cached);
            }
            // A damaged cache must be replaceable through "check for updates".
            remove_cache(&dir)?;
        }
    }
    update.timeout = Some(Duration::from_secs(300));
    let mut received = 0_u64;
    let bytes = update
        .download(
            |count, total| {
                received += count as u64;
                let ratio = total
                    .filter(|total| *total > 0)
                    .map(|total| (received as f64 / total as f64).min(1.0));
                let _ = on_progress.send(Progress { ratio });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let cached = CachedUpdate {
        version: update.version,
        notes: update.body,
        signature: update.signature,
        attempted: false,
    };
    let saved = cached.clone();
    tauri::async_runtime::spawn_blocking(move || {
        remove_cache(&dir)?;
        atomic_write(&dir, "package.bin", &bytes)?;
        // Publish metadata last. An interrupted download is never installable.
        save_manifest(&dir, &saved)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(cached)
}

#[tauri::command]
pub async fn updates_install(
    app: AppHandle,
    state: State<'_, UpdateRuntime>,
) -> Result<(), String> {
    let _guard = state.0.lock().await;
    let dir = cache_dir(&app)?;
    let mut cached = read_cache(&dir, &app.package_info().version)?
        .ok_or("설치할 업데이트가 없습니다. 다시 확인해 주세요.")?;
    // Reconfirm the release. Offline startup retains the current app and cache.
    let Some(update) = check_feed(&app).await? else {
        remove_cache(&dir)?;
        return Err("업데이트 배포가 변경되었습니다. 업데이트를 다시 확인해 주세요.".into());
    };
    if update.version != cached.version || update.signature != cached.signature {
        remove_cache(&dir)?;
        return Err("새 업데이트가 있습니다. 업데이트를 다시 확인해 주세요.".into());
    }
    let key = app.config().plugins.0["updater"]["pubkey"]
        .as_str()
        .ok_or("업데이트 서명 키가 없습니다.")?
        .to_owned();
    // Windows can terminate this process inside install().
    cached.attempted = true;
    save_manifest(&dir, &cached)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(dir.join("package.bin")).map_err(|e| e.to_string())?;
        verify(&bytes, &cached.signature, &key)?;
        update.install(bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!(
                "standin-updates-test-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn cached_download_survives_restart_and_preserves_failed_attempt() {
        let dir = fixture();
        atomic_write(&dir, "package.bin", b"installer").unwrap();
        let mut cached = CachedUpdate {
            version: "0.1.1-beta.10".into(),
            notes: None,
            signature: "signature".into(),
            attempted: false,
        };
        save_manifest(&dir, &cached).unwrap();
        let current = Version::parse("0.1.1-beta.9").unwrap();
        assert!(!read_cache(&dir, &current).unwrap().unwrap().attempted);
        cached.attempted = true;
        save_manifest(&dir, &cached).unwrap();
        assert!(read_cache(&dir, &current).unwrap().unwrap().attempted);
        assert!(read_cache(&dir, &Version::parse(&cached.version).unwrap())
            .unwrap()
            .is_none());
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn incomplete_or_corrupt_download_is_not_installable() {
        let dir = fixture();
        atomic_write(&dir, "package.bin", b"partial").unwrap();
        let current = Version::parse("1.0.0").unwrap();
        assert!(read_cache(&dir, &current).unwrap().is_none());
        atomic_write(&dir, "pending.json", b"{invalid").unwrap();
        assert!(read_cache(&dir, &current).unwrap().is_none());
        assert!(!dir.join("package.bin").exists());
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn refuses_unsigned_bytes() {
        assert!(verify(b"installer", "invalid", "invalid")
            .unwrap_err()
            .contains("signature"));
    }

    #[test]
    fn cached_bytes_are_reverified_after_disk_tampering() {
        // Public test vector from minisign-verify 0.2.5 (no private key).
        let key = STANDARD.encode(
            "untrusted comment: test key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3",
        );
        let signature = STANDARD.encode(concat!(
            "untrusted comment: signature from minisign secret key\n",
            "RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/",
            "z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\n",
            "trusted comment: timestamp:1556193335\tfile:test\n",
            "y/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==",
        ));
        assert!(verify(b"test", &signature, &key).is_ok());
        assert!(verify(b"Test", &signature, &key).is_err());
    }
}
