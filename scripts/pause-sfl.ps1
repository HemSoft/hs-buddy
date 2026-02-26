#!/usr/bin/env pwsh
# Disables all SFL scheduled workflows to stop overnight runs.

$repo = "relias-engineering/hs-buddy"

$workflows = @(
    "SFL Dispatcher"
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "PR Analyzer A — Full-Spectrum Review"
    "PR Analyzer B — Full-Spectrum Review"
    "PR Analyzer C — Full-Spectrum Review"
    "Daily Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Host "Pausing all SFL workflows..." -ForegroundColor Yellow

foreach ($wf in $workflows) {
    gh workflow disable $wf --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Disabled: $wf" -ForegroundColor DarkGray
    } else {
        Write-Host "  Failed:   $wf" -ForegroundColor Red
    }
}

Write-Host "`nAll SFL workflows paused." -ForegroundColor Green
