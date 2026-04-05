#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 6 — Enable PR Fixer + PR Label Actions

.DESCRIPTION
    Enables the fix-iteration workflows:
      - PR Fixer — Authority     — reads analyzer comments, implements fixes, increments cycle
      - PR Label Actions         — handles label-driven state transitions on PRs

    The PR Fixer is dispatched after Analyzer C when ALL THREE analyzer markers
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
Write-Information "${Cyan}=== Stage 6: Enable PR Fixer + PR Label Actions ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable:${Reset}"
Write-Information "${White}  - PR Fixer — Authority    (implements analyzer fixes)${Reset}"
Write-Information "${White}  - PR Label Actions        (label-driven PR state transitions)${Reset}"
Write-Information ""
Write-Information "${DGray}PR Fixer is dispatched when a draft PR has all 3 analyzer markers.${Reset}"
Write-Information ""

# Show draft PR status
$draftPRs = gh pr list --repo $repo --state open --draft --label "agent:pr" --json number,title --jq '.[] | "#\(.number) \(.title)"'
if ($draftPRs) {
    Write-Information "${Yellow}Current draft agent:pr PRs:${Reset}"
    $draftPRs | ForEach-Object { Write-Information "${Yellow}  $_${Reset}" }
} else {
    Write-Information "${DGray}No draft agent:pr PRs yet — fixer won't have work until one exists.${Reset}"
}
Write-Information ""

$confirm = Read-Host "Enable PR Fixer + PR Label Actions? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
    return
}

$workflows = @(
    @{ File = "pr-fixer.lock.yml";    Name = "PR Fixer — Authority" }
    @{ File = "sfl-pr-label-actions.yml"; Name = "PR Label Actions" }
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
Write-Information "${Green}PR Fixer + PR Label Actions enabled.${Reset}"
Write-Information ""
Write-Information "${Yellow}The fixer will run when the dispatcher sees all 3 analyzer markers.${Reset}"
Write-Information "${Yellow}Monitor: gh run list --workflow=pr-fixer.lock.yml --limit 3${Reset}"
Write-Information ""
Write-Information "${Cyan}Next step: Stage 7 (07-enable-promoter-and-auditor.ps1)${Reset}"
Write-Information ""
