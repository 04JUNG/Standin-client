use super::{err, io, LocalError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub(super) local_model_id: String,
    pub(super) name: String,
    pub(super) source_hash: String,
    pub(super) format: String,
    pub(super) version: u64,
    pub(super) importer_version: String,
    pub(super) normalization_version: String,
    pub(super) rig_mapping_version: String,
    pub(super) converter_version: String,
    #[serde(default)]
    pub(super) converter_fingerprint: String,
    pub(super) created_at: u64,
    pub(super) updated_at: u64,
    pub(super) capabilities: Value,
    #[serde(skip_serializing)]
    #[serde(default)]
    pub(super) worker_model_id: String,
}
// Private disk format retains worker identity while public responses omit it.
pub(super) fn save_card(root: &Path, card: &Card) -> Result<(), LocalError> {
    let mut data = serde_json::to_value(card).map_err(|_| err("STORAGE_FAILED"))?;
    data["workerModelId"] = json!(card.worker_model_id);
    let path = root
        .join("cards")
        .join(format!("{}.json", card.local_model_id));
    let temp = path.with_extension("pending");
    io(fs::write(
        &temp,
        serde_json::to_vec(&data).map_err(|_| err("STORAGE_FAILED"))?,
    ))?;
    #[cfg(windows)]
    {
        // ReplaceFile semantics through rename are not available in std on Windows.
        let backup = path.with_extension("backup");
        if path.exists() {
            io(fs::rename(&path, &backup))?;
        }
        if let Err(e) = fs::rename(&temp, &path) {
            let _ = fs::rename(&backup, &path);
            return Err(err(if e.kind() == std::io::ErrorKind::PermissionDenied {
                "STORAGE_FAILED"
            } else {
                "IO_ERROR"
            }));
        }
        let _ = fs::remove_file(backup);
    }
    #[cfg(not(windows))]
    io(fs::rename(temp, path))?;
    Ok(())
}
pub(super) fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}
pub(super) fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(super) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub(super) fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(super) fn root(app: &AppHandle) -> Result<PathBuf, LocalError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| err("STORAGE_FAILED"))?
        .join("personal-body-v1");
    io(fs::create_dir_all(root.join("cards")))?;
    io(fs::create_dir_all(root.join("staging")))?;
    Ok(root)
}
pub(super) fn cards(root: &Path) -> Result<Vec<Card>, LocalError> {
    let mut cards = vec![];
    for entry in io(fs::read_dir(root.join("cards")))? {
        let path = io(entry)?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let card: Card =
            serde_json::from_slice(&io(fs::read(path))?).map_err(|_| err("STORAGE_FAILED"))?;
        if !valid_id(&card.local_model_id) || !valid_id(&card.worker_model_id) {
            return Err(err("STORAGE_FAILED"));
        }
        cards.push(card);
    }
    cards.sort_by_key(|c| c.created_at);
    Ok(cards)
}
pub(super) fn card(root: &Path, id: &str) -> Result<Card, LocalError> {
    cards(root)?
        .into_iter()
        .find(|c| c.local_model_id == id)
        .ok_or_else(|| err("MODEL_NOT_FOUND"))
}
