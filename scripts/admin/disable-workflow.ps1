#!/usr/bin/env pwsh
# Disables a workflow by name or ID.

param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Workflow
)


$InformationPreference = 'Continue'
$esc = [char]27
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repo = "relias-engineering/hs-buddy"

gh workflow disable $Workflow --repo $repo 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Information "${esc}[92mDisabled: $Workflow${esc}[0m"
} else {
    Write-Information "${esc}[91mFailed to disable: $Workflow${esc}[0m"
}
