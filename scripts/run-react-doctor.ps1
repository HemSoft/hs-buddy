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

function Test-ReactDoctorJsonValueHasContent {
    param([object]$Value)

    if ($null -eq $Value) {
        return $false
    }

    if ($Value -is [string]) {
        return -not [string]::IsNullOrWhiteSpace($Value)
    }

    if ($Value -is [System.Collections.IDictionary]) {
        return $Value.Count -gt 0
    }

    if ($Value -is [System.Array]) {
        return $Value.Count -gt 0
    }

    if ($Value -is [pscustomobject]) {
        return $Value.PSObject.Properties.Count -gt 0
    }

    return $true
}

function Get-RequiredJsonArrayProperty {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Report,
        [Parameter(Mandatory = $true)]
        [string]$PropertyName
    )

    $property = $Report.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        throw "React Doctor JSON output is missing required '$PropertyName' array."
    }

    if ($null -eq $property.Value -or $property.Value -isnot [System.Array]) {
        throw "React Doctor JSON output has invalid '$PropertyName'; expected an array."
    }

    return @($property.Value)
}

function Get-ReactDoctorSkippedCheckPaths {
    param(
        [object]$Value,
        [string]$Path = '$'
    )

    $paths = @()

    if ($null -eq $Value) {
        return $paths
    }

    if ($Value -is [System.Array]) {
        for ($i = 0; $i -lt $Value.Count; $i++) {
            $paths += Get-ReactDoctorSkippedCheckPaths -Value $Value[$i] -Path "$Path[$i]"
        }
        return $paths
    }

    if ($Value -isnot [pscustomobject]) {
        return $paths
    }

    foreach ($property in $Value.PSObject.Properties) {
        $propertyPath = "$Path.$($property.Name)"
        if (
            ($property.Name -eq 'skippedChecks' -or $property.Name -eq 'skippedCheckReasons') -and
            (Test-ReactDoctorJsonValueHasContent -Value $property.Value)
        ) {
            $paths += $propertyPath
        }

        $paths += Get-ReactDoctorSkippedCheckPaths -Value $property.Value -Path $propertyPath
    }

    return $paths
}

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
            $diagnostics = Get-RequiredJsonArrayProperty -Report $report -PropertyName 'diagnostics'
            $skippedCheckPaths = Get-ReactDoctorSkippedCheckPaths -Value $report
            $diagnosticCount = $diagnostics.Count
            if ($skippedCheckPaths.Count -gt 0) {
                $exitCode = 1
                $scoreOutput += "Score unavailable locally: React Doctor skipped one or more checks"
                foreach ($skippedCheckPath in ($skippedCheckPaths | Select-Object -First 10)) {
                    $scoreOutput += "- $skippedCheckPath"
                }
            } elseif ($diagnosticCount -eq 0) {
                $scoreOutput += 'Score 100/100'
            } else {
                $exitCode = 1
                $scoreOutput += "Score unavailable locally: $diagnosticCount diagnostic(s)"
                foreach ($diagnostic in ($diagnostics | Select-Object -First 10)) {
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
