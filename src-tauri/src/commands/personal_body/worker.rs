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
impl Session {
    pub(super) fn start(app: &AppHandle, root: &Path) -> Result<Self, LocalError> {
        Self::start_from(&launcher(app)?, root)
    }
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
