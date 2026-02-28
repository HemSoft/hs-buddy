#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 7 — Enable PR Promoter + SFL Auditor

.DESCRIPTION
    Enables the final pipeline stage:
      - PR Promoter     — un-drafts clean PRs, applies human:ready-for-review,
                          merges approved PRs (squash + delete branch)
      - SFL Auditor     — runs at :15 past every hour, repairs label/state
                          discrepancies (orphaned labels, missing markers, etc.)

    After this stage, the FULL SFL loop is operational:
      Findings -> Discussions -> Issues -> Draft PRs -> Analyze -> Fix -> Promote -> Merge

    The PR Promoter checks:
      - All 3 analyzers have PASS markers at current cycle
      - No open review threads / requested changes
      - Un-drafts and adds human:ready-for-review label
      - Merges PRs that have been approved by a human reviewer
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 7: Enable PR Promoter + SFL Auditor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - PR Promoter     (un-draft clean PRs, merge approved PRs)" -ForegroundColor White
Write-Host "  - SFL Auditor     (label/state hygiene, runs hourly at :15)" -ForegroundColor White
Write-Host ""
Write-Host "After this, the FULL SFL pipeline is operational." -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Enable PR Promoter + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "pr-promoter.lock.yml";   Name = "PR Promoter" }
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
Write-Host "  PR Promoter                -> Un-draft + human:ready-for-review" -ForegroundColor DarkGray
Write-Host "  Human Approval             -> Merge (squash + delete branch)" -ForegroundColor DarkGray
Write-Host "  SFL Auditor                -> Label/state hygiene" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Monitor: gh run list --limit 10" -ForegroundColor Yellow
Write-Host ""
