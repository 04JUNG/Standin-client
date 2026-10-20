"""Exercise installed, OS-signed Tauri apps against an isolated HTTPS updater."""
import base64
import hashlib
import http.server
import json
import os
import pathlib
import platform
import shutil
import ssl
import subprocess
import threading
import time

ROOT = pathlib.Path(os.environ["STANDIN_E2E_ROOT"]).resolve()
VERSIONS = json.loads((ROOT / "versions.json").read_text())
WINDOWS = platform.system() == "Windows"
TARGET = os.environ["E2E_PLATFORM"]
EVENTS = ROOT / "events.jsonl"
EVIDENCE = ROOT / "evidence"
EVIDENCE.mkdir(exist_ok=True)
RESULTS = []
STARTUPS = []
PACKAGES = []
REPETITIONS = int(os.environ.get("E2E_STARTUP_REPETITIONS", "0"))
ALL_PASSED = False
SERVER = None
FEED_MODE = "valid"


def run(args, retry_codes=(), **kwargs):
    backoff = [3, 10, 20, 40]
    for attempt in range(len(backoff) + 1):
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode not in retry_codes or attempt == len(backoff):
            break
        print(f"Transient {args[0]} error {result.returncode}; retrying", flush=True)
        time.sleep(backoff[attempt])
    if result.returncode:
        raise RuntimeError(
            f"{args[0]} failed ({result.returncode}):\n{result.stdout}\n{result.stderr}"
        )
    return result


def one(folder, pattern):
    matches = list(folder.glob(pattern))
    if len(matches) != 1:
        raise AssertionError(f"Expected one {pattern} in {folder}, got {matches}")
    return matches[0]


PACKAGE = one(ROOT / "packages" / "b", "*.exe" if WINDOWS else "*.app.tar.gz")
SIGNATURE = pathlib.Path(str(PACKAGE) + ".sig").read_text().strip()
signature_lines = base64.b64decode(SIGNATURE).decode().splitlines()
signature_bytes = bytearray(base64.b64decode(signature_lines[1]))
signature_bytes[-1] ^= 1
signature_lines[1] = base64.b64encode(signature_bytes).decode()
BAD_SIGNATURE = base64.b64encode(("\n".join(signature_lines) + "\n").encode()).decode()


class Feed(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/latest.json":
            body = json.dumps({
                "version": VERSIONS["b"],
                "notes": "Isolated signed updater test",
                "platforms": {TARGET: {
                    "signature": SIGNATURE if FEED_MODE == "valid" else BAD_SIGNATURE,
                    "url": "https://127.0.0.1:17443/package",
                }},
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/package":
            self.send_response(200)
            self.send_header("Content-Length", str(PACKAGE.stat().st_size))
            self.end_headers()
            with PACKAGE.open("rb") as package:
                shutil.copyfileobj(package, self.wfile)
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):
        with (EVIDENCE / "https-requests.txt").open("a", encoding="utf8") as log:
            log.write((fmt % args) + "\n")


def start_server():
    global SERVER
    SERVER = http.server.ThreadingHTTPServer(("127.0.0.1", 17443), Feed)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(ROOT / "tls.crt", ROOT / "tls.key")
    SERVER.socket = context.wrap_socket(SERVER.socket, server_side=True)
    threading.Thread(target=SERVER.serve_forever, daemon=True).start()


def stop_server():
    global SERVER
    if SERVER:
        SERVER.shutdown()
        SERVER.server_close()
        SERVER = None


def verify_signature(target):
    if WINDOWS:
        env = {**os.environ, "STANDIN_VERIFY_PATH": str(target)}
        script = (
            "$s = Get-AuthenticodeSignature -LiteralPath $env:STANDIN_VERIFY_PATH; "
            "if ($s.Status -ne 'Valid' -or -not $s.TimeStamperCertificate) "
            "{ throw ('Invalid signature: ' + $s.Status) }; "
            "[pscustomobject]@{status=[string]$s.Status; "
            "signer=[string]$s.SignerCertificate.Subject; "
            "timestamped=[bool]$s.TimeStamperCertificate} | ConvertTo-Json -Compress"
        )
        # Python launched by pwsh inherits its PSModulePath. Windows PowerShell 5
        # can then load incompatible PowerShell 7 modules; stay with the host shell.
        shell = shutil.which("pwsh") or "powershell.exe"
        output = run([shell, "-NoProfile", "-NonInteractive", "-Command", script], env=env)
    else:
        run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(target)])
        run(["xcrun", "stapler", "validate", str(target)], retry_codes=(68,))
        output = run(["spctl", "--assess", "--type", "execute", "--verbose=4", str(target)])
    with (EVIDENCE / "os-signatures.txt").open("a", encoding="utf8") as log:
        log.write(f"{target}\n{output.stdout}{output.stderr}\n")

def inspect_universal_dmgs():
    if WINDOWS or os.environ["E2E_TARGET"] != "universal-apple-darwin":
        return
    for label in ("a", "b"):
        dmg = one(ROOT / "packages" / label, "*.dmg")
        run(["codesign", "--verify", "--strict", "--verbose=2", str(dmg)])
        mount = ROOT / f"inspect-{label}"
        mount.mkdir(exist_ok=True)
        run(["hdiutil", "attach", str(dmg), "-readonly", "-nobrowse", "-mountpoint", str(mount)])
        try:
            app = one(mount, "*.app")
            verify_signature(app)
            binary = one(app / "Contents" / "MacOS", "standin-desktop")
            architectures = run(["lipo", "-archs", str(binary)]).stdout.split()
            assert set(architectures) == {"arm64", "x86_64"}, architectures
            PACKAGES.append({
                "version": VERSIONS[label], "dmg": dmg.name,
                "dmgSha256": hashlib.sha256(dmg.read_bytes()).hexdigest(),
                "binarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
                "architectures": architectures,
            })
        finally:
            run(["hdiutil", "detach", str(mount)])


def diagnostics(name):
    if WINDOWS:
        return
    # Keep failures visible. Sampling never retries or relaunches the application.
    processes = run(["ps", "-axo", "pid,ppid,state,etime,comm"]).stdout
    selected = [line for line in processes.splitlines()
                if "standin-desktop" in line or "WebKit" in line]
    (EVIDENCE / f"{name}-processes.txt").write_text("\n".join(selected), encoding="utf8")
    commands = [
        (["sample", line.split()[0], "2", "1", "-file",
          str(EVIDENCE / f"{name}-sample-{line.split()[0]}.txt")], "sample")
        for line in selected if line.split()[2] != "Z"
    ]
    commands.append(([
        "/usr/bin/log", "show", "--last", "5m", "--style", "compact",
        "--predicate", 'process == "standin-desktop" OR process BEGINSWITH "com.apple.WebKit"',
    ], "system-log"))
    for command, kind in commands:
        try:
            result = subprocess.run(command, text=True, capture_output=True, timeout=15)
            if kind == "system-log":
                (EVIDENCE / f"{name}-system-log.txt").write_text(
                    result.stdout + result.stderr, encoding="utf8")
        except (subprocess.TimeoutExpired, OSError) as error:
            print(f"Diagnostic {kind}: {error}", flush=True)


def wait_for_exit(pid, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if WINDOWS:
            # Only needed for the installer's relaunched child, not the Popen parent.
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                text=True, capture_output=True, timeout=10)
            if f'"{pid}"' not in result.stdout:
                return
        else:
            result = subprocess.run(["ps", "-p", str(pid), "-o", "stat="],
                                    text=True, capture_output=True, timeout=10)
            if result.returncode == 1 or result.stdout.strip().startswith("Z"):
                return
        time.sleep(0.1)
    raise AssertionError(f"Reported process {pid} did not exit")


def install_a():
    destination = ROOT / "installed"
    destination.mkdir(exist_ok=True)
    if WINDOWS:
        installer = one(ROOT / "packages" / "a", "*.exe")
        verify_signature(installer)
        verify_signature(PACKAGE)
        run([str(installer), "/S", f"/D={destination}"], timeout=120)
        binary = one(destination, "standin-desktop.exe")
        verify_signature(binary)
        verify_signature(one(destination, "*uninstall*.exe"))
        return binary, None
    dmg = one(ROOT / "packages" / "a", "*.dmg")
    mount = ROOT / "mounted-a"
    mount.mkdir(exist_ok=True)
    run(["hdiutil", "attach", str(dmg), "-readonly", "-nobrowse", "-mountpoint", str(mount)])
    try:
        source = one(mount, "*.app")
        app = destination / source.name
        run(["ditto", str(source), str(app)])
    finally:
        run(["hdiutil", "detach", str(mount)])
    verify_signature(app)
    return one(app / "Contents" / "MacOS", "standin-desktop"), app


def events():
    if not EVENTS.exists():
        return []
    records = []
    for line in EVENTS.read_text(encoding="utf8").splitlines():
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            pass  # Last append can still be in flight.
    return records


def scenario(name, binary, *, expected=None, iteration=None):
    (ROOT / "control.json").write_text(json.dumps({"scenario": name, **VERSIONS}), encoding="utf8")
    before = len(events())
    started = time.monotonic()
    first_event = None
    sampled = False
    evidence_name = name if iteration is None else f"startup-{expected}-{iteration:02d}"
    with (EVIDENCE / f"{evidence_name}-process.txt").open("w", encoding="utf8") as log:
        process = subprocess.Popen([str(binary)], stdout=log, stderr=log)
        while time.monotonic() - started < 240:
            records = events()[before:]
            matching = [r for r in records if r["event"]["scenario"] == name]
            if matching and first_event is None:
                first_event = time.monotonic() - started
            failure = next((r for r in matching if r["event"]["type"] in ("failed", "error")), None)
            if failure:
                diagnostics(evidence_name)
                raise AssertionError(json.dumps(failure))
            passed = next((r for r in matching if r["event"]["type"] == "passed"), None)
            if passed:
                expected = expected or VERSIONS["b" if name in ("upgrade", "no-repeat") else "a"]
                assert passed["version"] == expected, passed
                expected_arch = "aarch64" if TARGET == "darwin-aarch64" else "x86_64"
                assert passed["architecture"] == expected_arch, passed
                # Observe actual termination, including the updater's new child.
                # A fixed sleep followed by waiting only for A can race B's exit.
                process.wait(timeout=30)
                if passed["pid"] != process.pid:
                    wait_for_exit(passed["pid"])
                result = {
                    "scenario": name, "version": passed["version"], "passed": True,
                    "pid": passed["pid"], "architecture": passed["architecture"],
                    "firstEventSeconds": round(first_event, 3),
                    "durationSeconds": round(time.monotonic() - started, 3),
                }
                (RESULTS if iteration is None else STARTUPS).append(result)
                print(f"PASS {evidence_name}: native version {passed['version']}", flush=True)
                return passed
            if not matching and not sampled and time.monotonic() - started > 20:
                diagnostics(evidence_name + "-early")
                sampled = True
            time.sleep(0.25)
    diagnostics(evidence_name)
    raise AssertionError(f"Timeout in {name}; process exit={process.poll()}, events={events()[before:]}")


try:
    inspect_universal_dmgs()
    binary, app_bundle = install_a()
    original_hash = hashlib.sha256(binary.read_bytes()).hexdigest()
    if PACKAGES:
        assert original_hash == PACKAGES[0]["binarySha256"]
    # Start with the server offline: no pending update exists during launch stress.
    for iteration in range(REPETITIONS):
        scenario("startup", binary, expected=VERSIONS["a"], iteration=iteration)
    start_server()
    FEED_MODE = "invalid"
    rejected = scenario("reject-signature", binary)
    cache = pathlib.Path(rejected["cacheDir"]).resolve()
    assert "app.standin.desktop.update-e2e" in str(cache), cache
    assert not (cache / "pending.json").exists()
    FEED_MODE = "valid"
    scenario("download", binary)
    assert (cache / "package.bin").is_file()
    assert not json.loads((cache / "pending.json").read_text())["attempted"]
    stop_server()
    scenario("offline", binary)
    assert (cache / "package.bin").is_file()
    assert hashlib.sha256(binary.read_bytes()).hexdigest() == original_hash
    start_server()
    # Corrupt only our fixed QA cache. The signed source package remains unchanged.
    with (cache / "package.bin").open("r+b") as file:
        first = file.read(1)
        file.seek(0)
        file.write(bytes([first[0] ^ 1]))
    scenario("tamper", binary)
    assert json.loads((cache / "pending.json").read_text())["attempted"]
    scenario("recover", binary)
    assert not json.loads((cache / "pending.json").read_text())["attempted"]
    scenario("upgrade", binary)
    assert hashlib.sha256(binary.read_bytes()).hexdigest() != original_hash
    if PACKAGES:
        assert hashlib.sha256(binary.read_bytes()).hexdigest() == PACKAGES[1]["binarySha256"]
        assert set(run(["lipo", "-archs", str(binary)]).stdout.split()) == {"arm64", "x86_64"}
    verify_signature(app_bundle or binary)
    if WINDOWS:
        verify_signature(one(binary.parent, "*uninstall*.exe"))
    scenario("no-repeat", binary)
    assert not (cache / "pending.json").exists(), "Installed-version cache was not cleaned"
    for iteration in range(REPETITIONS):
        scenario("startup", binary, expected=VERSIONS["b"], iteration=iteration)
    ALL_PASSED = True
finally:
    stop_server()
    if EVENTS.exists():
        shutil.copyfile(EVENTS, EVIDENCE / "events.jsonl")
    native_events = ROOT / "native-startup.jsonl"
    if native_events.exists():
        shutil.copyfile(native_events, EVIDENCE / native_events.name)
    (EVIDENCE / "results.json").write_text(json.dumps({
        "os": platform.platform(), "architecture": platform.machine(),
        "target": TARGET, "versions": VERSIONS, "scenarios": RESULTS,
        "buildTarget": os.environ["E2E_TARGET"], "packages": PACKAGES,
        "startupRepetitionsPerVersion": REPETITIONS, "startups": STARTUPS,
        "allPassed": ALL_PASSED and len(RESULTS) == 7 and len(STARTUPS) == REPETITIONS * 2,
    }, indent=2), encoding="utf8")
