#!/usr/bin/env pwsh
# Enables a workflow by name or ID.

param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Workflow
)

$repo = "relias-engineering/hs-buddy"

gh workflow enable $Workflow --repo $repo 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Enabled: $Workflow" -ForegroundColor Green
} else {
    Write-Host "Failed to enable: $Workflow" -ForegroundColor Red
}
