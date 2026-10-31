use serde::Serialize;
use std::sync::OnceLock;
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySession {
    app_session_id: String,
    started_at: u64,
}
#[tauri::command]
pub fn replay_session() -> ReplaySession {
    static SESSION: OnceLock<ReplaySession> = OnceLock::new();
    SESSION
        .get_or_init(|| ReplaySession {
            app_session_id: uuid::Uuid::new_v4().to_string(),
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        })
        .clone()
}
