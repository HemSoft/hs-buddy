#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 11 — Disable Issue Processor

.DESCRIPTION
        Disables the issue processor (reverse of Stage 4):
            - Issue Processor    — stops claiming issues and opening PRs

    After this, no new PRs will be created from issues.
    Existing issues remain open with their labels intact.
#>


$InformationPreference = 'Continue'
$esc = [char]27
$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[96m=== Stage 11: Disable Issue Processor ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[97mThis will disable:${esc}[0m"
Write-Information "${esc}[97m  - Issue Processor   (no more issue -> PR conversion)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[93mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "sfl-issue-processor.lock.yml"; Name = "SFL Issue Processor" }
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
            Write-Information "${esc}[91m  Failed:   $($wf.Name)${esc}[0m"
        }
    }
}

Write-Information ""
Write-Information "${esc}[92mIssue Processor disabled.${esc}[0m"
Write-Information "${esc}[96mNext step: Stage 12 (12-disable-discussion-processor.ps1)${esc}[0m"
Write-Information ""
