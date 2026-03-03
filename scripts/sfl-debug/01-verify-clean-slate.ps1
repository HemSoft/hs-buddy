#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 1 — Verify Clean Slate

.DESCRIPTION
    Confirms the SFL pipeline is fully stopped and the repo is in a clean state:
      - All SFL workflows are disabled
      - No open issues with agent:fixable label
      - No open pull requests with agent:pr label

    This is the starting point for a from-scratch SFL debug session.
    Run this FIRST before gradually enabling stages.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 1: Verify Clean Slate ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script checks that:" -ForegroundColor White
Write-Host "  1. All SFL workflows are disabled" -ForegroundColor White
Write-Host "  2. No open agent:fixable issues exist" -ForegroundColor White
Write-Host "  3. No open agent:pr pull requests exist" -ForegroundColor White
Write-Host ""
Write-Host "Repo: $repo" -ForegroundColor DarkGray
Write-Host ""

# ── Check workflows ──────────────────────────────────────────────────────────

$sflWorkflows = @(
    "SFL Dispatcher"
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "PR Analyzer A — Full-Spectrum Review"
    "PR Analyzer B — Full-Spectrum Review"
    "PR Analyzer C — Full-Spectrum Review"
    "Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Host "Checking workflow states..." -ForegroundColor Yellow
$allDisabled = $true
foreach ($wf in $sflWorkflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Host "  ACTIVE:   $wf" -ForegroundColor Red
        $allDisabled = $false
    } else {
        Write-Host "  Disabled: $wf" -ForegroundColor DarkGray
    }
}

# ── Check issues ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Checking for open agent:fixable issues..." -ForegroundColor Yellow
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
if ([int]$issueCount -gt 0) {
    Write-Host "  Found $issueCount open agent:fixable issue(s)" -ForegroundColor Yellow
    gh issue list --repo $repo --label "agent:fixable" --state open --json number,title --jq '.[] | "    #\(.number) \(.title)"' | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
} else {
    Write-Host "  No open agent:fixable issues" -ForegroundColor DarkGray
}

# ── Check PRs ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Checking for open agent:pr pull requests..." -ForegroundColor Yellow
$prCount = gh pr list --repo $repo --label "agent:pr" --state open --json number --jq 'length'
if ([int]$prCount -gt 0) {
    Write-Host "  Found $prCount open agent:pr PR(s)" -ForegroundColor Yellow
    gh pr list --repo $repo --label "agent:pr" --state open --json number,title --jq '.[] | "    #\(.number) \(.title)"' | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
} else {
    Write-Host "  No open agent:pr PRs" -ForegroundColor DarkGray
}

# ── Verdict ──────────────────────────────────────────────────────────────────

Write-Host ""
if ($allDisabled -and [int]$issueCount -eq 0 -and [int]$prCount -eq 0) {
    Write-Host "CLEAN SLATE CONFIRMED" -ForegroundColor Green
    Write-Host "Ready to proceed with Stage 2 (02-enable-reporting.ps1)." -ForegroundColor Green
} else {
    Write-Host "NOT a clean slate." -ForegroundColor Red
    if (-not $allDisabled) {
        Write-Host "  -> Some workflows are still active. Run ../pause-sfl.ps1 first." -ForegroundColor Red
    }
    if ([int]$issueCount -gt 0) {
        Write-Host "  -> Close or unlabel the agent:fixable issues above if starting fresh." -ForegroundColor Red
    }
    if ([int]$prCount -gt 0) {
        Write-Host "  -> Close the agent:pr PRs above if starting fresh." -ForegroundColor Red
    }
}
Write-Host ""
