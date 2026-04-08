#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 3 — Enable Discussion Processor

.DESCRIPTION
    Enables the Discussion Processor workflow, which:
      - Triggers when a Discussion gets the "report" label
      - Reads the findings from repo-audit / simplisticate Discussions
      - Groups them into actionable GitHub Issues with the agent:fixable label

    This is the bridge between "findings exist" and "issues exist."
    Without this, the audit Discussions sit unprocessed.

    After enabling, if Discussions with findings already exist, you can
    re-label one with "report" to trigger processing.
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
Write-Information "${Cyan}=== Stage 3: Enable Discussion Processor ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable:${Reset}"
Write-Information "${White}  - Discussion Processor   (converts Discussion findings -> Issues)${Reset}"
Write-Information ""
Write-Information "${DGray}Triggered by: Discussion labeled 'report'${Reset}"
Write-Information "${DGray}Output: GitHub Issues with agent:fixable label${Reset}"
Write-Information ""

$confirm = Read-Host "Enable Discussion Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
    return
}

$state = gh workflow view "Discussion Processor" --repo $repo --json state --jq '.state' 2>&1
if ($state -eq 'active') {
    Write-Information "${DGray}  Already enabled: Discussion Processor${Reset}"
} else {
    gh workflow enable discussion-processor.lock.yml --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Information "${Green}  Enabled: Discussion Processor${Reset}"
    } else {
        Write-Information "${Red}  Failed:  Discussion Processor${Reset}"
    }
}

Write-Information ""
Write-Information "${Green}Discussion Processor enabled.${Reset}"
Write-Information ""
Write-Information "${Yellow}At this point, the pipeline can generate and create issues.${Reset}"
Write-Information "${Yellow}Wait for agent:fixable issues to appear, then proceed to Stage 4.${Reset}"
Write-Information ""
Write-Information "${Yellow}Check for issues: gh issue list --label agent:fixable --state open${Reset}"
Write-Information ""
Write-Information "${Cyan}Next step: Stage 4 (04-enable-dispatcher-and-issue-processor.ps1)${Reset}"
Write-Information ""
