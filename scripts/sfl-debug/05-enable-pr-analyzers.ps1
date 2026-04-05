#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 5 — Enable SFL Analyzers A/B/C

.DESCRIPTION
    Enables the three SFL analyzer workflows:
      - SFL Analyzer A (claude-sonnet-4.6)  — full-spectrum code review
      - SFL Analyzer B (claude-opus-4.6) — full-spectrum code review
      - SFL Analyzer C (gpt-5.4)      — full-spectrum code review

    These are EVENT-DRIVEN — they trigger on pull_request: opened.
    They must be enabled BEFORE the Issue Processor opens a draft PR,
    otherwise they will miss the event entirely.

    Each analyzer posts review comments and appends a MARKER to the PR body
    (e.g., [MARKER:sfl-analyzer-a cycle:0]). The dispatcher checks for all
    three markers before dispatching the PR Fixer.
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
Write-Information "${Cyan}=== Stage 5: Enable SFL Analyzers A/B/C ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable:${Reset}"
Write-Information "${White}  - SFL Analyzer A (claude-sonnet-4.6)   — code review${Reset}"
Write-Information "${White}  - SFL Analyzer B (claude-opus-4.6)       — code review${Reset}"
Write-Information "${White}  - SFL Analyzer C (gpt-5.4)              — code review${Reset}"
Write-Information ""
Write-Information "${DGray}Triggered by: pull_request opened event${Reset}"
Write-Information "${DGray}Output: Review comments + body markers per analyzer${Reset}"
Write-Information ""

$confirm = Read-Host "Enable SFL Analyzers? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
    return
}

$workflows = @(
    @{ File = "sfl-analyzer-a.lock.yml"; Name = "SFL Analyzer A — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-b.lock.yml"; Name = "SFL Analyzer B — Full-Spectrum Review" }
    @{ File = "sfl-analyzer-c.lock.yml"; Name = "SFL Analyzer C — Full-Spectrum Review" }
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
Write-Information "${Green}SFL Analyzers enabled.${Reset}"
Write-Information ""
Write-Information "${Yellow}Now safe to open or reopen a fixable issue:${Reset}"
Write-Information "${Yellow}  (Issue Processor will start from the issue event)${Reset}"
Write-Information ""
Write-Information "${Yellow}After a draft PR is opened, watch for analyzer runs:${Reset}"
Write-Information "${Yellow}  gh run list --workflow=sfl-analyzer-a.lock.yml --limit 1${Reset}"
Write-Information ""
Write-Information "${Cyan}Next step: Stage 6 (06-enable-pr-fixer-and-labels.ps1)${Reset}"
Write-Information "${DGray}  (Wait until analyzers have commented on a PR before enabling)${Reset}"
Write-Information ""
