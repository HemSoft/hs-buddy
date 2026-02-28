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

Write-Host ""
Write-Host "=== Stage 3: Enable Discussion Processor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - Discussion Processor   (converts Discussion findings -> Issues)" -ForegroundColor White
Write-Host ""
Write-Host "Triggered by: Discussion labeled 'report'" -ForegroundColor DarkGray
Write-Host "Output: GitHub Issues with agent:fixable label" -ForegroundColor DarkGray
Write-Host ""

$confirm = Read-Host "Enable Discussion Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$state = gh workflow view "Discussion Processor" --repo $repo --json state --jq '.state' 2>&1
if ($state -eq 'active') {
    Write-Host "  Already enabled: Discussion Processor" -ForegroundColor DarkGray
} else {
    gh workflow enable discussion-processor.lock.yml --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Enabled: Discussion Processor" -ForegroundColor Green
    } else {
        Write-Host "  Failed:  Discussion Processor" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Discussion Processor enabled." -ForegroundColor Green
Write-Host ""
Write-Host "At this point, the pipeline can generate and create issues." -ForegroundColor Yellow
Write-Host "Wait for agent:fixable issues to appear, then proceed to Stage 4." -ForegroundColor Yellow
Write-Host ""
Write-Host "Check for issues: gh issue list --label agent:fixable --state open" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next step: Stage 4 (04-enable-dispatcher-and-issue-processor.ps1)" -ForegroundColor Cyan
Write-Host ""
