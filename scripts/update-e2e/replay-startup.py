"""Probe the exact previously timed-out signed binaries, without rebuilding them.

The old harness does not have a startup-only scenario. Its expected "unknown
scenario" assertion happens after the real startup hook completes. We explicitly
record that as startup readiness, never as a passed updater scenario.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(os.environ["STANDIN_E2E_ROOT"]).resolve()
EVIDENCE = Path("startup-replay-evidence").resolve()
ROOT.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(exist_ok=True)
EVENTS = ROOT / "events.jsonl"
RESULTS = []
COMPLETE = False
VERSIONS = {"a": "0.1.1-beta.9", "b": "0.1.1-beta.10"}


def run(args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"{args[0]}: {result.stdout}\n{result.stderr}")
    return result


def records():
    if not EVENTS.exists():
        return []
    result = []
    for line in EVENTS.read_text(encoding="utf8").splitlines():
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return result


def diagnose(label):
    processes = run(["ps", "-axo", "pid,ppid,state,etime,comm"]).stdout
    selected = [line for line in processes.splitlines()
                if "standin-desktop" in line or "WebKit" in line]
    (EVIDENCE / f"{label}-processes.txt").write_text("\n".join(selected), encoding="utf8")
    for line in selected:
        pid = line.split()[0]
        try:
            subprocess.run(
                ["sample", pid, "2", "1", "-file", str(EVIDENCE / f"{label}-{pid}-sample.txt")],
                capture_output=True, text=True, timeout=15,
            )
        except subprocess.TimeoutExpired:
            pass
    try:
        result = run([
            "/usr/bin/log", "show", "--last", "5m", "--style", "compact",
            "--predicate", 'process == "standin-desktop" OR process BEGINSWITH "com.apple.WebKit"',
        ])
        (EVIDENCE / f"{label}-system-log.txt").write_text(result.stdout, encoding="utf8")
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"System log diagnostic: {error}", flush=True)


try:
    (ROOT / "control.json").write_text(
        json.dumps({"scenario": "probe-startup", **VERSIONS}), encoding="utf8")
    for version in ("a", "b"):
        archive = next((Path("startup-replay-packages") / version).glob("*.app.tar.gz"))
        destination = ROOT / f"original-{version}"
        destination.mkdir(exist_ok=True)
        run(["tar", "-xzf", str(archive), "-C", str(destination)])
        app = next(destination.glob("*.app"))
        signature = run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)])
        (EVIDENCE / f"{version}-codesign.txt").write_text(
            signature.stdout + signature.stderr, encoding="utf8")
        binary = app / "Contents" / "MacOS" / "standin-desktop"
        binary_hash = hashlib.sha256(binary.read_bytes()).hexdigest()
        for iteration in range(50):
            label = f"{version}-{iteration:02d}"
            before = len(records())
            started = time.monotonic()
            sampled = False
            first_event = None
            ready = None
            with (EVIDENCE / f"{label}-process.txt").open("w", encoding="utf8") as log:
                process = subprocess.Popen([str(binary)], stdout=log, stderr=log)
                while time.monotonic() - started < 240:
                    matching = records()[before:]
                    if matching and first_event is None:
                        first_event = time.monotonic() - started
                    if not matching and not sampled and time.monotonic() - started > 20:
                        diagnose(label + "-early")
                        sampled = True
                    ready = next((r for r in matching if r["event"]["type"] == "failed"), None)
                    if ready:
                        assert ready["event"]["detail"] == "Error: Unknown scenario probe-startup", ready
                        assert ready["version"] == VERSIONS[version], ready
                        process.wait(timeout=30)
                        assert process.returncode == 0, process.returncode
                        RESULTS.append({
                            "version": ready["version"], "iteration": iteration, "pid": ready["pid"],
                            "binarySha256": binary_hash, "startupReady": True,
                            "firstEventSeconds": round(first_event, 3),
                            "durationSeconds": round(time.monotonic() - started, 3),
                            "terminalEvent": ready["event"],
                        })
                        print(f"READY {label}: {first_event:.3f}s", flush=True)
                        break
                    time.sleep(0.1)
                if not ready:
                    diagnose(label + "-timeout")
                    raise AssertionError(f"Startup timeout {label}; exit={process.poll()}")
    COMPLETE = True
finally:
    if EVENTS.exists():
        shutil.copyfile(EVENTS, EVIDENCE / "events.jsonl")
    (EVIDENCE / "results.json").write_text(json.dumps({
        "originalRun": 39422374014, "artifactId": 12265671389,
        "mode": "startup-only, offline, original unmodified native arm64 binaries",
        "allReady": COMPLETE and len(RESULTS) == 100, "startups": RESULTS,
    }, indent=2), encoding="utf8")
