param(
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "This capture script must run on native Windows."
}

$packageRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$repoRoot = Split-Path -Parent (Split-Path -Parent $packageRoot)

if ($OutputDirectory -eq "") {
  $OutputDirectory = Join-Path $packageRoot "fixtures\windows-input"
}

$shellFamily = if ($PSVersionTable.PSEdition -eq "Desktop") {
  "powershell-5.1"
} else {
  "powershell-7"
}
$hostFamily = if ($env:WT_SESSION) {
  "windows-terminal"
} else {
  "console-host"
}
$fixtureName = "$shellFamily-$hostFamily.jsonl"
$fixturePath = Join-Path $OutputDirectory $fixtureName

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
if (Test-Path $fixturePath) {
  throw "Fixture already exists: $fixturePath. Move or delete it explicitly before recapturing."
}

$env:BINDTTY_INPUT_TRACE = "1"
$env:BINDTTY_INPUT_TRACE_FILE = $fixturePath
$env:BINDTTY_CAPTURE_SHELL = $shellFamily
$env:BINDTTY_CAPTURE_SHELL_VERSION = $PSVersionTable.PSVersion.ToString()
$env:BINDTTY_CAPTURE_HOST = $hostFamily

Push-Location $repoRoot
try {
  npm run build:real --workspace @bindtty/e2e
  if ($LASTEXITCODE -ne 0) {
    throw "The capture harness build failed."
  }

  node packages/e2e/dist/real/harness/windows-input-capture.js
  if ($LASTEXITCODE -ne 0) {
    throw "The input capture failed."
  }

  node packages/e2e/scripts/validate-windows-input-fixture.mjs $fixturePath
  if ($LASTEXITCODE -ne 0) {
    throw "The captured fixture failed validation."
  }
} catch {
  if (Test-Path $fixturePath) {
    Remove-Item -Force $fixturePath
  }
  throw
} finally {
  Pop-Location
  Remove-Item Env:BINDTTY_INPUT_TRACE -ErrorAction SilentlyContinue
  Remove-Item Env:BINDTTY_INPUT_TRACE_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:BINDTTY_CAPTURE_SHELL -ErrorAction SilentlyContinue
  Remove-Item Env:BINDTTY_CAPTURE_SHELL_VERSION -ErrorAction SilentlyContinue
  Remove-Item Env:BINDTTY_CAPTURE_HOST -ErrorAction SilentlyContinue
}

Write-Host "Validated fixture: $fixturePath"
