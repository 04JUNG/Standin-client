// 이 빌드가 자동 업데이트를 실제로 쓸 수 있는지 알려주는 command(ADR-011).
//
// updater 플러그인의 설정(`plugins.updater`)은 pubkey가 필수 필드라서 값이 없으면
// 앱이 부팅에 실패한다. 그래서 base 설정에는 항상 자리를 두고, 실제 사용 여부는
// pubkey와 endpoints가 채워졌는지로 판단한다.
//
// 프론트가 이 값을 먼저 물어보는 이유는 CLAUDE.md §10이다. 피드가 없는 빌드
// (Standin Dev, 브라우저 개발 모드, 키를 넣기 전의 릴리스)에서 "업데이트 확인"
// 버튼을 보여주면 동작하지 않는 기능을 동작하는 것처럼 보이게 한다.

use tauri::AppHandle;

/// 업데이트 피드가 이 빌드에 설정돼 있는지.
///
/// pubkey와 endpoints 둘 다 있어야 true다. 어느 한쪽만 있으면 확인이 반드시
/// 실패하므로 설정되지 않은 것과 같게 취급한다.
#[tauri::command]
pub fn updates_configured(app: AppHandle) -> bool {
    let Some(config) = app.config().plugins.0.get("updater") else {
        return false;
    };

    let has_pubkey = config
        .get("pubkey")
        .and_then(|value| value.as_str())
        .is_some_and(|pubkey| !pubkey.trim().is_empty());

    let has_endpoint = config
        .get("endpoints")
        .and_then(|value| value.as_array())
        .is_some_and(|endpoints| !endpoints.is_empty());

    has_pubkey && has_endpoint
}
