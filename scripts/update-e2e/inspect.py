"""Read-only signature diagnostics for already-built QA artifacts; no re-signing."""
import json
import os
from pathlib import Path
import platform
import subprocess

ROOT = Path("inspect-packages").resolve()
RESULTS = []


def capture(label, args, env=None):
    result = subprocess.run(args, capture_output=True, text=True, errors="replace", env=env)
    record = {
        "label": label, "exitCode": result.returncode,
        "stdout": result.stdout, "stderr": result.stderr,
    }
    RESULTS.append(record)
    print(json.dumps(record, ensure_ascii=True), flush=True)


for version in ("a", "b"):
    folder = ROOT / version
    if platform.system() == "Windows":
        for installer in folder.glob("*.exe"):
            env = {**os.environ, "STANDIN_VERIFY_PATH": str(installer)}
            script = (
                "$ErrorActionPreference='Stop'; "
                "$s=Get-AuthenticodeSignature -LiteralPath $env:STANDIN_VERIFY_PATH; "
                "[pscustomobject]@{status=[string]$s.Status; message=$s.StatusMessage; "
                "signer=[string]$s.SignerCertificate.Subject; "
                "timestamped=[bool]$s.TimeStamperCertificate} | ConvertTo-Json -Compress"
            )
            for shell in ("powershell.exe", "pwsh.exe"):
                capture(f"{version}-{shell}", [shell, "-NoProfile", "-NonInteractive", "-Command", script], env)
    else:
        expanded = folder / "expanded"
        expanded.mkdir()
        archive = next(folder.glob("*.app.tar.gz"))
        capture(f"{version}-extract", ["tar", "-xzf", str(archive), "-C", str(expanded)])
        app = next(expanded.glob("*.app"))
        capture(f"{version}-codesign", ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)])
        capture(f"{version}-stapler", ["xcrun", "stapler", "validate", "-v", str(app)])
        capture(f"{version}-spctl", ["spctl", "--assess", "--type", "execute", "--verbose=4", str(app)])

Path("inspect-results.json").write_text(json.dumps(RESULTS, indent=2), encoding="utf8")
