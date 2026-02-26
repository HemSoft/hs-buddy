#!/usr/bin/env pwsh
# Disables a workflow by name or ID.

param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Workflow
)

$repo = "relias-engineering/hs-buddy"

gh workflow disable $Workflow --repo $repo 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Disabled: $Workflow" -ForegroundColor Green
} else {
    Write-Host "Failed to disable: $Workflow" -ForegroundColor Red
}
