#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 7 — Enable SFL PR Router + SFL Auditor

.DESCRIPTION
    Enables the final pipeline stage:
    - SFL PR Router   — routes completed review cycles deterministically,
                  adds human:ready-for-review for all-PASS PRs
      - SFL Auditor     — runs at :15 past every hour, repairs label/state
                          discrepancies (orphaned labels, missing markers, etc.)

    After this stage, the FULL SFL loop is operational:
      Findings -> Discussions -> Issues -> Draft PRs -> Analyze -> Fix -> Promote -> Merge

        The SFL PR Router checks:
            - All 3 analyzers have completed the current cycle
            - All PASS -> add human:ready-for-review
            - Any BLOCKING -> dispatch Issue Processor for another pass
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 7: Enable SFL PR Router + SFL Auditor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - SFL PR Router   (route clean vs blocked PRs deterministically)" -ForegroundColor White
Write-Host "  - SFL Auditor     (label/state hygiene, runs hourly at :15)" -ForegroundColor White
Write-Host ""
Write-Host "After this, the FULL SFL pipeline is operational." -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Enable SFL PR Router + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "sfl-pr-router.yml";      Name = "SFL PR Router" }
    @{ File = "sfl-auditor.lock.yml";   Name = "SFL Auditor" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Host "  Already enabled: $($wf.Name)" -ForegroundColor DarkGray
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Enabled: $($wf.Name)" -ForegroundColor Green
        } else {
            Write-Host "  Failed:  $($wf.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  FULL SFL PIPELINE IS NOW OPERATIONAL  " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Pipeline flow:" -ForegroundColor White
Write-Host "  Repo Audit / Simplisticate -> Discussions" -ForegroundColor DarkGray
Write-Host "  Discussion Processor       -> agent:fixable Issues" -ForegroundColor DarkGray
Write-Host "  Dispatcher + Issue Proc.   -> Draft PRs" -ForegroundColor DarkGray
Write-Host "  PR Analyzers A/B/C         -> Review Comments + Markers" -ForegroundColor DarkGray
Write-Host "  PR Fixer                   -> Fix Commits + Cycle Bump" -ForegroundColor DarkGray
Write-Host "  SFL PR Router              -> Route PASS vs BLOCKING after Analyzer C" -ForegroundColor DarkGray
Write-Host "  Human Approval             -> Merge (squash + delete branch)" -ForegroundColor DarkGray
Write-Host "  SFL Auditor                -> Label/state hygiene" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Monitor: gh run list --limit 10" -ForegroundColor Yellow
Write-Host ""
