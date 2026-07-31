// refresh token의 OS 보안 저장소 접근(ADR-002, docs/06 §6, docs/11 §3).
//
// 저장 대상은 refresh token 하나뿐이라 stronghold 같은 암호화 저장소는 과하다.
// Windows Credential Manager / macOS Keychain을 그대로 쓴다.
//
// shortcuts.rs와 같은 이유로 자체 command로 둔다 — generate_handler!에 등록한 command는
// permission 대상이 아니라서 capabilities에 한 줄도 추가하지 않는다. 저장소 플러그인을
// JS에서 직접 쓰면 그 권한을 통째로 열어야 한다(docs/11 §3 최소 capability 원칙).
//
// ⚠ 이 파일의 어떤 오류 문자열에도 토큰 값을 넣지 않는다(docs/11 §5). keyring이 돌려주는
// 오류에는 토큰이 들어 있지 않지만, 그래도 원문을 그대로 프론트에 넘기지 않고 요약한다.

use keyring::{Entry, Error as KeyringError};

/// 키체인 항목 식별자. 앱마다 고유해야 하므로 번들 식별자와 같은 값을 쓴다.
const SERVICE: &str = "app.standin.desktop";
/// 이 서비스 안에서 refresh token을 가리키는 이름.
const ACCOUNT: &str = "refresh_token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|_| "보안 저장소를 열 수 없습니다.".to_string())
}

/// 저장된 refresh token. 항목이 없으면 오류가 아니라 `None`이다(최초 실행·로그아웃 후).
#[tauri::command]
pub fn get_secure_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("보안 저장소에서 읽지 못했습니다.".to_string()),
    }
}

/// refresh token 저장. 같은 항목이 있으면 덮어쓴다(회전 토큰이라 매 갱신마다 호출된다).
#[tauri::command]
pub fn set_secure_token(token: String) -> Result<(), String> {
    entry()?
        .set_password(&token)
        .map_err(|_| "보안 저장소에 저장하지 못했습니다.".to_string())
}

/// 저장된 토큰 삭제. 이미 없으면 성공으로 본다 — 로그아웃은 멱등해야 한다.
#[tauri::command]
pub fn clear_secure_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("보안 저장소에서 삭제하지 못했습니다.".to_string()),
    }
}

// 실제 OS 키체인을 건드리는 테스트다. Windows Credential Manager와 macOS Keychain은
// 세션 데몬 없이도 동작하지만 Linux는 secret-service가 떠 있어야 하므로, 제품이 지원하는
// 두 플랫폼에서만 돌린다.
#[cfg(all(test, any(windows, target_os = "macos")))]
mod tests {
    use super::*;

    /// keyring 백엔드가 살아 있는지 확인한다. 이 왕복이 깨지면 세션 복원이 통째로 죽는다.
    #[test]
    fn roundtrip() {
        clear_secure_token().unwrap();
        assert_eq!(get_secure_token().unwrap(), None, "빈 상태는 None이어야 한다");
        set_secure_token("tok-abc".into()).unwrap();
        assert_eq!(get_secure_token().unwrap(), Some("tok-abc".into()));
        set_secure_token("tok-def".into()).unwrap();
        assert_eq!(get_secure_token().unwrap(), Some("tok-def".into()), "덮어쓰기");
        clear_secure_token().unwrap();
        assert_eq!(get_secure_token().unwrap(), None);
        clear_secure_token().unwrap(); // 멱등
    }
}
