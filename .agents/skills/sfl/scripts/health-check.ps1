#!/usr/bin/env pwsh
<#
.SYNOPSIS
    SFL Health Check — automated pass/fail report on pipeline health.
.DESCRIPTION
    Runs a battery of checks against the SFL pipeline and produces a
    structured pass/fail table. Designed for quick triage.
.PARAMETER Repo
    The repo to check (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

function Get-LinkedIssueNumber {
    param(
        [Parameter(Mandatory)]
        $PullRequest
    )

    $body = [string]$PullRequest.body
    if ($body -match 'Closes\s+#(\d+)') {
        return [int]$matches[1]
    }

    if ($body -match '\*\*Linked Issue\*\*:\s+#(\d+)') {
        return [int]$matches[1]
    }

    if ($PullRequest.headRefName -match 'agent-fix/issue-(\d+)-') {
        return [int]$matches[1]
    }

    return $null
}

Write-Host "`n=== SFL HEALTH CHECK ===" -ForegroundColor Cyan
Write-Host "Repo: $Repo"
Write-Host "Time: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) (local)"
Write-Host ""

$results = @()

# --- Check 1: Workflow Count ---
$wfDir = ".github/workflows"
$wfFiles = gh api "repos/$Repo/contents/$wfDir" --jq '.[].name' 2>&1
$mdFiles = ($wfFiles | Where-Object { $_ -match '\.md$' -and $_ -ne 'README.md' }).Count
$ymlFiles = ($wfFiles | Where-Object { $_ -match '\.ya?ml$' -and $_ -notmatch '\.lock\.yml$' }).Count
$agenticCount = $mdFiles
$standardCount = $ymlFiles
$totalLogical = $agenticCount + $standardCount

$wfPass = $totalLogical -le 15
$results += [PSCustomObject]@{
    N      = 1
    Check  = "Workflow count"
    Result = if ($wfPass) { [char]0x2705 } else { [char]0x274C }
    Detail = "$totalLogical logical ($agenticCount agentic + $standardCount standard)"
}

# --- Check 2: Label Health ---
$labels = gh label list --repo $Repo --limit 100 --json name --jq '.[].name' 2>&1
$labelCount = ($labels | Measure-Object -Line).Lines
$labelPass = $labelCount -le 25
$results += [PSCustomObject]@{
    N      = 2
    Check  = "Label health"
    Result = if ($labelPass) { [char]0x2705 } else { [char]0x274C }
    Detail = "$labelCount labels (threshold: 25)"
}

# --- Check 3: Issue-PR Harmony ---
$issues = gh issue list --repo $Repo --state open --json number,title,labels 2>&1 | ConvertFrom-Json
$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,updatedAt,body 2>&1 | ConvertFrom-Json

$harmonyFails = @()
$agentIssuePrMap = @{}
foreach ($pr in $prs) {
    $labelNames = @($pr.labels | ForEach-Object { $_.name })
    if ($labelNames -contains "agent:pr") {
        $issueNumber = Get-LinkedIssueNumber -PullRequest $pr
        if ($null -eq $issueNumber) {
            continue
        }
        if (-not $agentIssuePrMap.ContainsKey($issueNumber)) {
            $agentIssuePrMap[$issueNumber] = @()
        }
        $agentIssuePrMap[$issueNumber] += $pr
    }
}
foreach ($i in $issues) {
    $labelNames = $i.labels | ForEach-Object { $_.name }
    $isInProgress = $labelNames -contains "agent:in-progress"
    $isFixable = $labelNames -contains "agent:fixable"

    if ($isInProgress -and $isFixable) {
        $harmonyFails += "Issue #$($i.number) has BOTH agent:in-progress AND agent:fixable"
    }

    if ($isInProgress) {
        $matchingPRs = @($prs | Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq $i.number)
        })
        if ($matchingPRs.Count -eq 0) {
            $harmonyFails += "Issue #$($i.number) (in-progress) has no matching PR"
        } elseif ($matchingPRs.Count -gt 1) {
            $prNumbers = ($matchingPRs | ForEach-Object { "#$($_.number)" }) -join ", "
            $harmonyFails += "Issue #$($i.number) (in-progress) has multiple matching PRs: $prNumbers"
        }
    }
}

foreach ($entry in $agentIssuePrMap.GetEnumerator()) {
    if ($entry.Value.Count -gt 1) {
        $prNumbers = ($entry.Value | ForEach-Object { "#$($_.number)" }) -join ", "
        $harmonyFails += "Issue #$($entry.Key) is split across multiple open agent PRs: $prNumbers"
    }
}

$harmonyPass = $harmonyFails.Count -eq 0
$results += [PSCustomObject]@{
    N      = 3
    Check  = "Issue-PR harmony"
    Result = if ($harmonyPass) { [char]0x2705 } else { [char]0x274C }
    Detail = if ($harmonyPass) { "All consistent" } else { "$($harmonyFails.Count) discrepancy(ies)" }
}

# --- Check 4: Marker Integrity ---
$agentPRs = $prs | Where-Object { @($_.labels | ForEach-Object { $_.name }) -contains "agent:pr" }
$markerIssues = @()
foreach ($pr in $agentPRs) {
    $prDetail = gh pr view $pr.number --repo $Repo --json body,labels 2>&1 | ConvertFrom-Json
    $body = $prDetail.body

    if (-not $body) {
        $markerIssues += "PR #$($pr.number) has empty body"
        continue
    }

    # Check for legacy markers (bad)
    $legacyCount = ([regex]::Matches($body, '<!-- pr-(analyzer|fixer|promoter)')).Count
    if ($legacyCount -gt 0) {
        $markerIssues += "PR #$($pr.number) has $legacyCount legacy markers"
    }

    $cycleLabels = @($prDetail.labels | ForEach-Object { $_.name } | Where-Object { $_ -match '^pr:cycle-\d+$' })
    $currentCycle = if ($cycleLabels.Count -gt 0) {
        ($cycleLabels | ForEach-Object { [int]($_ -replace '^pr:cycle-', '') } | Measure-Object -Maximum).Maximum
    } else {
        0
    }

    $markerA = "[MARKER:sfl-analyzer-a cycle:$($currentCycle)]"
    $markerB = "[MARKER:sfl-analyzer-b cycle:$($currentCycle)]"
    $markerC = "[MARKER:sfl-analyzer-c cycle:$($currentCycle)]"

    $hasA = $body.Contains($markerA)
    $hasB = $body.Contains($markerB)
    $hasC = $body.Contains($markerC)

    if ($hasB -and -not $hasA) {
        $markerIssues += "PR #$($pr.number) has Analyzer B marker without Analyzer A marker for cycle $($currentCycle)"
    }
    if ($hasC -and -not $hasB) {
        $markerIssues += "PR #$($pr.number) has Analyzer C marker without Analyzer B marker for cycle $($currentCycle)"
    }

    $updatedAt = [DateTimeOffset]::Parse($pr.updatedAt)
    $ageMinutes = [math]::Round(([DateTimeOffset]::UtcNow - $updatedAt.ToUniversalTime()).TotalMinutes, 1)
    $stuckThresholdMinutes = 15

    if ($ageMinutes -ge $stuckThresholdMinutes) {
        if ($hasA -and -not $hasB) {
            $markerIssues += "PR #$($pr.number) is stuck after Analyzer A for $ageMinutes minute(s) in cycle $($currentCycle) (missing Analyzer B marker)"
        }
        if ($hasB -and -not $hasC) {
            $markerIssues += "PR #$($pr.number) is stuck after Analyzer B for $ageMinutes minute(s) in cycle $($currentCycle) (missing Analyzer C marker)"
        }
        if ($hasC -and -not $hasRouter) {
            $markerIssues += "PR #$($pr.number) is stuck after Analyzer C for $ageMinutes minute(s) in cycle $($currentCycle) (missing PR Router marker)"
        }
    }
}

$markerPass = $markerIssues.Count -eq 0
$results += [PSCustomObject]@{
    N      = 4
    Check  = "Marker integrity"
    Result = if ($agentPRs.Count -eq 0) { [char]0x2705 } elseif ($markerPass) { [char]0x2705 } else { [char]0x274C }
    Detail = if ($agentPRs.Count -eq 0) { "No agent PRs open" } elseif ($markerPass) { "$($agentPRs.Count) PR(s), markers clean" } else { "$($markerIssues.Count) issue(s)" }
}

# --- Check 5: Model Drift ---
$sflJson = gh api "repos/$Repo/contents/sfl.json" --jq '.content' 2>&1
$sflContent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($sflJson))
$sfl = $sflContent | ConvertFrom-Json
$driftIssues = @()

foreach ($key in ($sfl.models | Get-Member -MemberType NoteProperty).Name) {
    $expected = $sfl.models.$key
    $lockFile = ".github/workflows/$key.lock.yml"
    $lockContent = gh api "repos/$Repo/contents/$lockFile" --jq '.content' 2>$null
    if ($lockContent) {
        $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($lockContent))
        if ($decoded -match 'GH_AW_ENGINE_MODEL:\s*"?([^"\s]+)"?') {
            $actual = $matches[1]
            if ($actual -ne $expected) {
                $driftIssues += "$key : expected=$expected actual=$actual"
            }
        }
    }
}

$driftPass = $driftIssues.Count -eq 0
$results += [PSCustomObject]@{
    N      = 5
    Check  = "Model drift"
    Result = if ($driftPass) { [char]0x2705 } else { [char]0x274C }
    Detail = if ($driftPass) { "All models match sfl.json" } else { "$($driftIssues.Count) drift(s)" }
}

# --- Check 6: Workflow States ---
$expectedActive = @(
    "SFL Auditor"
)
$workflowStates = gh workflow list --all --repo $Repo --json name,state 2>&1 | ConvertFrom-Json
$stateIssues = @()
foreach ($expected in $expectedActive) {
    $wf = $workflowStates | Where-Object { $_.name -eq $expected }
    if ($wf -and $wf.state -ne "active") {
        $stateIssues += "$expected is $($wf.state) (expected active)"
    }
}

$statePass = $stateIssues.Count -eq 0
$results += [PSCustomObject]@{
    N      = 6
    Check  = "Core workflow states"
    Result = if ($statePass) { [char]0x2705 } else { [char]0x274C }
    Detail = if ($statePass) { "Auditor active" } else { "$($stateIssues.Count) issue(s)" }
}

# --- Output Table ---
Write-Host ""
Write-Host ("  {0,-3} {1,-25} {2,-6} {3}" -f "#", "Check", "Result", "Detail") -ForegroundColor White
Write-Host ("  " + ("-" * 70)) -ForegroundColor DarkGray

foreach ($r in $results) {
    $color = if ($r.Result -eq [char]0x2705) { "Green" } else { "Red" }
    Write-Host ("  {0,-3} {1,-25} " -f $r.N, $r.Check) -NoNewline
    Write-Host ("{0,-6} " -f $r.Result) -NoNewline -ForegroundColor $color
    Write-Host $r.Detail
}

# --- Verdict ---
$failures = $results | Where-Object { $_.Result -eq [char]0x274C }
Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host "  Verdict: CLEAN" -ForegroundColor Green
} else {
    Write-Host "  Verdict: PROBLEMS FOUND ($($failures.Count) check(s) failed)" -ForegroundColor Red
    Write-Host ""
    foreach ($f in $failures) {
        Write-Host "  $([char]0x274C) $($f.Check): $($f.Detail)" -ForegroundColor Red
    }
}

# --- Detail sections for failures ---
if ($harmonyFails.Count -gt 0) {
    Write-Host "`n  --- Harmony Failures ---" -ForegroundColor Yellow
    foreach ($hf in $harmonyFails) { Write-Host "    $hf" -ForegroundColor DarkYellow }
}
if ($markerIssues.Count -gt 0) {
    Write-Host "`n  --- Marker Issues ---" -ForegroundColor Yellow
    foreach ($mi in $markerIssues) { Write-Host "    $mi" -ForegroundColor DarkYellow }
}
if ($driftIssues.Count -gt 0) {
    Write-Host "`n  --- Model Drift ---" -ForegroundColor Yellow
    foreach ($di in $driftIssues) { Write-Host "    $di" -ForegroundColor DarkYellow }
}
if ($stateIssues.Count -gt 0) {
    Write-Host "`n  --- Workflow State Issues ---" -ForegroundColor Yellow
    foreach ($si in $stateIssues) { Write-Host "    $si" -ForegroundColor DarkYellow }
}

Write-Host "`n=== HEALTH CHECK COMPLETE ===" -ForegroundColor Cyan
