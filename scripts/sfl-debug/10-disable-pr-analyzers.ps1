#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 10 — Disable PR Analyzers A/B/C

.DESCRIPTION
    Disables the three PR analyzer workflows (reverse of Stage 5):
      - PR Analyzer A (claude-sonnet-4.6)
      - PR Analyzer B (claude-opus-4.6)
      - PR Analyzer C (gpt-5.3-codex)

    New PRs opened after this will not receive automated reviews.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 10: Disable PR Analyzers A/B/C ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - PR Analyzer A (claude-sonnet-4.6)" -ForegroundColor White
Write-Host "  - PR Analyzer B (claude-opus-4.6)" -ForegroundColor White
Write-Host "  - PR Analyzer C (gpt-5.3-codex)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable PR Analyzers? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "pr-analyzer-a.lock.yml"; Name = "PR Analyzer A — Full-Spectrum Review" }
    @{ File = "pr-analyzer-b.lock.yml"; Name = "PR Analyzer B — Full-Spectrum Review" }
    @{ File = "pr-analyzer-c.lock.yml"; Name = "PR Analyzer C — Full-Spectrum Review" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Host "  Already disabled: $($wf.Name)" -ForegroundColor DarkGray
    } else {
        gh workflow disable $wf.Name --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Disabled: $($wf.Name)" -ForegroundColor DarkGray
        } else {
            Write-Host "  Failed:   $($wf.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "PR Analyzers disabled." -ForegroundColor Green
Write-Host "Next step: Stage 11 (11-disable-dispatcher-and-issue-processor.ps1)" -ForegroundColor Cyan
Write-Host ""
