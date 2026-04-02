#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 7 — Enable SFL PR Router + SFL Auditor

.DESCRIPTION
    Enables the final pipeline stage:
    - SFL PR Router   — routes completed review cycles deterministically,
                  adds human:ready-for-review for all-PASS PRs
      - SFL Auditor     — runs at :15 past every hour, repairs label/state
                          discrepancies (orphaned labels, missing markers, etc.)

    After this stage, the FULL SFL loop is operational:
      Findings -> Discussions -> Issues -> Draft PRs -> Analyze -> Fix -> Promote -> Merge

        The SFL PR Router checks:
            - All 3 analyzers have completed the current cycle
            - All PASS -> add human:ready-for-review
            - Any BLOCKING -> dispatch Issue Processor for another pass
#>

$ErrorActionPreference = 'Stop'

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan    = "${esc}[36m"
$DGray    = "${esc}[90m"
$Green    = "${esc}[32m"
$Red    = "${esc}[31m"
$White    = "${esc}[37m"
$Yellow    = "${esc}[33m"
$Reset   = "${esc}[0m"
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${Cyan}=== Stage 7: Enable SFL PR Router + SFL Auditor ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable:${Reset}"
Write-Information "${White}  - SFL PR Router   (route clean vs blocked PRs deterministically)${Reset}"
Write-Information "${White}  - SFL Auditor     (label/state hygiene, runs hourly at :15)${Reset}"
Write-Information ""
Write-Information "${Green}After this, the FULL SFL pipeline is operational.${Reset}"
Write-Information ""

$confirm = Read-Host "Enable SFL PR Router + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
    return
}

$workflows = @(
    @{ File = "sfl-pr-router.yml";      Name = "SFL PR Router" }
    @{ File = "sfl-auditor.lock.yml";   Name = "SFL Auditor" }
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
Write-Information "${Green}========================================${Reset}"
Write-Information "${Green}  FULL SFL PIPELINE IS NOW OPERATIONAL  ${Reset}"
Write-Information "${Green}========================================${Reset}"
Write-Information ""
Write-Information "${White}Pipeline flow:${Reset}"
Write-Information "${DGray}  Repo Audit / Simplisticate -> Discussions${Reset}"
Write-Information "${DGray}  Discussion Processor       -> agent:fixable Issues${Reset}"
Write-Information "${DGray}  Dispatcher + Issue Proc.   -> Draft PRs${Reset}"
Write-Information "${DGray}  PR Analyzers A/B/C         -> Review Comments + Markers${Reset}"
Write-Information "${DGray}  PR Fixer                   -> Fix Commits + Cycle Bump${Reset}"
Write-Information "${DGray}  SFL PR Router              -> Route PASS vs BLOCKING after Analyzer C${Reset}"
Write-Information "${DGray}  Human Approval             -> Merge (squash + delete branch)${Reset}"
Write-Information "${DGray}  SFL Auditor                -> Label/state hygiene${Reset}"
Write-Information ""
Write-Information "${Yellow}Monitor: gh run list --limit 10${Reset}"
Write-Information ""