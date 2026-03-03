#!/usr/bin/env pwsh
# Re-enables all SFL scheduled workflows.

$repo = "relias-engineering/hs-buddy"

$workflows = @(
    "Agentic Maintenance"
    "Copilot Setup Steps"
    "SFL Dispatcher"
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
    "Test SFL Config Reader"
)

Write-Host "Resuming all SFL workflows..." -ForegroundColor Yellow

foreach ($wf in $workflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Host "  Already enabled: $wf" -ForegroundColor DarkGray
    } else {
        gh workflow enable $wf --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Enabled: $wf" -ForegroundColor Green
        } else {
            Write-Host "  Failed:  $wf" -ForegroundColor Red
        }
    }
}

Write-Host "`nAll SFL workflows resumed." -ForegroundColor Green
