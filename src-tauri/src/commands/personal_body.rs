//! Device-only model library. Renderer never chooses worker executables or arbitrary cache paths.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
const PROTOCOL: &str = "standin.local-converter/1";
mod storage;
mod worker;
pub use storage::Card;
use storage::*;
use worker::{launcher, Session};
#[cfg(test)]
mod tests;
const SOURCE_LIMIT: u64 = 128 * 1024 * 1024;
#[derive(Debug, Serialize)]
pub struct LocalError {
    code: String,
}
fn err(code: &str) -> LocalError {
    LocalError { code: code.into() }
}
fn io<T>(r: std::io::Result<T>) -> Result<T, LocalError> {
    r.map_err(|_| err("STORAGE_FAILED"))
}
#[derive(Default)]
pub struct PersonalBodyState {
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    operation: Mutex<()>,
}
fn sweep(root: &Path) -> Result<(), LocalError> {
    let referenced: std::collections::HashSet<String> = cards(root)?
        .into_iter()
        .map(|c| c.worker_model_id)
        .collect();
    for (folder, orphan_models) in [
        (root.join("staging"), false),
        (root.join("worker/models"), true),
    ] {
        if !folder.is_dir() {
            continue;
        }
        for entry in io(fs::read_dir(folder))? {
            let entry = io(entry)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if !valid_id(&name) || (orphan_models && referenced.contains(&name)) {
                continue;
            }
            let path = entry.path();
            let metadata = io(fs::symlink_metadata(&path))?;
            if metadata.file_type().is_dir() {
                io(fs::remove_dir_all(path))?;
            } else {
                io(fs::remove_file(path))?;
            }
        }
    }
    Ok(())
}
fn operation<T>(
    app: &AppHandle,
    job: &str,
    work: impl FnOnce(&Path, &AtomicBool) -> Result<T, LocalError>,
) -> Result<T, LocalError> {
    if !valid_id(job) {
        return Err(err("INVALID_REQUEST"));
    }
    let state = app.state::<PersonalBodyState>();
    let _guard = state.operation.lock().map_err(|_| err("BUSY"))?;
    let cancel = state
        .jobs
        .lock()
        .map_err(|_| err("BUSY"))?
        .entry(job.into())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone();
    let result = if cancel.load(Ordering::SeqCst) {
        Err(err("CANCELLED"))
    } else {
        root(app).and_then(|root| {
            sweep(&root)?;
            let result = work(&root, &cancel);
            let cleanup = sweep(&root);
            match result {
                Ok(value) => {
                    cleanup?;
                    Ok(value)
                }
                Err(error) => Err(error),
            }
        })
    };
    if let Ok(mut jobs) = state.jobs.lock() {
        jobs.remove(job);
    }
    result
}
#[tauri::command]
pub async fn personal_body_capabilities(app: AppHandle) -> Result<Value, LocalError> {
    tauri::async_runtime::spawn_blocking(move || {
        if launcher(&app).is_err() {
            return Ok(json!({"available":false,"formats":[],"reason":"RUNTIME_UNAVAILABLE"}));
        }
        let root = root(&app)?;
        let mut session = Session::start(&app, &root.join("capability"))?;
        let hello = session.request(
            Some(&app),
            "capability",
            &AtomicBool::new(false),
            json!({"action":"hello"}),
        )?;
        let formats: Vec<&str> = ["fbx", "cs3c"]
            .into_iter()
            .filter(|f| hello["formats"][*f] == true)
            .collect();
        Ok(json!({"available":!formats.is_empty(),"formats":formats}))
    })
    .await
    .map_err(|_| err("CONVERSION_FAILED"))?
}
#[tauri::command]
pub async fn personal_body_list(app: AppHandle) -> Result<Vec<Card>, LocalError> {
    tauri::async_runtime::spawn_blocking(move || cards(&root(&app)?))
        .await
        .map_err(|_| err("STORAGE_FAILED"))?
}
#[tauri::command]
pub fn personal_body_cancel(
    job_id: String,
    state: State<PersonalBodyState>,
) -> Result<(), LocalError> {
    if !valid_id(&job_id) {
        return Err(err("INVALID_REQUEST"));
    }
    let mut jobs = state.jobs.lock().map_err(|_| err("BUSY"))?;
    if jobs.len() >= 16 && !jobs.contains_key(&job_id) {
        return Err(err("BUSY"));
    }
    jobs.entry(job_id)
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .store(true, Ordering::SeqCst);
    Ok(())
}
fn clean_name(name: &str) -> Result<String, LocalError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        Err(err("INVALID_REQUEST"))
    } else {
        Ok(name.into())
    }
}
#[tauri::command]
pub async fn personal_body_import(
    app: AppHandle,
    job_id: String,
    name: String,
    replace_id: Option<String>,
) -> Result<Option<Card>, LocalError> {
    let name = clean_name(&name)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("체형 파일 선택")
        .add_filter("FBX · CS3C", &["fbx", "cs3c"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let picked = rx.await.map_err(|_| err("CANCELLED"))?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let source = picked.into_path().map_err(|_| err("UNSUPPORTED_FORMAT"))?;
    tauri::async_runtime::spawn_blocking(move || {
        operation(&app, &job_id, |root, cancel| {
            import_source(
                &app,
                root,
                &job_id,
                &source,
                &name,
                replace_id.as_deref(),
                cancel,
            )
        })
    })
    .await
    .map_err(|_| err("CONVERSION_FAILED"))?
}

fn import_source(
    app: &AppHandle,
    root: &Path,
    job: &str,
    source: &Path,
    name: &str,
    replace_id: Option<&str>,
    cancel: &AtomicBool,
) -> Result<Option<Card>, LocalError> {
    let format = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if format != "fbx" && format != "cs3c" {
        return Err(err("UNSUPPORTED_FORMAT"));
    }
    if io(fs::metadata(source))?.len() > SOURCE_LIMIT {
        return Err(err("LIMIT_EXCEEDED"));
    }
    let mut bytes = Vec::new();
    io(io(fs::File::open(source))?
        .take(SOURCE_LIMIT + 1)
        .read_to_end(&mut bytes))?;
    if bytes.len() as u64 > SOURCE_LIMIT {
        return Err(err("LIMIT_EXCEEDED"));
    }
    let source_hash = hash(&bytes);
    let mut session = Session::start(app, root)?;
    let hello = session.request(Some(app), job, cancel, json!({"action":"hello"}))?;
    let existing = cards(root)?;
    if let Some(duplicate) = existing.iter().find(|c| {
        c.source_hash == source_hash
            && hello["versions"]["importerVersion"] == c.importer_version
            && hello["versions"]["normalizationVersion"] == c.normalization_version
            && hello["versions"]["rigMappingVersion"] == c.rig_mapping_version
            && hello["versions"]["converterVersion"] == c.converter_version
            && hello["versions"]["converterFingerprint"] == c.converter_fingerprint
    }) {
        return Ok(Some(duplicate.clone()));
    }
    let previous = replace_id.map(|id| card(root, id)).transpose()?;
    let stage = root.join("staging").join(job);
    io(fs::create_dir_all(&stage))?;
    let result = (|| {
        let staged_source = stage.join(format!("source.{format}"));
        io(fs::write(&staged_source, bytes))?;
        let manifest = session.request(
            Some(app),
            job,
            cancel,
            json!({
                "action":"import", "localModelId":job,
                "sourcePath":staged_source, "sourceHash":source_hash,
            }),
        )?;
        if manifest["sourceHash"] != source_hash
            || manifest["localModelId"] != job
            || manifest["capabilities"]["bodyPose"] != true
        {
            return Err(err("UNSUPPORTED_MODEL"));
        }
        let version = |key: &str| {
            manifest["versions"][key]
                .as_str()
                .map(String::from)
                .ok_or_else(|| err("PROTOCOL_MISMATCH"))
        };
        let record = Card {
            local_model_id: previous
                .as_ref()
                .map_or_else(|| job.to_string(), |c| c.local_model_id.clone()),
            name: previous
                .as_ref()
                .map_or_else(|| name.to_string(), |c| c.name.clone()),
            source_hash,
            format,
            version: previous.as_ref().map_or(1, |c| c.version + 1),
            importer_version: version("importerVersion")?,
            normalization_version: version("normalizationVersion")?,
            rig_mapping_version: version("rigMappingVersion")?,
            converter_version: version("converterVersion")?,
            converter_fingerprint: version("converterFingerprint")?,
            created_at: previous.as_ref().map_or(now(), |c| c.created_at),
            updated_at: now(),
            capabilities: json!({"bodyPose":true,
                "leftHand":manifest["capabilities"]["hands"]["left"]["supported"] == true,
                "rightHand":manifest["capabilities"]["hands"]["right"]["supported"] == true}),
            worker_model_id: job.to_string(),
        };
        if cancel.load(Ordering::SeqCst) {
            return Err(err("CANCELLED"));
        }
        save_card(root, &record)?;
        if let Some(old) = previous {
            let _ = session.request(
                Some(app),
                job,
                &AtomicBool::new(false),
                json!({
                    "action":"delete", "localModelId":old.worker_model_id,
                }),
            );
        }
        Ok(Some(record))
    })();
    let _ = fs::remove_dir_all(stage);
    result
}

#[tauri::command]
pub async fn personal_body_rename(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<(), LocalError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<PersonalBodyState>();
        let _guard = state.operation.try_lock().map_err(|_| err("BUSY"))?;
        let root = root(&app)?;
        let mut model = card(&root, &id)?;
        model.name = clean_name(&name)?;
        model.updated_at = now();
        save_card(&root, &model)
    })
    .await
    .map_err(|_| err("STORAGE_FAILED"))?
}
#[tauri::command]
pub async fn personal_body_delete(app: AppHandle, id: String) -> Result<(), LocalError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<PersonalBodyState>();
        let _guard = state.operation.try_lock().map_err(|_| err("BUSY"))?;
        let root = root(&app)?;
        let model = card(&root, &id)?;
        // Removal works even when a runtime update is unavailable. This is a fixed app-owned
        // schema path; the source selected by the user and exported files are never touched.
        let cached = root
            .join("worker")
            .join("models")
            .join(&model.worker_model_id);
        if cached.exists() {
            io(fs::remove_dir_all(cached))?;
        }
        io(fs::remove_file(
            root.join("cards").join(format!("{id}.json")),
        ))
    })
    .await
    .map_err(|_| err("STORAGE_FAILED"))?
}
#[tauri::command]
pub async fn personal_body_apply(
    app: AppHandle,
    job_id: String,
    id: String,
    source_hash: String,
    pose_base64: String,
    pose_hash: String,
    selection_id: String,
) -> Result<Value, LocalError> {
    tauri::async_runtime::spawn_blocking(move || operation(&app,&job_id,|root,cancel| {
        if !valid_hash(&pose_hash) || !valid_hash(&source_hash) || !valid_id(&selection_id) || pose_base64.len() > 12 * 1024 * 1024 { return Err(err("INVALID_REQUEST")); }
        let model = card(root,&id)?; if model.source_hash != source_hash { return Err(err("STALE_RESULT")); }
        let bytes = BASE64.decode(pose_base64).map_err(|_|err("INVALID_REQUEST"))?;
        if bytes.len() > 8*1024*1024 || hash(&bytes) != pose_hash { return Err(err("STALE_RESULT")); }
        let stage = root.join("staging").join(&job_id);io(fs::create_dir_all(&stage))?;
        let result=(|| {
            let pose_path=stage.join("pose.bvh");io(fs::write(&pose_path,bytes))?;
            let mut session=Session::start(&app,root)?;
            let applied=session.request(Some(&app),&job_id,cancel,json!({"action":"apply","localModelId":model.worker_model_id,"sourceHash":source_hash,"posePath":pose_path,"poseHash":pose_hash,"selectionId":selection_id,"hands":{"left":null,"right":null}}))?;
            if applied["localModelId"] != model.worker_model_id || applied["snapshot"]["sourceHash"] != source_hash || applied["snapshot"]["poseHash"] != pose_hash { return Err(err("SNAPSHOT_MISMATCH")); }
            let snapshot=applied["snapshotHash"].as_str().filter(|s|valid_hash(s)).ok_or_else(||err("SNAPSHOT_MISMATCH"))?;
            let destination=stage.join("output.fbx");
            let exported=session.request(Some(&app),&job_id,cancel,json!({"action":"export","localModelId":model.worker_model_id,"snapshotHash":snapshot,"destinationPath":destination}))?;
            if exported["snapshotHash"] != snapshot || exported["artifactHash"] != applied["artifactHash"] { return Err(err("SNAPSHOT_MISMATCH")); }
            if io(fs::metadata(&destination))?.len() > 256*1024*1024 { return Err(err("LIMIT_EXCEEDED")); }
            let fbx=io(fs::read(&destination))?;
            if Some(hash(&fbx).as_str()) != exported["artifactHash"].as_str() { return Err(err("SNAPSHOT_MISMATCH")); }
            if cancel.load(Ordering::SeqCst) {return Err(err("CANCELLED"));}
            Ok(json!({"snapshotHash":snapshot,"artifactHash":exported["artifactHash"],"contentBase64":BASE64.encode(fbx)}))
        })();let _=fs::remove_dir_all(stage);result
    })).await.map_err(|_|err("CONVERSION_FAILED"))?
}

/// Read only the hash-verified, embedded-resource preview of a registered model.
#[tauri::command]
pub async fn personal_body_preview(
    app: AppHandle,
    id: String,
    source_hash: String,
) -> Result<String, LocalError> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = root(&app)?;
        let record = card(&root, &id)?;
        if record.source_hash != source_hash {
            return Err(err("STALE_RESULT"));
        }
        let folder = root.join("worker/models").join(record.worker_model_id);
        let manifest: Value = serde_json::from_slice(&io(fs::read(folder.join("manifest.json")))?)
            .map_err(|_| err("STORAGE_FAILED"))?;
        let expected = manifest["previewHash"]
            .as_str()
            .filter(|s| valid_hash(s))
            .ok_or_else(|| err("PREVIEW_UNAVAILABLE"))?;
        let path = folder.join("preview.glb");
        if io(fs::metadata(&path))?.len() > 32 * 1024 * 1024 {
            return Err(err("LIMIT_EXCEEDED"));
        }
        let bytes = io(fs::read(path))?;
        if hash(&bytes) != expected {
            return Err(err("STALE_RESULT"));
        }
        Ok(BASE64.encode(bytes))
    })
    .await
    .map_err(|_| err("STORAGE_FAILED"))?
}
