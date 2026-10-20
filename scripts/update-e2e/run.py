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
SERVER = None
FEED_MODE = "valid"


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs)


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
        output = run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env=env)
    else:
        run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(target)])
        run(["xcrun", "stapler", "validate", str(target)])
        output = run(["spctl", "--assess", "--type", "execute", "--verbose=4", str(target)])
    with (EVIDENCE / "os-signatures.txt").open("a", encoding="utf8") as log:
        log.write(f"{target}\n{output.stdout}{output.stderr}\n")


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


def scenario(name, binary):
    (ROOT / "control.json").write_text(json.dumps({"scenario": name, **VERSIONS}), encoding="utf8")
    before = len(events())
    started = time.monotonic()
    with (EVIDENCE / f"{name}-process.txt").open("w", encoding="utf8") as log:
        process = subprocess.Popen([str(binary)], stdout=log, stderr=log)
        while time.monotonic() - started < 240:
            records = events()[before:]
            matching = [r for r in records if r["event"]["scenario"] == name]
            failure = next((r for r in matching if r["event"]["type"] in ("failed", "error")), None)
            if failure:
                raise AssertionError(json.dumps(failure))
            passed = next((r for r in matching if r["event"]["type"] == "passed"), None)
            if passed:
                expected = VERSIONS["b" if name in ("upgrade", "no-repeat") else "a"]
                assert passed["version"] == expected, passed
                RESULTS.append({"scenario": name, "version": passed["version"], "passed": True})
                print(f"PASS {name}: native version {passed['version']}", flush=True)
                # e2e_exit follows the flushed report. Let the installed process leave
                # before invoking the single-instance app again.
                time.sleep(2)
                process.wait(timeout=30)
                return passed
            time.sleep(0.25)
    raise AssertionError(f"Timeout in {name}; process exit={process.poll()}, events={events()[before:]}")


try:
    binary, app_bundle = install_a()
    original_hash = hashlib.sha256(binary.read_bytes()).hexdigest()
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
    verify_signature(app_bundle or binary)
    scenario("no-repeat", binary)
    assert not (cache / "pending.json").exists(), "Installed-version cache was not cleaned"
finally:
    stop_server()
    if EVENTS.exists():
        shutil.copyfile(EVENTS, EVIDENCE / "events.jsonl")
    (EVIDENCE / "results.json").write_text(json.dumps({
        "os": platform.platform(), "architecture": platform.machine(),
        "target": TARGET, "versions": VERSIONS, "scenarios": RESULTS,
        "allPassed": len(RESULTS) == 7,
    }, indent=2), encoding="utf8")
