<#
.SYNOPSIS
Runs the local Buddy quality baseline, not complete CI qualification.
.DESCRIPTION
Reads enforced coverage targets from maintained suite configs. Accounts for
all jobs in CI, with reasons for exclusions. Always builds fresh production
outputs before bundle/CSP qualification. Missing prerequisites are BLOCKED.
Use a disposable checkout for read-only audits: builds and reports write files.
KeepGoingOnMissingTools remains accepted for compatibility; missing tools are
always recorded and independent gates continue. No dependencies are installed,
accounts switched, workflows dispatched or external services written.
#>

[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$SkipScorecard,
    [switch]$KeepGoingOnMissingTools,
    [switch]$PlanOnly,
    [string[]]$Gates = @(),
    [string]$Repository = (Join-Path $PSScriptRoot '..')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'audit-reporting.psm1') -Force -DisableNameChecking
$repoRoot = (Resolve-Path $Repository).Path

function Invoke-RepoCommand {
    param([object]$Spec)
    Push-Location $repoRoot
    $watch = [diagnostics.stopwatch]::StartNew()
    $started = [datetime]::UtcNow
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $global:LASTEXITCODE = 0
        $arguments = $Spec.Arguments
        $output = @(& $Spec.FilePath @arguments 2>&1 | ForEach-Object { $_.ToString() })
        $code = $global:LASTEXITCODE
    } catch {
        $output = @($_.Exception.Message)
        $code = 127
    } finally {
        $ErrorActionPreference = $previous
        $watch.Stop()
        Pop-Location
    }
    [pscustomobject]@{ Output = $output; ExitCode = $code; Seconds = $watch.Elapsed.TotalSeconds; StartedAtUtc = $started }
}

function Get-ScorecardResult {
    param([object]$Spec, [object]$Run)
    try {
        $data = ($Run.Output -join "`n") | ConvertFrom-Json
        $score = [int]$data.classification.numericScore
        $level = [string]$data.classification.level
        $status = if ($score -eq 100 -and $level -eq 'Gold') { 'PASS' } else { 'FAIL' }
        New-AuditResult $Spec $status "$score/$($data.classification.maxPoints) $level" $Run.ExitCode $Run.Seconds
    } catch {
        New-AuditResult $Spec 'BLOCKED' "External scorecard measurement unavailable: $($_.Exception.Message)" 1 $Run.Seconds
    }
}

function Invoke-AuditGate {
    param([object]$Spec, [hashtable]$Prior)
    $missing = Get-AuditPrerequisite $Spec $repoRoot $Prior
    if ($missing) { return New-AuditResult $Spec 'BLOCKED' $missing 127 }
    $run = Invoke-RepoCommand $Spec
    $status = Get-AuditCommandStatus $Spec $run.ExitCode ($run.Output -join "`n")
    $detail = Get-AuditDetail $Spec $run.Output
    if ($Spec.Gate -eq 'Build' -and $status -eq 'PASS') {
        $missing = Test-FreshAuditBuild $repoRoot $run.StartedAtUtc
        if ($missing) { $status = 'BLOCKED'; $detail = $missing }
    }
    if ($Spec.Gate -eq 'Scorecard' -and $status -eq 'PASS') { return Get-ScorecardResult $Spec $run }
    $result = New-AuditResult $Spec $status $detail $run.ExitCode $run.Seconds
    if ($status -ne 'PASS') { $result | Add-Member -NotePropertyName Output -NotePropertyValue $run.Output }
    return $result
}

try {
    $coverage = Get-CoveragePolicy $repoRoot
    $plan = @(Get-AuditGatePlan $coverage $repoRoot)
} catch {
    $report = [pscustomobject]@{
        Repository = $repoRoot; Scope = 'Local baseline'; FullQualification = $false
        Gates = @([pscustomobject]@{ Gate = 'Policy discovery'; Status = 'BLOCKED'; Detail = $_.Exception.Message })
    }
    if ($Json) { $report | ConvertTo-Json -Depth 8 } else { $report.Gates | Format-Table -Wrap }
    exit 2
}

$unknown = @($Gates | Where-Object { $_ -notin $plan.Gate })
if ($unknown.Count -gt 0) { throw "Unknown gate selection: $($unknown -join ', ')" }
# Selecting a built-output check always includes the fresh build prerequisite.
if ($Gates.Count -gt 0 -and (@($Gates | Where-Object { $_ -in @('Bundle Size', 'Production CSP') }).Count -gt 0)) {
    $Gates += 'Build'
}
$results = [collections.generic.list[object]]::new()
$byGate = @{}
foreach ($spec in $plan) {
    if ($SkipScorecard -and $spec.Gate -eq 'Scorecard') {
        $result = New-AuditResult $spec 'EXCLUDED' 'Excluded by -SkipScorecard; external measurement not obtained'
    } elseif ($Gates.Count -gt 0 -and $spec.Gate -notin $Gates) {
        $result = New-AuditResult $spec 'EXCLUDED' 'Outside explicit -Gates selection; not validated'
    } elseif ($PlanOnly) {
        $result = New-AuditResult $spec 'PLANNED' 'Plan only; no command executed and no artifact accepted'
    } else {
        $result = Invoke-AuditGate $spec $byGate
    }
    $results.Add($result)
    $byGate[$spec.Gate] = $result
}
$ciScope = @(Get-AuditCIScope $repoRoot $byGate $coverage)
$nextActions = @(@($results) + $ciScope | Where-Object { $_.Status -in @('FAIL', 'BLOCKED') })
$passing = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$executed = @($results | Where-Object { $_.Status -in @('PASS', 'FAIL') }).Count
$report = [pscustomobject]@{
    ReportVersion = 2
    Repository = $repoRoot
    GeneratedAt = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([datetime]::UtcNow, 'America/New_York').ToString('yyyy-MM-dd HH:mm:ss') + ' ET'
    Scope = 'Local baseline only; not ci-feedback or ci-complete'
    FullQualification = $false
    BaselineScore = "$passing/$executed executed gates passing; $($results.Count) gates accounted for"
    CoveragePolicy = $coverage
    Gates = @($results)
    CIGates = $ciScope
    NextActions = $nextActions
}
if ($Json) {
    $report | ConvertTo-Json -Depth 10
} else {
    Write-Host "Buddy local baseline: $($report.BaselineScore)"
    Write-Host $report.Scope
    $report.Gates | Select-Object Gate, Status, Detail, Target | Format-Table -Wrap
    Write-Host 'Independent CI scope'
    $report.CIGates | Format-Table -Wrap
}
if (@($nextActions | Where-Object { $_.Status -eq 'FAIL' }).Count -gt 0) { exit 1 }
if (@($nextActions | Where-Object { $_.Status -eq 'BLOCKED' }).Count -gt 0) { exit 2 }
exit 0
