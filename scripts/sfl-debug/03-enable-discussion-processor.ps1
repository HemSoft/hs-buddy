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
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'
$InformationPreference = 'Continue'
$esc = [char]27

Write-Information ""
Write-Information "${esc}[36m=== Stage 3: Enable Discussion Processor ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[37mThis will enable:${esc}[0m"
Write-Information "${esc}[37m  - Discussion Processor   (converts Discussion findings -> Issues)${esc}[0m"
Write-Information ""
Write-Information "${esc}[90mTriggered by: Discussion labeled 'report'${esc}[0m"
Write-Information "${esc}[90mOutput: GitHub Issues with agent:fixable label${esc}[0m"
Write-Information ""

$confirm = Read-Host "Enable Discussion Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[33mAborted.${esc}[0m"
    return
}

$state = gh workflow view "Discussion Processor" --repo $repo --json state --jq '.state' 2>&1
if ($state -eq 'active') {
    Write-Information "${esc}[90m  Already enabled: Discussion Processor${esc}[0m"
} else {
    gh workflow enable discussion-processor.lock.yml --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Information "${esc}[32m  Enabled: Discussion Processor${esc}[0m"
    } else {
        Write-Information "${esc}[31m  Failed:  Discussion Processor${esc}[0m"
    }
}

Write-Information ""
Write-Information "${esc}[32mDiscussion Processor enabled.${esc}[0m"
Write-Information ""
Write-Information "${esc}[33mAt this point, the pipeline can generate and create issues.${esc}[0m"
Write-Information "${esc}[33mWait for agent:fixable issues to appear, then proceed to Stage 4.${esc}[0m"
Write-Information ""
Write-Information "${esc}[33mCheck for issues: gh issue list --label agent:fixable --state open${esc}[0m"
Write-Information ""
Write-Information "${esc}[36mNext step: Stage 4 (04-enable-dispatcher-and-issue-processor.ps1)${esc}[0m"
Write-Information ""