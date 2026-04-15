#!/usr/bin/env pwsh
# Enables a workflow by name or ID.

param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Workflow
)


$InformationPreference = 'Continue'
$esc = [char]27
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repo = "relias-engineering/hs-buddy"

gh workflow enable $Workflow --repo $repo 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Information "${esc}[92mEnabled: $Workflow${esc}[0m"
} else {
    Write-Information "${esc}[91mFailed to enable: $Workflow${esc}[0m"
}
