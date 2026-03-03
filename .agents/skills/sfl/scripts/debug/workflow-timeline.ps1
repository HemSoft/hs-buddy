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
$pr = gh pr view $PRNumber --repo $Repo --json headRefName,createdAt 2>&1 | ConvertFrom-Json
$branch = $pr.headRefName
Write-Host "PR Branch: $branch"
Write-Host "PR Created: $($pr.createdAt)"

# Pipeline workflows in execution order
$workflows = @(
    "sfl-issue-processor.lock.yml",
    "sfl-analyzer-a.lock.yml",
    "sfl-analyzer-b.lock.yml",
    "sfl-analyzer-c.lock.yml",
    "pr-fixer.lock.yml",
    "pr-promoter.lock.yml",
    "sfl-auditor.lock.yml"
)

$allRuns = @()

foreach ($wf in $workflows) {
    $shortName = $wf -replace "\.lock\.yml$", ""
    $runs = gh run list --repo $Repo --workflow $wf --limit $Limit --json databaseId,status,conclusion,createdAt,updatedAt,displayTitle 2>&1 | ConvertFrom-Json

    foreach ($run in $runs) {
        # Filter: only runs after PR creation
        if ($run.createdAt -ge $pr.createdAt) {
            $allRuns += [PSCustomObject]@{
                Workflow   = $shortName
                RunId      = $run.databaseId
                Status     = $run.status
                Conclusion = $run.conclusion
                StartedAt  = $run.createdAt
                UpdatedAt  = $run.updatedAt
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
$analyzerRuns = $sorted | Where-Object { $_.Workflow -match "pr-analyzer" }
if ($analyzerRuns.Count -gt 9) {
    Write-Host "  WARNING: $($analyzerRuns.Count) analyzer runs detected." -ForegroundColor Red
    Write-Host "  This suggests analyzers are re-running without progression." -ForegroundColor Red
    Write-Host "  Check marker output in PR body." -ForegroundColor Yellow
}

$fixerRuns = $sorted | Where-Object { $_.Workflow -eq "pr-fixer" }
$promoterRuns = $sorted | Where-Object { $_.Workflow -eq "pr-promoter" }
if ($fixerRuns.Count -eq 0 -and $analyzerRuns.Count -gt 3) {
    Write-Host "  WARNING: Analyzers have run $($analyzerRuns.Count)x but Fixer has not run." -ForegroundColor Red
    Write-Host "  Fixer may not be finding the markers it needs." -ForegroundColor Yellow
}
if ($promoterRuns.Count -eq 0 -and $fixerRuns.Count -gt 0) {
    Write-Host "  INFO: Fixer has run but Promoter has not. Expected if fixes are pending." -ForegroundColor DarkGray
}

Write-Host "`n=== TIMELINE COMPLETE ===" -ForegroundColor Cyan
