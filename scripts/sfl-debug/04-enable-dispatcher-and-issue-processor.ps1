#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 4 — Enable Issue Processor

.DESCRIPTION
        Enables the core issue-to-PR pipeline entrypoint:
            - Issue Processor    — claims an agent:fixable issue, creates a branch, opens a draft PR

        IMPORTANT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue,
        because analyzers are event-driven (pull_request: opened) and will miss the
        event if disabled when the PR opens.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'
$InformationPreference = 'Continue'
$esc = [char]27

Write-Information ""
Write-Information "${esc}[36m=== Stage 4: Enable Issue Processor ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[37mThis will enable:${esc}[0m"
Write-Information "${esc}[37m  - Issue Processor   (claims issues -> opens draft PRs)${esc}[0m"
Write-Information ""
Write-Information "${esc}[31mIMPORTANT: Enable PR Analyzers (Stage 5) before opening a new${esc}[0m"
Write-Information "${esc}[31mfixable issue, or the analyzers will miss the pull_request:opened event.${esc}[0m"
Write-Information ""

# Show current issue count
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
$issueColor = if ([int]$issueCount -gt 0) { '32' } else { '33' }
Write-Information "${esc}[$($issueColor)mCurrent agent:fixable issues: $issueCount${esc}[0m"
Write-Information ""

$confirm = Read-Host "Enable Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[33mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "sfl-issue-processor.lock.yml";    Name = "SFL Issue Processor" }
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
Write-Information "${esc}[32mIssue Processor enabled.${esc}[0m"
Write-Information ""
Write-Information "${esc}[31mNEXT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue!${esc}[0m"
Write-Information ""
Write-Information "${esc}[36mNext step: Stage 5 (05-enable-pr-analyzers.ps1)${esc}[0m"
Write-Information ""