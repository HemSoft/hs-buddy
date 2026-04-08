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
$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$White = "${esc}[37m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${Cyan}=== Stage 2: Enable Reporting Workflows ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable the finding-generator workflows:${Reset}"
Write-Information "${White}  - Daily Repo Audit       (audits repo quality)${Reset}"
Write-Information "${White}  - Daily Repo Status      (status reports)${Reset}"
Write-Information "${White}  - Daily Simplisticate    (complexity findings)${Reset}"
Write-Information ""
Write-Information "${DGray}These run on daily cron schedules and post Discussions.${Reset}"
Write-Information "${DGray}Nothing else in the pipeline triggers until Stage 3.${Reset}"
Write-Information ""

$confirm = Read-Host "Enable reporting workflows? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
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
        Write-Information "${DGray}  Already enabled: $($wf.Name)${Reset}"
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${Green}  Enabled: $($wf.Name)${Reset}"
        } else {
            Write-Information "${Red}  Failed:  $($wf.Name)${Reset}"
        }
    }
}

Write-Information ""
Write-Information "${Green}Reporting workflows enabled.${Reset}"
Write-Information ""
Write-Information "${Yellow}TIP: To generate findings immediately, trigger one manually:${Reset}"
Write-Information "${Yellow}  gh workflow run repo-audit.lock.yml${Reset}"
Write-Information ""
Write-Information "${Cyan}Next step: Stage 3 (03-enable-discussion-processor.ps1)${Reset}"
Write-Information ""
