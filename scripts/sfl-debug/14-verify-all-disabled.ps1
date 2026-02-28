#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 14 — Verify All Disabled

.DESCRIPTION
    Confirms all SFL workflows are disabled after a gradual shutdown.
    This is the mirror of Stage 1 (verify-clean-slate) but only checks
    workflow state — it does NOT check for open issues/PRs since those
    may legitimately remain after a shutdown.

    For a full clean-slate check, use 01-verify-clean-slate.ps1 instead.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 14: Verify All Disabled ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Checking all SFL workflow states..." -ForegroundColor Yellow
Write-Host ""

$sflWorkflows = @(
    "SFL Dispatcher"
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "PR Analyzer A — Full-Spectrum Review"
    "PR Analyzer B — Full-Spectrum Review"
    "PR Analyzer C — Full-Spectrum Review"
    "Daily Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

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

Write-Host ""
if ($allDisabled) {
    Write-Host "ALL SFL WORKFLOWS DISABLED" -ForegroundColor Green
    Write-Host "Pipeline is fully stopped." -ForegroundColor Green
} else {
    Write-Host "Some workflows are still active!" -ForegroundColor Red
    Write-Host "Run ../pause-sfl.ps1 to force-disable all, or disable individually above." -ForegroundColor Red
}

# Also show residual state for awareness
Write-Host ""
Write-Host "Residual state (informational):" -ForegroundColor Yellow
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
$prCount = gh pr list --repo $repo --label "agent:pr" --state open --json number --jq 'length'
Write-Host "  Open agent:fixable issues: $issueCount" -ForegroundColor $(if ([int]$issueCount -gt 0) { 'Yellow' } else { 'DarkGray' })
Write-Host "  Open agent:pr PRs:         $prCount" -ForegroundColor $(if ([int]$prCount -gt 0) { 'Yellow' } else { 'DarkGray' })
Write-Host ""
