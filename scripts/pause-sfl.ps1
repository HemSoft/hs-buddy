#!/usr/bin/env pwsh
# Disables all SFL scheduled workflows to stop overnight runs.

$repo = "relias-engineering/hs-buddy"

$workflows = @(
    "Agentic Maintenance"
    "Copilot Setup Steps"
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "SFL Analyzer A — Full-Spectrum Review"
    "SFL Analyzer B — Full-Spectrum Review"
    "SFL Analyzer C — Full-Spectrum Review"
    "Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Host "Pausing all SFL workflows..." -ForegroundColor Yellow

foreach ($wf in $workflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Host "  Already disabled: $wf" -ForegroundColor DarkGray
    } else {
        gh workflow disable $wf --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Disabled: $wf" -ForegroundColor DarkGray
        } else {
            Write-Host "  Failed:   $wf" -ForegroundColor Red
        }
    }
}

Write-Host "`nAll SFL workflows paused." -ForegroundColor Green
