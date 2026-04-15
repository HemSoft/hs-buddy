#!/usr/bin/env pwsh
# Disables all SFL scheduled workflows to stop overnight runs.


$InformationPreference = 'Continue'
$esc = [char]27
$repo = "relias-engineering/hs-buddy"

$workflows = @(
    "Agentic Maintenance"
    "Copilot Setup Steps"
    "SFL Auditor"
    "Issue Processor"
    "SFL Analyzer A — Full-Spectrum Review"
    "SFL Analyzer B — Full-Spectrum Review"
    "SFL Analyzer C — Full-Spectrum Review"
    "Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Information "${esc}[93mPausing all SFL workflows...${esc}[0m"

foreach ($wf in $workflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Information "${esc}[90m  Already disabled: $wf${esc}[0m"
    } else {
        gh workflow disable $wf --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[90m  Disabled: $wf${esc}[0m"
        } else {
            Write-Information "${esc}[91m  Failed:   $wf${esc}[0m"
        }
    }
}

Write-Information "${esc}[92m`nAll SFL workflows paused.${esc}[0m"
