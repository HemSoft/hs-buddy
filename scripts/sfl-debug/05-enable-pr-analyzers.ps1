#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 5 — Enable SFL Analyzers A/B/C

.DESCRIPTION
    Enables the three SFL analyzer workflows:
      - SFL Analyzer A (claude-sonnet-4.6)  — full-spectrum code review
      - SFL Analyzer B (gemini-3-pro-preview) — full-spectrum code review
      - SFL Analyzer C (gpt-5.3-codex)      — full-spectrum code review

    These are EVENT-DRIVEN — they trigger on pull_request: opened.
    They must be enabled BEFORE the Issue Processor opens a draft PR,
    otherwise they will miss the event entirely.

    Each analyzer posts review comments and appends a MARKER to the PR body
    (e.g., [MARKER:sfl-analyzer-a cycle:0]). The dispatcher checks for all
    three markers before dispatching the PR Fixer.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 5: Enable SFL Analyzers A/B/C ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - SFL Analyzer A (claude-sonnet-4.6)   — code review" -ForegroundColor White
Write-Host "  - SFL Analyzer B (gemini-3-pro-preview) — code review" -ForegroundColor White
Write-Host "  - SFL Analyzer C (gpt-5.3-codex)       — code review" -ForegroundColor White
Write-Host ""
Write-Host "Triggered by: pull_request opened event" -ForegroundColor DarkGray
Write-Host "Output: Review comments + body markers per analyzer" -ForegroundColor DarkGray
Write-Host ""

$confirm = Read-Host "Enable SFL Analyzers? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "sfl-analyzer-a.lock.yml"; Name = "SFL Analyzer A — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-b.lock.yml"; Name = "SFL Analyzer B — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-c.lock.yml"; Name = "SFL Analyzer C — Full-Spectrum Review" }
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
Write-Host "SFL Analyzers enabled." -ForegroundColor Green
Write-Host ""
Write-Host "Now safe to trigger the dispatcher:" -ForegroundColor Yellow
Write-Host "  gh workflow run sfl-dispatcher.yml" -ForegroundColor Yellow
Write-Host ""
Write-Host "After a draft PR is opened, watch for analyzer runs:" -ForegroundColor Yellow
Write-Host "  gh run list --workflow=sfl-analyzer-a.lock.yml --limit 1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next step: Stage 6 (06-enable-pr-fixer-and-labels.ps1)" -ForegroundColor Cyan
Write-Host "  (Wait until analyzers have commented on a PR before enabling)" -ForegroundColor DarkGray
Write-Host ""
