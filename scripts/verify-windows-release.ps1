param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [string]$SevenZipPath = '7z'
)

$ErrorActionPreference = 'Stop'

function Assert-SignedAndTimestamped([System.IO.FileInfo]$File) {
  $signature = Get-AuthenticodeSignature -LiteralPath $File.FullName
  $timestamped = [bool]$signature.TimeStamperCertificate
  Write-Host "$($File.Name): $($signature.Status) | $($signature.SignerCertificate.Subject) | timestamped=$timestamped"
  if ($signature.Status -ne 'Valid' -or -not $timestamped) {
    throw "Invalid or untimestamped Windows signature: $($File.FullName)"
  }
}

$installer = Get-Item -LiteralPath $InstallerPath
Assert-SignedAndTimestamped $installer

# Tauri restores the unsigned build-directory exe after bundling. Verify the
# actual shipped payload instead; never run the installer on the validation host.
# https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle.rs#L197
$temporaryRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$extracted = Join-Path $temporaryRoot ("standin-signature-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $extracted | Out-Null
& $SevenZipPath x '-y' '-bso0' '-bsp0' "-o$extracted" $installer.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Could not extract the Windows installer (7-Zip exit code $LASTEXITCODE)"
}

$payload = @(Get-ChildItem -LiteralPath $extracted -Recurse -File)
foreach ($required in @('standin-desktop.exe', 'uninstall.exe')) {
  if (@($payload | Where-Object Name -eq $required).Count -ne 1) {
    throw "Expected exactly one $required in the Windows installer"
  }
}

# Include the uninstaller and NSIS helper DLLs, not just the main app.
foreach ($file in $payload | Where-Object { $_.Extension -in '.exe', '.dll' }) {
  Assert-SignedAndTimestamped $file
}
Write-Host 'Windows installer and packaged executable signatures verified.'
