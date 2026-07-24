<#
.SYNOPSIS
Fetches the hs-buddy scorecard and emits it only after repository validation.
#>

[CmdletBinding()]
param(
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

Push-Location $repoRoot
try {
    $expectedRepository = & gh repo view --json nameWithOwner --jq '.nameWithOwner'
    if ($LASTEXITCODE -ne 0) {
        throw "Could not determine the current GitHub repository (exit code $LASTEXITCODE)."
    }

    $content = & gh api `
        'repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html' `
        --jq '.content'
    if ($LASTEXITCODE -ne 0) {
        throw "Could not fetch the scorecard report (exit code $LASTEXITCODE)."
    }

    $arguments = @(
        'scripts/scorecard-report.ts',
        '--expected-repository',
        ([string]$expectedRepository).Trim()
    )
    if ($Json) {
        $arguments += '--json'
    }

    ($content -join '') | & bun @arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
