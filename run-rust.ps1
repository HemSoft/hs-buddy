#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build and launch the native Rust (GPUI) Buddy app in rust/.
  Works with PowerShell 7 on Linux, macOS, and Windows, and with Windows PowerShell 5.1.

.EXAMPLE
  ./run-rust.ps1                       # debug build, run
  ./run-rust.ps1 -Release              # optimized build, run
  ./run-rust.ps1 -ConvexUrl https://my-deployment.convex.cloud
  ./run-rust.ps1 -ConfigPath C:\path\to\config.json -LogLevel debug
  ./run-rust.ps1 -BuildOnly
#>
[CmdletBinding()]
param(
    [switch] $Release,
    [switch] $BuildOnly,
    [string] $ConvexUrl,
    [string] $ConfigPath,
    [ValidateSet('error', 'warn', 'info', 'debug', 'trace')]
    [string] $LogLevel = 'warn'
)

$ErrorActionPreference = 'Stop'
$rustDir = Join-Path $PSScriptRoot 'rust'

# ── Ensure cargo is on PATH (rustup default location) ────────────────────────
$cargoBin = Join-Path $HOME '.cargo/bin'
if ((Test-Path $cargoBin) -and ($env:PATH -notlike "*$cargoBin*")) {
    $env:PATH = "$cargoBin$([IO.Path]::PathSeparator)$env:PATH"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "cargo not found. Install Rust: https://rustup.rs (then re-open the shell)."
}

# ── Runtime environment ──────────────────────────────────────────────────────
if ($ConvexUrl)  { $env:BUDDY_CONVEX_URL  = $ConvexUrl }
if ($ConfigPath) { $env:BUDDY_CONFIG_PATH = $ConfigPath }
if (-not $env:RUST_LOG) { $env:RUST_LOG = $LogLevel }

# ── Build ────────────────────────────────────────────────────────────────────
$profileArgs = if ($Release) { @('--release') } else { @() }
Push-Location $rustDir
try {
    Write-Host "Building buddy-app ($(if ($Release) { 'release' } else { 'debug' }))..." -ForegroundColor Cyan
    & cargo build -p buddy-app @profileArgs
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit code $LASTEXITCODE" }

    if ($BuildOnly) { return }

    # $IsWindows is undefined on Windows PowerShell 5.1, so also check the classic env var.
    $onWindows = $IsWindows -or ($env:OS -eq 'Windows_NT')
    $exe = if ($onWindows) { 'buddy.exe' } else { 'buddy' }
    $profileDir = if ($Release) { 'release' } else { 'debug' }
    $binary = Join-Path (Join-Path (Join-Path $rustDir 'target') $profileDir) $exe
    Write-Host "Launching $binary" -ForegroundColor Cyan
    & $binary
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
