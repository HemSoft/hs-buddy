#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 10 — Disable SFL Analyzers A/B/C

.DESCRIPTION
    Disables the three SFL analyzer workflows (reverse of Stage 5):
      - SFL Analyzer A (claude-sonnet-4.6)
      - SFL Analyzer B (claude-opus-4.6)
      - SFL Analyzer C (gpt-5.4)

    New PRs opened after this will not receive automated reviews.
#>

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'
$esc = [char]27
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[36m=== Stage 10: Disable SFL Analyzers A/B/C ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[37mThis will disable:${esc}[0m"
Write-Information "${esc}[37m  - SFL Analyzer A (claude-sonnet-4.6)${esc}[0m"
Write-Information "${esc}[37m  - SFL Analyzer B (claude-opus-4.6)${esc}[0m"
Write-Information "${esc}[37m  - SFL Analyzer C (gpt-5.4)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable SFL Analyzers? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[33mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "sfl-analyzer-a.lock.yml"; Name = "SFL Analyzer A — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-b.lock.yml"; Name = "SFL Analyzer B — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-c.lock.yml"; Name = "SFL Analyzer C — Full-Spectrum Review" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Information "${esc}[90m  Already disabled: $($wf.Name)${esc}[0m"
    } else {
        gh workflow disable $wf.Name --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[90m  Disabled: $($wf.Name)${esc}[0m"
        } else {
            Write-Information "${esc}[31m  Failed:   $($wf.Name)${esc}[0m"
        }
    }
}

Write-Information ""
Write-Information "${esc}[32mPR Analyzers disabled.${esc}[0m"
Write-Information "${esc}[36mNext step: Stage 11 (11-disable-dispatcher-and-issue-processor.ps1)${esc}[0m"
Write-Information ""
