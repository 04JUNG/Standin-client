use super::{err, LocalError, PROTOCOL};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
pub(super) fn launcher(app: &AppHandle) -> Result<PathBuf, LocalError> {
    // Overrides are development-only: packaged apps never execute a path from user preferences.
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("STANDIN_LOCAL_CONVERTER") {
        let p = PathBuf::from(path);
        if p.is_absolute() && p.is_file() {
            return Ok(p);
        }
    }
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| err("RUNTIME_UNAVAILABLE"))?;
    let name = if cfg!(windows) {
        "standin-local-converter.cmd"
    } else {
        "standin-local-converter"
    };
    let path = resources.join("local-converter").join(name);
    if path.is_file() {
        Ok(path)
    } else {
        Err(err("RUNTIME_UNAVAILABLE"))
    }
}
pub(super) struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    events: mpsc::Receiver<Result<Value, LocalError>>,
    sequence: u64,
}
/// One verified host per app-owned library. Blender jobs remain isolated children.
/// Never retry a mutating request after a transport error: its commit may have won.
#[derive(Default)]
pub(super) struct RuntimeCache {
    cached: Option<CachedRuntime>,
}
struct CachedRuntime {
    launcher: PathBuf,
    root: PathBuf,
    session: Session,
    hello: Value,
}
pub(super) struct RequestContext<'a> {
    pub app: Option<&'a AppHandle>,
    pub job: &'a str,
    pub cancel: &'a AtomicBool,
}
impl RuntimeCache {
    pub(super) fn clear(&mut self) {
        self.cached.take();
    }
    pub(super) fn with_session<T>(
        &mut self,
        launcher: &Path,
        root: &Path,
        context: RequestContext<'_>,
        work: impl FnOnce(&mut Session, &Value) -> Result<T, LocalError>,
    ) -> Result<T, LocalError> {
        if context.cancel.load(Ordering::SeqCst) {
            return Err(err("CANCELLED"));
        }
        let reusable = self.cached.as_mut().is_some_and(|cached| {
            cached.launcher == launcher
                && cached.root == root
                && cached.session.sequence < 9000
                && matches!(cached.session.child.try_wait(), Ok(None))
        });
        if !reusable {
            self.clear();
            let mut session = Session::start_from(launcher, root)?;
            let hello = session.request(
                context.app,
                context.job,
                context.cancel,
                json!({"action":"hello"}),
            )?;
            if hello["cameraContractVersion"] != "personal-camera/1"
                || hello["modelStorageVersion"] != "personal-fbx/1"
            {
                return Err(err("RUNTIME_MISMATCH"));
            }
            self.cached = Some(CachedRuntime {
                launcher: launcher.to_path_buf(),
                root: root.to_path_buf(),
                session,
                hello,
            });
        }
        let cached = self
            .cached
            .as_mut()
            .ok_or_else(|| err("RUNTIME_UNAVAILABLE"))?;
        let result = work(&mut cached.session, &cached.hello);
        // A cancelled/error session can still be cleaning up a child. Close it
        // before the next operation instead of reusing uncertain protocol state.
        if result.is_err() {
            self.clear();
        }
        result
    }
}
impl Session {
    pub(super) fn start_from(launcher: &Path, root: &Path) -> Result<Self, LocalError> {
        let mut command = Command::new(launcher);
        command
            .arg("--storage")
            .arg(root.join("worker"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(test)]
        if std::env::var_os("STANDIN_TEST_DIAGNOSTICS").is_some() {
            command.stderr(Stdio::inherit());
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command.spawn().map_err(|_| err("RUNTIME_UNAVAILABLE"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| err("RUNTIME_UNAVAILABLE"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| err("RUNTIME_UNAVAILABLE"))?;
        let (tx, events) = mpsc::sync_channel(32);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                // Bound malformed worker output before allocating an unlimited line.
                let result = (|| -> std::io::Result<usize> {
                    loop {
                        let buffer = reader.fill_buf()?;
                        if buffer.is_empty() {
                            return Ok(line.len());
                        }
                        let count = buffer
                            .iter()
                            .position(|b| *b == b'\n')
                            .map_or(buffer.len(), |i| i + 1)
                            .min(8 * 1024 * 1024 + 1 - line.len());
                        line.extend_from_slice(&buffer[..count]);
                        reader.consume(count);
                        if line.last() == Some(&b'\n') || line.len() > 8 * 1024 * 1024 {
                            return Ok(line.len());
                        }
                    }
                })();
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(_) if line.len() > 8 * 1024 * 1024 => {
                        let _ = tx.send(Err(err("LIMIT_EXCEEDED")));
                        break;
                    }
                    Ok(_) => {
                        if tx
                            .send(
                                serde_json::from_slice(&line).map_err(|_| err("PROTOCOL_MISMATCH")),
                            )
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
        });
        Ok(Self {
            child,
            stdin: Some(stdin),
            events,
            sequence: 0,
        })
    }
    fn send(&mut self, request: &Value) -> Result<(), LocalError> {
        let mut line = serde_json::to_vec(request).map_err(|_| err("INVALID_REQUEST"))?;
        line.push(b'\n');
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| err("CONVERSION_FAILED"))?;
        stdin
            .write_all(&line)
            .and_then(|_| stdin.flush())
            .map_err(|_| err("CONVERSION_FAILED"))
    }
    pub(super) fn request(
        &mut self,
        app: Option<&AppHandle>,
        job: &str,
        cancel: &AtomicBool,
        mut body: Value,
    ) -> Result<Value, LocalError> {
        self.sequence += 1;
        let request_id = format!("{}-{}", job, self.sequence);
        body["protocolVersion"] = json!(PROTOCOL);
        body["requestId"] = json!(request_id);
        self.send(&body)?;
        let started = Instant::now();
        let mut cancelled = None;
        loop {
            if cancel.load(Ordering::SeqCst) && cancelled.is_none() {
                self.send(&json!({"protocolVersion":PROTOCOL,"requestId":format!("cancel-{}",self.sequence),"action":"cancel","targetRequestId":request_id}))?;
                cancelled = Some(Instant::now());
            }
            if cancelled.is_some_and(|t: Instant| t.elapsed() > Duration::from_secs(3)) {
                return Err(err("CANCELLED"));
            }
            if started.elapsed() > Duration::from_secs(130) {
                return Err(err("TIMEOUT"));
            }
            let event = match self.events.recv_timeout(Duration::from_millis(100)) {
                Ok(e) => e?,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err(err("CONVERSION_FAILED")),
            };
            if event["protocolVersion"] != PROTOCOL {
                return Err(err("PROTOCOL_MISMATCH"));
            }
            if event["requestId"] != request_id {
                continue;
            }
            match event["event"].as_str() {
                Some("progress") => {
                    if let Some(app) = app {
                        let _ = app.emit("personal-body-progress", json!({"jobId":job,"stage":event["stage"],"progress":event["progress"]}));
                    }
                }
                Some("result") => {
                    if cancel.load(Ordering::SeqCst) {
                        return Err(err("CANCELLED"));
                    }
                    return Ok(event["result"].clone());
                }
                Some("error") => {
                    return Err(err(event["error"]["code"]
                        .as_str()
                        .unwrap_or("CONVERSION_FAILED")))
                }
                _ => return Err(err("PROTOCOL_MISMATCH")),
            }
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        // EOF tells the host to cancel its own (separate-session) Blender process and clean staging.
        self.stdin.take();
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        // Escalate only after graceful host cleanup has had time to finish.
        #[cfg(unix)]
        {
            let _ = Command::new("/bin/kill")
                .args(["-TERM", "--", &format!("-{}", self.child.id())])
                .status();
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &self.child.id().to_string(), "/T", "/F"])
                .status();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn retained_host_reuses_process_and_recovers_without_replaying_failed_requests() {
        use std::{fs, os::unix::fs::PermissionsExt};
        let root = std::env::temp_dir().join(format!("personal-runtime-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let launcher = root.join("fixture-runtime");
        fs::write(&launcher, r##"#!/usr/bin/env python3
import json, os, sys
for line in sys.stdin:
    r=json.loads(line)
    if r['action']=='die': sys.exit(0)
    event={'protocolVersion':'standin.local-converter/1','requestId':r['requestId'],'event':'result'}
    if r['action']=='fail': event.update(event='error',error={'code':'SOURCE_CHANGED'})
    else: event['result']={'cameraContractVersion':'personal-camera/1','modelStorageVersion':'personal-fbx/1','pid':os.getpid()}
    print(json.dumps(event),flush=True)
"##).unwrap();
        fs::set_permissions(&launcher, fs::Permissions::from_mode(0o755)).unwrap();
        let cancel = AtomicBool::new(false);
        let context = || RequestContext {
            app: None,
            job: "fixture",
            cancel: &cancel,
        };
        let mut runtime = RuntimeCache::default();
        let first = runtime
            .with_session(&launcher, &root, context(), |_, h| Ok(h["pid"].clone()))
            .unwrap();
        let second = runtime
            .with_session(&launcher, &root, context(), |s, _| {
                s.request(None, "fixture", &cancel, json!({"action":"inspect"}))
            })
            .unwrap();
        assert_eq!(first, second["pid"]);
        let failure = runtime.with_session(&launcher, &root, context(), |s, _| {
            s.request(None, "fixture", &cancel, json!({"action":"fail"}))
        });
        assert_eq!(failure.unwrap_err().code, "SOURCE_CHANGED");
        assert!(runtime.cached.is_none());
        let recovered = runtime
            .with_session(&launcher, &root, context(), |_, h| Ok(h["pid"].clone()))
            .unwrap();
        assert_ne!(first, recovered);
        let died = runtime.with_session(&launcher, &root, context(), |s, _| {
            s.request(None, "fixture", &cancel, json!({"action":"die"}))
        });
        assert_eq!(died.unwrap_err().code, "CONVERSION_FAILED");
        assert!(runtime.cached.is_none());
        let restarted = runtime
            .with_session(&launcher, &root, context(), |_, h| Ok(h["pid"].clone()))
            .unwrap();
        assert_ne!(recovered, restarted);
        let cancelled: Result<(), LocalError> =
            runtime.with_session(&launcher, &root, context(), |_, _| Err(err("CANCELLED")));
        assert_eq!(cancelled.unwrap_err().code, "CANCELLED");
        assert!(runtime.cached.is_none());
        let next_root = root.join("other-library");
        let pid = runtime
            .with_session(&launcher, &root, context(), |_, h| Ok(h["pid"].clone()))
            .unwrap();
        let other = runtime
            .with_session(
                &launcher,
                &next_root,
                context(),
                |_, h| Ok(h["pid"].clone()),
            )
            .unwrap();
        assert_ne!(pid, other);
        runtime.clear();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "Requires an actual pinned packaged runtime; measures native retained-host IPC"]
    fn real_packaged_runtime_reuse_timing() {
        let launcher =
            PathBuf::from(std::env::var("STANDIN_TEST_LAUNCHER").expect("packaged launcher"));
        let root =
            std::env::temp_dir().join(format!("personal-warm-runtime-{}", uuid::Uuid::new_v4()));
        let cancel = AtomicBool::new(false);
        let mut runtime = RuntimeCache::default();
        let context = || RequestContext {
            app: None,
            job: "timing",
            cancel: &cancel,
        };
        let started = Instant::now();
        runtime
            .with_session(&launcher, &root, context(), |_, _| Ok(()))
            .unwrap();
        let startup_ms = started.elapsed().as_secs_f64() * 1000.0;
        let pid = runtime.cached.as_ref().unwrap().session.child.id();
        let mut warm_ms = Vec::new();
        for _ in 0..3 {
            let started = Instant::now();
            runtime
                .with_session(&launcher, &root, context(), |session, _| {
                    session.request(None, "timing", &cancel, json!({"action":"hello"}))
                })
                .unwrap();
            warm_ms.push(started.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(runtime.cached.as_ref().unwrap().session.child.id(), pid);
        }
        let source = PathBuf::from(std::env::var("STANDIN_TEST_CS3C").expect("original CS3C"));
        let pose = PathBuf::from(std::env::var("STANDIN_TEST_BVH").expect("BVH"));
        let hash_file = |path: &Path| super::super::hash(&std::fs::read(path).unwrap());
        let started = Instant::now();
        let model = runtime.with_session(&launcher,&root,context(),|session,_| session.request(None,"timing",&cancel,json!({"action":"import","localModelId":"timed-model","sourcePath":source,"sourceHash":hash_file(&source)}))).unwrap();
        let registration_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(model["normalizedFormat"], "fbx");
        let request = json!({"action":"apply","localModelId":"timed-model","sourceHash":model["sourceHash"],"posePath":pose,"poseHash":hash_file(&pose),"selectionId":"timing","camera":{"version":"personal-camera/1","sourceBvhSha256":null,"rotation":null},"hands":{"left":null,"right":null}});
        let started = Instant::now();
        let applied = runtime
            .with_session(&launcher, &root, context(), |session, _| {
                session.request(None, "timing", &cancel, request.clone())
            })
            .unwrap();
        let apply_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let cached = runtime
            .with_session(&launcher, &root, context(), |session, _| {
                session.request(None, "timing", &cancel, request)
            })
            .unwrap();
        let cache_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(cached["cacheHit"], true);
        assert_eq!(cached["artifactHash"], applied["artifactHash"]);
        let destination = root.join("reviewed.fbx");
        let started = Instant::now();
        runtime.with_session(&launcher,&root,context(),|session,_|session.request(None,"timing",&cancel,json!({"action":"export","localModelId":"timed-model","snapshotHash":applied["snapshotHash"],"destinationPath":destination}))).unwrap();
        let export_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(hash_file(&destination), applied["artifactHash"]);
        assert_eq!(runtime.cached.as_ref().unwrap().session.child.id(), pid);
        let report = json!({"startupMs":startup_ms,"warmHelloMs":warm_ms,"registrationMs":registration_ms,"applyFromFbxMs":apply_ms,"cacheApplyMs":cache_ms,"exportMs":export_ms,"sameProcess":true,"workingFormat":"fbx","modelConversionIncluded":true,"networkAndUiIncluded":false});
        if let Ok(path) = std::env::var("STANDIN_TEST_RUNTIME_TIMING_REPORT") {
            std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
        }
        runtime.clear();
        std::fs::remove_dir_all(root).unwrap();
    }
}
