#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 2 — Enable Reporting Workflows

.DESCRIPTION
    Enables the workflows that DISCOVER findings:
      - Daily Repo Audit    — audits repo quality, posts Discussion findings
      - Daily Repo Status   — daily status report Discussion
      - Daily Simplisticate — complexity audit, posts Discussion findings

    These are the source of all work in the SFL pipeline. They run on daily
    schedules and post their findings as GitHub Discussions. Nothing downstream
    triggers until Discussion Processor (Stage 3) converts them to issues.

    After enabling, you can manually trigger one to generate findings immediately
    rather than waiting for the daily cron.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'
$InformationPreference = 'Continue'
$esc = [char]27

Write-Information ""
Write-Information "${esc}[36m=== Stage 2: Enable Reporting Workflows ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[37mThis will enable the finding-generator workflows:${esc}[0m"
Write-Information "${esc}[37m  - Daily Repo Audit       (audits repo quality)${esc}[0m"
Write-Information "${esc}[37m  - Daily Repo Status      (status reports)${esc}[0m"
Write-Information "${esc}[37m  - Daily Simplisticate    (complexity findings)${esc}[0m"
Write-Information ""
Write-Information "${esc}[90mThese run on daily cron schedules and post Discussions.${esc}[0m"
Write-Information "${esc}[90mNothing else in the pipeline triggers until Stage 3.${esc}[0m"
Write-Information ""

$confirm = Read-Host "Enable reporting workflows? [y/N]"
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
    if ($state -eq 'active') {
        Write-Information "${esc}[90m  Already enabled: $($wf.Name)${esc}[0m"
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[32m  Enabled: $($wf.Name)${esc}[0m"
        } else {
            Write-Information "${esc}[31m  Failed:  $($wf.Name)${esc}[0m"
        }
    }
}

Write-Information ""
Write-Information "${esc}[32mReporting workflows enabled.${esc}[0m"
Write-Information ""
Write-Information "${esc}[33mTIP: To generate findings immediately, trigger one manually:${esc}[0m"
Write-Information "${esc}[33m  gh workflow run repo-audit.lock.yml${esc}[0m"
Write-Information ""
Write-Information "${esc}[36mNext step: Stage 3 (03-enable-discussion-processor.ps1)${esc}[0m"
Write-Information ""