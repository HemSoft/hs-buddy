#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 6 — Enable PR Fixer + PR Label Actions

.DESCRIPTION
    Enables the fix-iteration workflows:
      - PR Fixer — Authority     — reads analyzer comments, implements fixes, increments cycle
      - PR Label Actions         — handles label-driven state transitions on PRs

    The PR Fixer is dispatched by the SFL Dispatcher when ALL THREE analyzer markers
    are present on a draft PR's body for the current cycle. It:
      1. Reads the analyzer review comments
      2. Implements the suggested fixes
      3. Pushes commits to the PR branch
      4. Appends its own [MARKER:pr-fixer cycle:N] to the PR body
      5. Bumps the pr:cycle-N label

    PR Label Actions handles transitions like removing human:ready-for-review
    from draft PRs (preventing premature promotion).

    Best to enable AFTER at least one PR has all 3 analyzer markers.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 6: Enable PR Fixer + PR Label Actions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - PR Fixer — Authority    (implements analyzer fixes)" -ForegroundColor White
Write-Host "  - PR Label Actions        (label-driven PR state transitions)" -ForegroundColor White
Write-Host ""
Write-Host "PR Fixer is dispatched when a draft PR has all 3 analyzer markers." -ForegroundColor DarkGray
Write-Host ""

# Show draft PR status
$draftPRs = gh pr list --repo $repo --state open --draft --label "agent:pr" --json number,title --jq '.[] | "#\(.number) \(.title)"'
if ($draftPRs) {
    Write-Host "Current draft agent:pr PRs:" -ForegroundColor Yellow
    $draftPRs | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
} else {
    Write-Host "No draft agent:pr PRs yet — fixer won't have work until one exists." -ForegroundColor DarkGray
}
Write-Host ""

$confirm = Read-Host "Enable PR Fixer + PR Label Actions? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "pr-fixer.lock.yml";    Name = "PR Fixer — Authority" }
    @{ File = "sfl-pr-label-actions.yml"; Name = "PR Label Actions" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Host "  Already enabled: $($wf.Name)" -ForegroundColor DarkGray
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Enabled: $($wf.Name)" -ForegroundColor Green
        } else {
            Write-Host "  Failed:  $($wf.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "PR Fixer + PR Label Actions enabled." -ForegroundColor Green
Write-Host ""
Write-Host "The fixer will run when the dispatcher sees all 3 analyzer markers." -ForegroundColor Yellow
Write-Host "Monitor: gh run list --workflow=pr-fixer.lock.yml --limit 3" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next step: Stage 7 (07-enable-promoter-and-auditor.ps1)" -ForegroundColor Cyan
Write-Host ""
