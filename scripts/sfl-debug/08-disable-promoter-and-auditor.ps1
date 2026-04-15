<#
.SYNOPSIS
    Stage 8 — Disable SFL PR Router + SFL Auditor

.DESCRIPTION
    Disables the final-stage workflows (reverse of Stage 7):
    - SFL PR Router   — stops deterministic post-review routing
      - SFL Auditor     — stops label/state hygiene

    Existing draft PRs will remain but won't be promoted or merged.
    This is the first step in a gradual shutdown.
#>


$InformationPreference = 'Continue'
$esc = [char]27
$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[96m=== Stage 8: Disable SFL PR Router + SFL Auditor ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[97mThis will disable:${esc}[0m"
Write-Information "${esc}[97m  - SFL PR Router   (no more PASS/BLOCKING routing)${esc}[0m"
Write-Information "${esc}[97m  - SFL Auditor     (no more label hygiene)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable SFL PR Router + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[93mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "sfl-pr-router.yml";      Name = "SFL PR Router" }
    @{ File = "sfl-auditor.lock.yml";   Name = "SFL Auditor" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Information "${esc}[90m  Already disabled: $($wf.Name)${esc}[0m"
    } else {
        gh workflow disable $wf.Name --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[90m  Disabled: $($wf.Name)${esc}[0m"
        } else {
            Write-Information "${esc}[91m  Failed:   $($wf.Name)${esc}[0m"
        }
    }
}

Write-Information ""
Write-Information "${esc}[92mSFL PR Router + SFL Auditor disabled.${esc}[0m"
Write-Information "${esc}[96mNext step: Stage 9 (09-disable-pr-fixer-and-labels.ps1)${esc}[0m"
Write-Information ""
