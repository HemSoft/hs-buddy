<#!
.SYNOPSIS
    Runs React Doctor with UTF-8 output and saves report artifacts in the repo.

.DESCRIPTION
    Executes react-doctor in non-interactive mode, writes terminal output to a
    timestamped summary file, and copies generated diagnostics from %TEMP% into
    docs/react-doctor/<date>/ for easy access in VS Code.

.EXAMPLE
    .\scripts\run-react-doctor.ps1

.EXAMPLE
    .\scripts\run-react-doctor.ps1 -Path .\src
#>

param(
    [string]$Path = '.',
    [switch]$ScoreOnly
)

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$esc = [char]27
$Cyan = "${esc}[36m"
$Green = "${esc}[32m"
$Reset = "${esc}[0m"

try {
    chcp 65001 > $null
} catch {
    Write-Verbose "chcp not available: $($_.Exception.Message)"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$dateFolder = Get-Date -Format 'yyyy-MM-dd'
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$reportDir = Join-Path $PSScriptRoot "..\docs\react-doctor\$dateFolder"
$reportDir = (Resolve-Path (New-Item -ItemType Directory -Path $reportDir -Force)).Path
$terminalSummaryFile = Join-Path $reportDir "terminal-summary-$timestamp.txt"

$arguments = @('-y', 'react-doctor@0.5.8', $Path, '--yes')
if ($ScoreOnly) {
    $arguments += @('--json', '--no-score')
}

Write-Information "${Cyan}Running: npx $($arguments -join ' ')${Reset}"

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$stderrOutput = @()
if ($ScoreOnly) {
    $stderrFile = New-TemporaryFile
    try {
        $output = & npx @arguments 2> $stderrFile
        $exitCode = $LASTEXITCODE
        $stderrOutput = Get-Content -LiteralPath $stderrFile -ErrorAction SilentlyContinue
    } finally {
        Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
    }
} else {
    $output = & npx @arguments 2>&1
    $exitCode = $LASTEXITCODE
}
$ErrorActionPreference = $previousErrorActionPreference

if ($ScoreOnly) {
    $scoreOutput = @()

    if ($exitCode -ne 0) {
        $scoreOutput += "Score unavailable locally: react-doctor exited with code $exitCode"
        if ($stderrOutput) {
            $scoreOutput += 'stderr:'
            $scoreOutput += $stderrOutput
        }
        if ($output) {
            $scoreOutput += 'stdout:'
            $scoreOutput += $output
        }
    } else {
        try {
            $rawText = $output -join "`n"
            $report = $rawText | ConvertFrom-Json
            $diagnosticCount = @($report.diagnostics).Count
            if ($diagnosticCount -eq 0) {
                $scoreOutput += 'Score 100/100'
            } else {
                $exitCode = 1
                $scoreOutput += "Score unavailable locally: $diagnosticCount diagnostic(s)"
                $diagnostics = @($report.diagnostics) | Select-Object -First 10
                foreach ($diagnostic in $diagnostics) {
                    $scoreOutput += "- $($diagnostic.ruleId): $($diagnostic.message)"
                }
            }
        } catch {
            $exitCode = 1
            $scoreOutput += "Score unavailable locally: could not parse react-doctor JSON output"
            $scoreOutput += $_.Exception.Message
        }
    }

    $scoreOutput | Tee-Object -FilePath $terminalSummaryFile
} else {
    $output | Tee-Object -FilePath $terminalSummaryFile
}

$diagnosticsSearchOutput = if ($ScoreOnly) { @($output) + @($stderrOutput) } else { $output }
$diagnosticsLine = $diagnosticsSearchOutput | Select-String -Pattern 'Full diagnostics written to\s+(.+)$' | Select-Object -Last 1
if ($diagnosticsLine) {
    $tempDiagnosticsDir = $diagnosticsLine.Matches[0].Groups[1].Value.Trim()
    if (Test-Path $tempDiagnosticsDir) {
        Copy-Item -Path (Join-Path $tempDiagnosticsDir '*') -Destination $reportDir -Recurse -Force
        Write-Information "${Green}Copied diagnostics to: $reportDir${Reset}"
    }
}

Write-Information "${Green}Terminal summary: $terminalSummaryFile${Reset}"

exit $exitCode
