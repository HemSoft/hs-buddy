<#
.SYNOPSIS
Runs the Perfection skill quality gates and prints the next repo improvements.

.DESCRIPTION
Deterministically evaluates the hs-buddy gates listed in .agents/skills/perfection/SKILL.md:
TypeScript, ESLint, Test Coverage, CRAP Score, Knip, Prettier, Markdown Lint,
Bundle Size, e18e, Dep Cruiser, React Doctor, and Scorecard.

By default this script runs the gates instead of reading stale output. Use -Json
when another tool needs stable machine-readable output.
#>

[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$SkipScorecard,
    [switch]$KeepGoingOnMissingTools
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$coverageSummaryPath = Join-Path $repoRoot 'coverage/coverage-summary.json'
$scoreHistoryPath = Join-Path $repoRoot '.agents/skills/scorecard/score-history.log'

function New-GateResult {
    param(
        [Parameter(Mandatory)][string]$Gate,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$Status,
        [Parameter(Mandatory)][string]$Detail,
        [int]$ExitCode = 0,
        [double]$Seconds = 0,
        [object[]]$Findings = @()
    )

    [pscustomobject]@{
        Gate = $Gate
        Status = $Status
        Detail = $Detail
        Target = $Target
        Command = $Command
        ExitCode = $ExitCode
        Seconds = [math]::Round($Seconds, 2)
        Findings = @($Findings)
    }
}

function Invoke-RepoCommand {
    param(
        [Parameter(Mandatory)][string]$Display,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    Push-Location $repoRoot
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $output = & $FilePath @Arguments 2>&1
        $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
        $ErrorActionPreference = $previousErrorActionPreference
        $stopwatch.Stop()

        [pscustomobject]@{
            Display = $Display
            Output = @($output | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        $_.Exception.Message
                    } else {
                        $_.ToString()
                    }
                })
            ExitCode = $exitCode
            Seconds = $stopwatch.Elapsed.TotalSeconds
        }
    } catch {
        if ($null -ne (Get-Variable -Name previousErrorActionPreference -Scope Local -ErrorAction SilentlyContinue)) {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if (-not $KeepGoingOnMissingTools) {
            throw
        }

        [pscustomobject]@{
            Display = $Display
            Output = @($_.Exception.Message)
            ExitCode = 127
            Seconds = 0
        }
    } finally {
        Pop-Location
    }
}

function ConvertTo-Detail {
    param([string[]]$Output, [int]$MaxLines = 3)

    $lines = @($Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last $MaxLines)
    if ($lines.Count -eq 0) {
        return 'No output'
    }

    return ($lines -join ' | ')
}

function Get-CountFromOutput {
    param(
        [string[]]$Output,
        [string[]]$Patterns
    )

    $text = $Output -join "`n"
    foreach ($pattern in $Patterns) {
        $match = [regex]::Match($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($match.Success) {
            return [int]$match.Groups[1].Value
        }
    }

    return $null
}

function Get-CoverageMetrics {
    if (-not (Test-Path $coverageSummaryPath)) {
        return $null
    }

    $summary = Get-Content -Raw -Path $coverageSummaryPath | ConvertFrom-Json
    $total = $summary.total
    [pscustomobject]@{
        Statements = [double]$total.statements.pct
        Branches = [double]$total.branches.pct
        Functions = [double]$total.functions.pct
        Lines = [double]$total.lines.pct
    }
}

function Get-Scorecard {
    if ($SkipScorecard) {
        return New-GateResult `
            -Gate 'Scorecard' `
            -Target '100/100 Gold' `
            -Command 'gh api repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html' `
            -Status 'SKIPPED' `
            -Detail 'Skipped by -SkipScorecard'
    }

    $command = 'gh api repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html --jq .content'
    $run = Invoke-RepoCommand -Display $command -FilePath 'gh' -Arguments @(
        'api',
        'repos/relias-engineering/org-metrics/contents/reports/scorecard-hs-buddy.html',
        '--jq',
        '.content'
    )

    if ($run.ExitCode -ne 0) {
        return New-GateResult `
            -Gate 'Scorecard' `
            -Target '100/100 Gold' `
            -Command $command `
            -Status 'FAIL' `
            -Detail (ConvertTo-Detail $run.Output) `
            -ExitCode $run.ExitCode `
            -Seconds $run.Seconds
    }

    try {
        $content = ($run.Output -join '').Trim()
        $html = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($content))
        $match = [regex]::Match(
            $html,
            '<script\s+type="application/json"\s+id="scorecard-data">\s*(?<json>.*?)\s*</script>',
            [System.Text.RegularExpressions.RegexOptions]::Singleline
        )
        if (-not $match.Success) {
            throw 'Could not find scorecard-data JSON script tag.'
        }

        $data = $match.Groups['json'].Value | ConvertFrom-Json
        $classification = $data.classification
        $score = [int]$classification.numericScore
        $max = [int]$classification.maxPoints
        $level = [string]$classification.level
        $failing = @($data.rules | Where-Object { -not $_.passed })

        $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
        $et = [System.TimeZoneInfo]::ConvertTime((Get-Date).ToUniversalTime(), $tz)
        $offset = $tz.GetUtcOffset($et)
        $sign = if ($offset.TotalMinutes -ge 0) { '+' } else { '-' }
        $timestamp = '{0}{1}{2:00}:{3:00}' -f $et.ToString('yyyy-MM-ddTHH:mm:ss'), $sign, [math]::Abs($offset.Hours), [math]::Abs($offset.Minutes)
        $line = '{0} | {1}/{2} | {3} | Bronze: {4}/{5} ({6}/{7}) | Silver: {8}/{9} ({10}/{11}) | Gold: {12}/{13} ({14}/{15})' -f `
            $timestamp,
            $score,
            $max,
            $level,
            $classification.bronze.points,
            $classification.bronze.maxPoints,
            $classification.bronze.passed,
            $classification.bronze.total,
            $classification.silver.points,
            $classification.silver.maxPoints,
            $classification.silver.passed,
            $classification.silver.total,
            $classification.gold.points,
            $classification.gold.maxPoints,
            $classification.gold.passed,
            $classification.gold.total
        Add-Content -Path $scoreHistoryPath -Value $line

        $status = if ($score -eq 100 -and $level -eq 'Gold') { 'PASS' } else { 'FAIL' }
        $detail = '{0}/{1} {2}; Bronze {3}/{4}, Silver {5}/{6}, Gold {7}/{8}; {9} failing rule(s)' -f `
            $score,
            $max,
            $level,
            $classification.bronze.points,
            $classification.bronze.maxPoints,
            $classification.silver.points,
            $classification.silver.maxPoints,
            $classification.gold.points,
            $classification.gold.maxPoints,
            $failing.Count

        return New-GateResult `
            -Gate 'Scorecard' `
            -Target '100/100 Gold' `
            -Command $command `
            -Status $status `
            -Detail $detail `
            -ExitCode $run.ExitCode `
            -Seconds $run.Seconds `
            -Findings $failing
    } catch {
        return New-GateResult `
            -Gate 'Scorecard' `
            -Target '100/100 Gold' `
            -Command $command `
            -Status 'FAIL' `
            -Detail $_.Exception.Message `
            -ExitCode 1 `
            -Seconds $run.Seconds
    }
}

function Invoke-SimpleGate {
    param(
        [Parameter(Mandatory)][string]$Gate,
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [scriptblock]$DetailFactory = $null
    )

    $run = Invoke-RepoCommand -Display $Command -FilePath $FilePath -Arguments $Arguments
    $status = if ($run.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
    $detail = if ($null -ne $DetailFactory) {
        & $DetailFactory $run
    } elseif ($status -eq 'PASS') {
        'Clean'
    } else {
        ConvertTo-Detail $run.Output
    }

    New-GateResult `
        -Gate $Gate `
        -Target $Target `
        -Command $Command `
        -Status $status `
        -Detail $detail `
        -ExitCode $run.ExitCode `
        -Seconds $run.Seconds
}

function Get-NextActions {
    param([object[]]$Results)

    $priority = @(
        'TypeScript',
        'ESLint',
        'Prettier',
        'Knip',
        'Test Coverage',
        'CRAP Score',
        'React Doctor',
        'Markdown Lint',
        'Bundle Size',
        'e18e',
        'Dep Cruiser',
        'Scorecard'
    )

    $byGate = @{}
    foreach ($result in $Results) {
        $byGate[$result.Gate] = $result
    }

    foreach ($gate in $priority) {
        if ($byGate.ContainsKey($gate)) {
            $result = $byGate[$gate]
            if ($result.Status -ne 'PASS') {
                [pscustomobject]@{
                    Gate = $result.Gate
                    Status = $result.Status
                    Command = $result.Command
                    Detail = $result.Detail
                }
            }
        }
    }
}

$results = [System.Collections.Generic.List[object]]::new()

$results.Add((Invoke-SimpleGate -Gate 'TypeScript' -Target '0 errors' -Command 'bun run typecheck' -FilePath 'bun' -Arguments @('run', 'typecheck') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return '0 errors' }
    $count = Get-CountFromOutput $run.Output @('Found\s+(\d+)\s+errors?', '(\d+)\s+errors?')
    if ($null -ne $count) { return "$count error(s)" }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'ESLint' -Target '0 errors, 0 warnings' -Command 'bun run lint' -FilePath 'bun' -Arguments @('run', 'lint') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return '0 errors, 0 warnings' }
    $text = $run.Output -join "`n"
    $match = [regex]::Match($text, '(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) {
        return '{0} error(s), {1} warning(s)' -f $match.Groups[2].Value, $match.Groups[3].Value
    }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'Test Coverage' -Target '100% statements, branches, functions, lines' -Command 'bun run test:coverage' -FilePath 'bun' -Arguments @('run', 'test:coverage') -DetailFactory {
    param($run)
    $coverage = Get-CoverageMetrics
    if ($null -eq $coverage) { return ConvertTo-Detail $run.Output }
    'Statements {0}%, Branches {1}%, Functions {2}%, Lines {3}%' -f $coverage.Statements, $coverage.Branches, $coverage.Functions, $coverage.Lines
}))

$complexityRun = Invoke-RepoCommand -Display 'npx eslint . --rule "complexity: [warn, 5]"' -FilePath 'npx' -Arguments @('eslint', '.', '--rule', 'complexity: [warn, 5]')
$complexityText = $complexityRun.Output -join "`n"
$complexitySummary = [regex]::Match($complexityText, '(\d+)\s+problems?\s+\(\d+\s+errors?,\s+(\d+)\s+warnings?\)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($complexitySummary.Success) {
    $complexityWarnings = [int]$complexitySummary.Groups[2].Value
} else {
    $complexityWarnings = Get-CountFromOutput $complexityRun.Output @('(\d+)\s+warnings?')
}
if ($null -eq $complexityWarnings) {
    $complexityWarnings = @($complexityRun.Output | Select-String -Pattern 'complexity').Count
}
$coverageMetrics = Get-CoverageMetrics
$coverageIsPerfect = $null -ne $coverageMetrics -and $coverageMetrics.Statements -eq 100 -and $coverageMetrics.Branches -eq 100 -and $coverageMetrics.Functions -eq 100 -and $coverageMetrics.Lines -eq 100
$crapStatus = if ($complexityRun.ExitCode -eq 0 -and $complexityWarnings -eq 0 -and $coverageIsPerfect) { 'PASS' } else { 'FAIL' }
$crapDetail = if ($coverageIsPerfect) {
    if ($complexityWarnings -eq 0) { 'All functions covered and complexity <= 5, so CRAP < 6' } else { "$complexityWarnings function(s) exceed complexity 5; CRAP may be >= 6" }
} elseif ($null -eq $coverageMetrics) {
    'Coverage summary missing; cannot prove CRAP < 6'
} else {
    'Coverage is below 100%; {0} complexity warning(s)' -f $complexityWarnings
}
$results.Add((New-GateResult -Gate 'CRAP Score' -Target 'CRAP < 6 for every function' -Command 'npx eslint . --rule "complexity: [warn, 5]"' -Status $crapStatus -Detail $crapDetail -ExitCode $complexityRun.ExitCode -Seconds $complexityRun.Seconds))

$results.Add((Invoke-SimpleGate -Gate 'Knip' -Target '0 findings' -Command 'bun run knip' -FilePath 'bun' -Arguments @('run', 'knip') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return '0 findings' }
    ConvertTo-Detail $run.Output 5
}))

$results.Add((Invoke-SimpleGate -Gate 'Prettier' -Target '0 unformatted files' -Command 'bun run format:check' -FilePath 'bun' -Arguments @('run', 'format:check') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return 'Clean' }
    $count = @($run.Output | Select-String -Pattern '^\[warn\]\s+.+').Count
    if ($count -gt 0) { return "$count unformatted file(s)" }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'Markdown Lint' -Target '0 findings' -Command 'bun run lint:md' -FilePath 'bun' -Arguments @('run', 'lint:md') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return 'Clean' }
    $count = @($run.Output | Select-String -Pattern ':\d+(?::\d+)?\s+MD\d+').Count
    if ($count -gt 0) { return "$count finding(s)" }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'Bundle Size' -Target 'Within baseline budget' -Command 'bun run bundle-size' -FilePath 'bun' -Arguments @('run', 'bundle-size') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return 'Within budget' }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'e18e' -Target '0 direct-dependency findings' -Command 'bun run e18e' -FilePath 'bun' -Arguments @('run', 'e18e') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return 'No direct-dependency findings' }
    ConvertTo-Detail $run.Output 5
}))

$results.Add((Invoke-SimpleGate -Gate 'Dep Cruiser' -Target '0 violations' -Command 'bun run deps:check' -FilePath 'bun' -Arguments @('run', 'deps:check') -DetailFactory {
    param($run)
    if ($run.ExitCode -eq 0) { return '0 violations' }
    $count = Get-CountFromOutput $run.Output @('(\d+)\s+violations?')
    if ($null -ne $count) { return "$count violation(s)" }
    ConvertTo-Detail $run.Output
}))

$results.Add((Invoke-SimpleGate -Gate 'React Doctor' -Target 'Score 100' -Command '.\scripts\run-react-doctor.ps1 -ScoreOnly' -FilePath 'powershell' -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'run-react-doctor.ps1'), '-ScoreOnly') -DetailFactory {
    param($run)
    $text = $run.Output -join "`n"
    $scoreMatch = [regex]::Match($text, '(?:score|overall score)\D+(\d{1,3})', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($scoreMatch.Success) {
        return 'Score {0}/100' -f $scoreMatch.Groups[1].Value
    }
    if ($run.ExitCode -eq 0) { return 'Score 100/100' }
    ConvertTo-Detail $run.Output
}))

$results.Add((Get-Scorecard))

$passing = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$nextActions = @(Get-NextActions $results)
$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')

$report = [pscustomobject]@{
    Repository = $repoRoot.Path
    GeneratedAt = $generatedAt
    PerfectionScore = '{0}/{1} gates passing' -f $passing, $results.Count
    Gates = @($results)
    NextActions = $nextActions
}

if ($Json) {
    $report | ConvertTo-Json -Depth 8
    exit $(if ($nextActions.Count -eq 0) { 0 } else { 1 })
}

Write-Host ''
Write-Host 'Perfection Metrics - hs-buddy'
Write-Host "Generated: $generatedAt"
Write-Host "Score: $($report.PerfectionScore)"
Write-Host ''
$results |
    Select-Object Gate, Status, Detail, Target |
    Format-Table -AutoSize -Wrap

Write-Host ''
Write-Host 'What next'
if ($nextActions.Count -eq 0) {
    Write-Host 'All perfection gates are passing.'
} else {
    $nextActions |
        Select-Object Gate, Status, Detail, Command |
        Format-Table -AutoSize -Wrap
}

exit $(if ($nextActions.Count -eq 0) { 0 } else { 1 })
