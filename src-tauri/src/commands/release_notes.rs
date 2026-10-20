//! Acknowledgement must survive immediate app exit, independently of WebView storage.
use semver::Version;
use std::{fs, path::Path, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct ReleaseNotesState(Mutex<()>);

fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("release-notes-v1"))
        .map_err(|error| error.to_string())
}

fn read_seen(dir: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(dir.join("seen-version")) {
        Ok(value) => Ok(Version::parse(value.trim())
            .ok()
            .map(|version| version.to_string())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn acknowledge(dir: &Path, current: &Version) -> Result<String, String> {
    if let Some(previous) = read_seen(dir)? {
        if Version::parse(&previous).is_ok_and(|version| version > *current) {
            return Ok(previous);
        }
    }
    let version = current.to_string();
    super::updates::atomic_write(dir, "seen-version", version.as_bytes())?;
    Ok(version)
}

#[tauri::command]
pub fn release_notes_seen(
    app: AppHandle,
    state: State<'_, ReleaseNotesState>,
) -> Result<Option<String>, String> {
    let _guard = state.0.lock().map_err(|error| error.to_string())?;
    read_seen(&directory(&app)?)
}

#[tauri::command]
pub fn release_notes_acknowledge(
    app: AppHandle,
    state: State<'_, ReleaseNotesState>,
) -> Result<String, String> {
    let _guard = state.0.lock().map_err(|error| error.to_string())?;
    // The frontend cannot acknowledge an arbitrary future version or choose a path.
    acknowledge(&directory(&app)?, &app.package_info().version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acknowledgement_is_durable_monotonic_and_recovers_corrupt_metadata() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!(
                "release-notes-test-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        assert_eq!(read_seen(&dir).unwrap(), None);
        let current = Version::parse("0.1.1-beta.10").unwrap();
        acknowledge(&dir, &current).unwrap();
        // Reopen from disk; no process-local state or WebView storage is involved.
        assert_eq!(read_seen(&dir).unwrap().as_deref(), Some("0.1.1-beta.10"));
        assert_eq!(
            acknowledge(&dir, &Version::parse("0.1.1-beta.9").unwrap()).unwrap(),
            "0.1.1-beta.10"
        );
        fs::write(dir.join("seen-version"), "corrupt").unwrap();
        assert_eq!(read_seen(&dir).unwrap(), None);
        acknowledge(&dir, &current).unwrap();
        assert_eq!(read_seen(&dir).unwrap().as_deref(), Some("0.1.1-beta.10"));
        fs::remove_file(dir.join("seen-version")).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
