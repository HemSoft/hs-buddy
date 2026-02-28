#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 12 — Disable Discussion Processor

.DESCRIPTION
    Disables the Discussion Processor (reverse of Stage 3):
      - Discussion Processor   — stops converting Discussions into Issues

    After this, audit findings will still be posted as Discussions
    but won't be converted to actionable issues.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 12: Disable Discussion Processor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - Discussion Processor   (no more Discussion -> Issue conversion)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable Discussion Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$state = gh workflow view "Discussion Processor" --repo $repo --json state --jq '.state' 2>&1
if ($state -eq 'disabled_manually') {
    Write-Host "  Already disabled: Discussion Processor" -ForegroundColor DarkGray
} else {
    gh workflow disable "Discussion Processor" --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Disabled: Discussion Processor" -ForegroundColor DarkGray
    } else {
        Write-Host "  Failed:   Discussion Processor" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Discussion Processor disabled." -ForegroundColor Green
Write-Host "Next step: Stage 13 (13-disable-reporting.ps1)" -ForegroundColor Cyan
Write-Host ""
