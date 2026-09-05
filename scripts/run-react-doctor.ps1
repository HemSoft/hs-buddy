<#!
.SYNOPSIS
    Compatibility wrapper for the repository's cross-platform React Doctor gate.
#>
param([string]$Path = '.', [switch]$ScoreOnly)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ((Resolve-Path $Path).Path -ne $root) {
    throw 'React Doctor now scans the complete repository. Run bun run react-doctor from the repository root.'
}
Push-Location $root
try {
    & bun run react-doctor
    $result = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $result
