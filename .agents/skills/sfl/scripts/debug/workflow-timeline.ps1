<#
.SYNOPSIS
    Build a chronological timeline of workflow runs touching a specific PR.
.DESCRIPTION
    Queries GitHub Actions workflow runs and correlates them with a PR
    to show the full lifecycle timeline.
.PARAMETER PRNumber
    The PR number to trace.
.PARAMETER Limit
    Max workflow runs to check per workflow (default: 20).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PRNumber,
    [int]$Limit = 20,
    [string]$Repo = "relias-engineering/hs-buddy"
)

$InformationPreference = 'Continue'
$esc = [char]27
$ansi = @{ 'Red'='91';'Green'='92';'Yellow'='93';'DarkYellow'='33';'DarkGray'='90';'Cyan'='96';'White'='97';'Magenta'='95' }

$ErrorActionPreference = "Stop"

Write-Information "${esc}[96m`n=== WORKFLOW TIMELINE: PR #$PRNumber ===${esc}[0m"

# Get PR branch
$pr = gh pr view $PRNumber --repo $Repo --json headRefName,createdAt,labels,body 2>&1 | ConvertFrom-Json
$branch = $pr.headRefName
Write-Information "PR Branch: $branch"
Write-Information "PR Created: $($pr.createdAt)"

# Pipeline workflows in execution order
$workflows = @(
    "sfl-issue-processor.lock.yml",
    "sfl-analyzer-a.lock.yml",
    "sfl-analyzer-b.lock.yml",
    "sfl-analyzer-c.lock.yml",
    "sfl-pr-label-actions.yml",
    "sfl-auditor.lock.yml"
)

$allRuns = @()

foreach ($wf in $workflows) {
    $shortName = $wf -replace "\.lock\.yml$", ""
    $runs = gh run list --repo $Repo --workflow $wf --limit $Limit --json databaseId,status,conclusion,createdAt,updatedAt,displayTitle,headBranch 2>&1 | ConvertFrom-Json

    foreach ($run in $runs) {
        # Filter: only runs after PR creation and tied to this exact PR branch.
        if ($run.createdAt -ge $pr.createdAt -and $run.headBranch -eq $branch) {
            $allRuns += [PSCustomObject]@{
                Workflow   = $shortName
                RunId      = $run.databaseId
                Status     = $run.status
                Conclusion = $run.conclusion
                StartedAt  = $run.createdAt
                UpdatedAt  = $run.updatedAt
                HeadBranch = $run.headBranch
                Title      = $run.displayTitle
            }
        }
    }
}

# Sort by start time
$sorted = $allRuns | Sort-Object StartedAt

if ($sorted.Count -eq 0) {
    Write-Information "${esc}[93mNo workflow runs found after PR creation.${esc}[0m"
    return
}

Write-Information "`nTimeline ($($sorted.Count) runs since PR creation):`n"

$prevTime = $null
foreach ($run in $sorted) {
    $gap = if ($prevTime) {
        $diff = ([datetime]$run.StartedAt) - ([datetime]$prevTime)
        "  (+$([math]::Round($diff.TotalMinutes, 1))m)"
    } else { "" }

    $conclusionColor = switch ($run.Conclusion) {
        "success"   { "Green" }
        "failure"   { "Red" }
        "cancelled" { "DarkYellow" }
        default     { "White" }
    }

    $statusStr = if ($run.Status -eq "completed") { $run.Conclusion } else { $run.Status }
    Write-Information "  $($run.StartedAt) | ${esc}[96m$($run.Workflow.PadRight(20))${esc}[0m | ${esc}[$($ansi[$conclusionColor])m$statusStr${esc}[0m$gap"

    $prevTime = $run.StartedAt
}

# Summary by workflow
Write-Information "${esc}[93m`n--- RUN COUNTS ---${esc}[0m"
$grouped = $sorted | Group-Object Workflow | Sort-Object Count -Descending
foreach ($g in $grouped) {
    $successes = ($g.Group | Where-Object { $_.Conclusion -eq "success" }).Count
    $failures = ($g.Group | Where-Object { $_.Conclusion -eq "failure" }).Count
    Write-Information ("${esc}[$($ansi[$(if ($failures -gt 0) { 'Yellow' } else { 'Green' })])m  $($g.Name): $($g.Count) runs ($successes ok, $failures failed)${esc}[0m")
}

# Detect patterns
Write-Information "${esc}[95m`n--- PATTERN DETECTION ---${esc}[0m"
$analyzerRuns = $sorted | Where-Object { $_.Workflow -match "sfl-analyzer-[abc]" }
if ($analyzerRuns.Count -gt 9) {
    Write-Information "${esc}[91m  WARNING: $($analyzerRuns.Count) analyzer runs detected.${esc}[0m"
    Write-Information "${esc}[91m  This suggests analyzers are re-running without progression.${esc}[0m"
    Write-Information "${esc}[93m  Check marker output in PR body.${esc}[0m"
}

$labelActionsRuns = $sorted | Where-Object { $_.Workflow -eq "sfl-pr-label-actions" }
if ($labelActionsRuns.Count -eq 0 -and $analyzerRuns.Count -ge 3) {
    Write-Information "${esc}[91m  WARNING: Analyzer chain completed but label-actions has not run.${esc}[0m"
    Write-Information "${esc}[93m  Check explicit Analyzer C -> label-actions dispatch.${esc}[0m"
}
if ($labelActionsRuns.Count -gt 0 -and $analyzerRuns.Count -gt 3) {
    Write-Information "${esc}[93m  WARNING: Multiple analyzer runs detected for one PR cycle.${esc}[0m"
    Write-Information "${esc}[93m  Check marker output and Analyzer A handoff idempotency.${esc}[0m"
}

$prBody = $pr.body
$cycleMatches = $pr.labels | ForEach-Object { $_.name } | Where-Object { $_ -match '^pr:cycle-(\d+)$' }
$currentCycle = 0
if ($cycleMatches.Count -gt 0) {
    $currentCycle = ($cycleMatches | ForEach-Object { [int]($_ -replace '^pr:cycle-', '') } | Measure-Object -Maximum).Maximum
}

$analyzerCMarker = "<!-- MARKER:sfl-analyzer-c cycle:$currentCycle -->"

if ($prBody.Contains($analyzerCMarker) -and $labelActionsRuns.Count -eq 0) {
    Write-Information "${esc}[91m  WARNING: Analyzer C completed for cycle $currentCycle but label-actions has not run.${esc}[0m"
    Write-Information "${esc}[93m  This usually means Analyzer C wrote review state but did not emit dispatch_workflow to sfl-pr-label-actions.${esc}[0m"
}

$latestAnalyzerC = $sorted | Where-Object { $_.Workflow -eq "sfl-analyzer-c" } | Sort-Object StartedAt -Descending | Select-Object -First 1
$latestLabelActions = $sorted | Where-Object { $_.Workflow -eq "sfl-pr-label-actions" } | Sort-Object StartedAt -Descending | Select-Object -First 1
if ($latestAnalyzerC -and $latestLabelActions) {
    if ([datetime]$latestAnalyzerC.StartedAt -gt [datetime]$latestLabelActions.StartedAt) {
        Write-Information "${esc}[91m  WARNING: Latest Analyzer C run is newer than latest label-actions run.${esc}[0m"
        Write-Information "${esc}[93m  The post-Analyzer-C handoff appears stuck on the current cycle.${esc}[0m"
    }
}

Write-Information "${esc}[96m`n=== TIMELINE COMPLETE ===${esc}[0m"
