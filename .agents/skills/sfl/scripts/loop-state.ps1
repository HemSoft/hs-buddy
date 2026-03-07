#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Shows the current state of the SFL loop — what's being processed right now.
.DESCRIPTION
    Displays all items currently in the pipeline: issues being worked on,
    PRs in progress, and their current cycle/review state.
.PARAMETER Repo
    The repo to inspect (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== SFL LOOP STATE ===" -ForegroundColor Cyan
Write-Host "Repo: $Repo"
Write-Host "Time: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) (local)"

# --- Queued Work ---
Write-Host "`n--- QUEUED (agent:fixable) ---" -ForegroundColor Yellow
$fixable = gh issue list --repo $Repo --state open --label "agent:fixable" --json number,title,createdAt,labels 2>&1 | ConvertFrom-Json
if ($fixable -and $fixable.Count -gt 0) {
    foreach ($i in ($fixable | Sort-Object { $_.createdAt })) {
        $age = ([DateTime]::UtcNow - [DateTime]::Parse($i.createdAt))
        $ageStr = if ($age.TotalDays -ge 1) { "{0:N0}d" -f $age.TotalDays } else { "{0:N0}h" -f $age.TotalHours }
        $labelNames = ($i.labels | ForEach-Object { $_.name }) -join ", "
        Write-Host "  #$($i.number) ($ageStr old) $($i.title)" -ForegroundColor White
        Write-Host "    Labels: $labelNames" -ForegroundColor DarkGray
    }
    Write-Host "  Total queued: $($fixable.Count)" -ForegroundColor Cyan
} else {
    Write-Host "  Queue empty — no agent:fixable issues." -ForegroundColor Green
}

# --- In Progress ---
Write-Host "`n--- IN PROGRESS (agent:in-progress) ---" -ForegroundColor Yellow
$inProgress = gh issue list --repo $Repo --state open --label "agent:in-progress" --json number,title,createdAt 2>&1 | ConvertFrom-Json
if ($inProgress -and $inProgress.Count -gt 0) {
    foreach ($i in $inProgress) {
        $age = ([DateTime]::UtcNow - [DateTime]::Parse($i.createdAt))
        $ageStr = if ($age.TotalDays -ge 1) { "{0:N0}d" -f $age.TotalDays } else { "{0:N0}h" -f $age.TotalHours }
        Write-Host "  #$($i.number) ($ageStr old) $($i.title)" -ForegroundColor Blue
    }
} else {
    Write-Host "  Nothing in progress." -ForegroundColor Green
}

# --- Draft PRs (agent:pr) ---
Write-Host "`n--- DRAFT PRS (in the loop) ---" -ForegroundColor Yellow
$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,body,createdAt 2>&1 | ConvertFrom-Json
$agentPRs = $prs | Where-Object { ($_.labels | ForEach-Object { $_.name }) -contains "agent:pr" }

if ($agentPRs -and $agentPRs.Count -gt 0) {
    foreach ($pr in $agentPRs) {
        $draft = if ($pr.isDraft) { "DRAFT" } else { "READY" }
        $cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
        $cycle = if ($cycleLabel) { $cycleLabel -replace "pr:cycle-", "" } else { "0" }

        Write-Host "  PR #$($pr.number) [$draft] cycle:$cycle — $($pr.title)" -ForegroundColor $(if ($pr.isDraft) { "Yellow" } else { "Green" })

        # Check analyzer markers for current cycle
        $body = $pr.body
        if ($body) {
            $analyzerA = $body.Contains("[MARKER:sfl-analyzer-a cycle:$cycle]")
            $analyzerB = $body.Contains("[MARKER:sfl-analyzer-b cycle:$cycle]")
            $analyzerC = $body.Contains("[MARKER:sfl-analyzer-c cycle:$cycle]")
            $issueProcessor = $body.Contains("[MARKER:sfl-issue-processor cycle:$cycle]")
            $router = $body.Contains("[MARKER:sfl-pr-router cycle:$cycle]")

            $aIcon = if ($analyzerA) { [char]0x2705 } else { [char]0x23F3 }
            $bIcon = if ($analyzerB) { [char]0x2705 } else { [char]0x23F3 }
            $cIcon = if ($analyzerC) { [char]0x2705 } else { [char]0x23F3 }
            $iIcon = if ($issueProcessor) { [char]0x2705 } else { [char]0x23F3 }
            $rIcon = if ($router) { [char]0x2705 } else { [char]0x23F3 }

            Write-Host "    Cycle $cycle: A=$aIcon B=$bIcon C=$cIcon Router=$rIcon Implementer=$iIcon" -ForegroundColor DarkGray

            # Check verdicts
            if ($analyzerA -and $analyzerB -and $analyzerC) {
                $passCount = 0
                if ($body -match "(?s)\[MARKER:sfl-analyzer-a cycle:$cycle\].*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }
                if ($body -match "(?s)\[MARKER:sfl-analyzer-b cycle:$cycle\].*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }
                if ($body -match "(?s)\[MARKER:sfl-analyzer-c cycle:$cycle\].*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }

                Write-Host "    Verdicts: $passCount/3 PASS" -ForegroundColor $(if ($passCount -eq 3) { "Green" } elseif ($passCount -ge 1) { "Yellow" } else { "Red" })

                if ($passCount -lt 3) {
                    Write-Host "    Status: Waiting for implementation feedback to route" -ForegroundColor Cyan
                } elseif (-not $router) {
                    Write-Host "    Status: Waiting for PR Router" -ForegroundColor Cyan
                } else {
                    Write-Host "    Status: Ready for human review handoff" -ForegroundColor Green
                }
            } else {
                Write-Host "    Status: Waiting for analyzer(s)" -ForegroundColor DarkGray
            }
        }
    }
} else {
    Write-Host "  No agent PRs in the loop." -ForegroundColor Green
}

# --- Ready for Human Review ---
Write-Host "`n--- READY FOR HUMAN REVIEW ---" -ForegroundColor Yellow
$readyForReview = $prs | Where-Object {
    -not $_.isDraft -and
    ($_.labels | ForEach-Object { $_.name }) -contains "human:ready-for-review"
}
if ($readyForReview -and $readyForReview.Count -gt 0) {
    foreach ($pr in $readyForReview) {
        Write-Host "  PR #$($pr.number) $($pr.title)" -ForegroundColor Green
    }
} else {
    Write-Host "  None awaiting human review." -ForegroundColor DarkGray
}

# --- Summary ---
Write-Host "`n--- PIPELINE SUMMARY ---" -ForegroundColor Cyan
$queueCount = if ($fixable) { $fixable.Count } else { 0 }
$progressCount = if ($inProgress) { $inProgress.Count } else { 0 }
$draftCount = if ($agentPRs) { ($agentPRs | Where-Object { $_.isDraft }).Count } else { 0 }
$reviewCount = if ($readyForReview) { $readyForReview.Count } else { 0 }

Write-Host "  Queued:           $queueCount issue(s)"
Write-Host "  In Progress:      $progressCount issue(s)"
Write-Host "  Draft PRs:        $draftCount"
Write-Host "  Ready for Review: $reviewCount"

$total = $queueCount + $progressCount + $draftCount + $reviewCount
if ($total -eq 0) {
    Write-Host "`n  Pipeline is IDLE — no work in any stage." -ForegroundColor Green
} else {
    Write-Host "`n  Pipeline has $total item(s) across all stages." -ForegroundColor Yellow
}

Write-Host "`n=== LOOP STATE COMPLETE ===" -ForegroundColor Cyan
