#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 13 — Disable Reporting Workflows

.DESCRIPTION
    Disables the finding-generator workflows (reverse of Stage 2):
      - Daily Repo Audit
      - Daily Repo Status
      - Simplisticate Audit

    After this, no new findings will be generated.
#>

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'
$esc = [char]27
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[36m=== Stage 13: Disable Reporting Workflows ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[37mThis will disable:${esc}[0m"
Write-Information "${esc}[37m  - Daily Repo Audit       (no more quality audits)${esc}[0m"
Write-Information "${esc}[37m  - Daily Repo Status      (no more status reports)${esc}[0m"
Write-Information "${esc}[37m  - Daily Simplisticate    (no more complexity audits)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable reporting workflows? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[33mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "repo-audit.lock.yml";       Name = "Daily Repo Audit" }
    @{ File = "daily-repo-status.lock.yml"; Name = "Daily Repo Status" }
    @{ File = "simplisticate-audit.lock.yml"; Name = "Simplisticate Audit" }
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
Write-Information "${esc}[32mReporting workflows disabled.${esc}[0m"
Write-Information "${esc}[36mNext step: Stage 14 (14-verify-all-disabled.ps1)${esc}[0m"
Write-Information ""
