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

$ErrorActionPreference = "Stop"

Write-Host "`n=== WORKFLOW TIMELINE: PR #$PRNumber ===" -ForegroundColor Cyan

# Get PR branch
$pr = gh pr view $PRNumber --repo $Repo --json headRefName,createdAt,labels,body 2>&1 | ConvertFrom-Json
$branch = $pr.headRefName
Write-Host "PR Branch: $branch"
Write-Host "PR Created: $($pr.createdAt)"

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
    Write-Host "No workflow runs found after PR creation." -ForegroundColor Yellow
    return
}

Write-Host "`nTimeline ($($sorted.Count) runs since PR creation):`n"

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
    Write-Host "  $($run.StartedAt) | " -NoNewline
    Write-Host "$($run.Workflow.PadRight(20))" -NoNewline -ForegroundColor Cyan
    Write-Host " | $statusStr" -NoNewline -ForegroundColor $conclusionColor
    Write-Host "$gap"

    $prevTime = $run.StartedAt
}

# Summary by workflow
Write-Host "`n--- RUN COUNTS ---" -ForegroundColor Yellow
$grouped = $sorted | Group-Object Workflow | Sort-Object Count -Descending
foreach ($g in $grouped) {
    $successes = ($g.Group | Where-Object { $_.Conclusion -eq "success" }).Count
    $failures = ($g.Group | Where-Object { $_.Conclusion -eq "failure" }).Count
    Write-Host "  $($g.Name): $($g.Count) runs ($successes ok, $failures failed)" -ForegroundColor $(if ($failures -gt 0) { "Yellow" } else { "Green" })
}

# Detect patterns
Write-Host "`n--- PATTERN DETECTION ---" -ForegroundColor Magenta
$analyzerRuns = $sorted | Where-Object { $_.Workflow -match "sfl-analyzer-[abc]" }
if ($analyzerRuns.Count -gt 9) {
    Write-Host "  WARNING: $($analyzerRuns.Count) analyzer runs detected." -ForegroundColor Red
    Write-Host "  This suggests analyzers are re-running without progression." -ForegroundColor Red
    Write-Host "  Check marker output in PR body." -ForegroundColor Yellow
}

$labelActionsRuns = $sorted | Where-Object { $_.Workflow -eq "sfl-pr-label-actions" }
if ($labelActionsRuns.Count -eq 0 -and $analyzerRuns.Count -ge 3) {
    Write-Host "  WARNING: Analyzer chain completed but label-actions has not run." -ForegroundColor Red
    Write-Host "  Check explicit Analyzer C -> label-actions dispatch." -ForegroundColor Yellow
}
if ($labelActionsRuns.Count -gt 0 -and $analyzerRuns.Count -gt 3) {
    Write-Host "  WARNING: Multiple analyzer runs detected for one PR cycle." -ForegroundColor Yellow
    Write-Host "  Check marker output and Analyzer A handoff idempotency." -ForegroundColor Yellow
}

$prBody = $pr.body
$cycleMatches = $pr.labels | ForEach-Object { $_.name } | Where-Object { $_ -match '^pr:cycle-(\d+)$' }
$currentCycle = 0
if ($cycleMatches.Count -gt 0) {
    $currentCycle = ($cycleMatches | ForEach-Object { [int]($_ -replace '^pr:cycle-', '') } | Measure-Object -Maximum).Maximum
}

$analyzerCMarker = "[MARKER:sfl-analyzer-c cycle:$currentCycle]"

if ($prBody.Contains($analyzerCMarker) -and $labelActionsRuns.Count -eq 0) {
    Write-Host "  WARNING: Analyzer C completed for cycle $currentCycle but label-actions has not run." -ForegroundColor Red
    Write-Host "  This usually means Analyzer C wrote review state but did not emit dispatch_workflow to sfl-pr-label-actions." -ForegroundColor Yellow
}

$latestAnalyzerC = $sorted | Where-Object { $_.Workflow -eq "sfl-analyzer-c" } | Sort-Object StartedAt -Descending | Select-Object -First 1
$latestLabelActions = $sorted | Where-Object { $_.Workflow -eq "sfl-pr-label-actions" } | Sort-Object StartedAt -Descending | Select-Object -First 1
if ($latestAnalyzerC -and $latestLabelActions) {
    if ([datetime]$latestAnalyzerC.StartedAt -gt [datetime]$latestLabelActions.StartedAt) {
        Write-Host "  WARNING: Latest Analyzer C run is newer than latest label-actions run." -ForegroundColor Red
        Write-Host "  The post-Analyzer-C handoff appears stuck on the current cycle." -ForegroundColor Yellow
    }
}

Write-Host "`n=== TIMELINE COMPLETE ===" -ForegroundColor Cyan
