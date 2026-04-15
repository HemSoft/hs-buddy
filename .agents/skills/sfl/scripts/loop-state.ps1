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

$InformationPreference = 'Continue'
$esc = [char]27
$Blue    = "${esc}[34m"
$Cyan    = "${esc}[36m"
$DGray    = "${esc}[90m"
$Green    = "${esc}[32m"
$White    = "${esc}[37m"
$Yellow    = "${esc}[33m"
$Reset   = "${esc}[0m"

Write-Information "${Cyan}`n=== SFL LOOP STATE ===${Reset}"
Write-Information "Repo: $Repo"
Write-Information "Time: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) (local)"

# --- Queued Work ---
Write-Information "${Yellow}`n--- QUEUED (agent:fixable) ---${Reset}"
$fixable = gh issue list --repo $Repo --state open --label "agent:fixable" --json number,title,createdAt,labels 2>&1 | ConvertFrom-Json
if ($fixable -and $fixable.Count -gt 0) {
    foreach ($i in ($fixable | Sort-Object { $_.createdAt })) {
        $age = ([DateTime]::UtcNow - [DateTime]::Parse($i.createdAt))
        $ageStr = if ($age.TotalDays -ge 1) { "{0:N0}d" -f $age.TotalDays } else { "{0:N0}h" -f $age.TotalHours }
        $labelNames = ($i.labels | ForEach-Object { $_.name }) -join ", "
        Write-Information "${White}  #$($i.number) ($ageStr old) $($i.title)${Reset}"
        Write-Information "${DGray}    Labels: $labelNames${Reset}"
    }
    Write-Information "${Cyan}  Total queued: $($fixable.Count)${Reset}"
} else {
    Write-Information "${Green}  Queue empty — no agent:fixable issues.${Reset}"
}

# --- In Progress ---
Write-Information "${Yellow}`n--- IN PROGRESS (agent:in-progress) ---${Reset}"
$inProgress = gh issue list --repo $Repo --state open --label "agent:in-progress" --json number,title,createdAt 2>&1 | ConvertFrom-Json
if ($inProgress -and $inProgress.Count -gt 0) {
    foreach ($i in $inProgress) {
        $age = ([DateTime]::UtcNow - [DateTime]::Parse($i.createdAt))
        $ageStr = if ($age.TotalDays -ge 1) { "{0:N0}d" -f $age.TotalDays } else { "{0:N0}h" -f $age.TotalHours }
        Write-Information "${Blue}  #$($i.number) ($ageStr old) $($i.title)${Reset}"
    }
} else {
    Write-Information "${Green}  Nothing in progress.${Reset}"
}

# --- Draft PRs (agent:pr) ---
Write-Information "${Yellow}`n--- DRAFT PRS (in the loop) ---${Reset}"
$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,body,createdAt 2>&1 | ConvertFrom-Json
$agentPRs = $prs | Where-Object { ($_.labels | ForEach-Object { $_.name }) -contains "agent:pr" }

if ($agentPRs -and $agentPRs.Count -gt 0) {
    foreach ($pr in $agentPRs) {
        $draft = if ($pr.isDraft) { "DRAFT" } else { "READY" }
        $cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
        $cycle = if ($cycleLabel) { $cycleLabel -replace "pr:cycle-", "" } else { "0" }

        $prColor = if ($pr.isDraft) { $Yellow } else { $Green }
        Write-Information "${prColor}  PR #$($pr.number) [$draft] cycle:$cycle — $($pr.title)${Reset}"

        # Check analyzer markers for current cycle
        $body = $pr.body
        if ($body) {
            $analyzerA = $body.Contains("<!-- MARKER:sfl-analyzer-a cycle:$cycle -->")
            $analyzerB = $body.Contains("<!-- MARKER:sfl-analyzer-b cycle:$cycle -->")
            $analyzerC = $body.Contains("<!-- MARKER:sfl-analyzer-c cycle:$cycle -->")
            $issueProcessor = $body.Contains("<!-- MARKER:sfl-issue-processor cycle:$cycle -->")

            $aIcon = if ($analyzerA) { [char]0x2705 } else { [char]0x23F3 }
            $bIcon = if ($analyzerB) { [char]0x2705 } else { [char]0x23F3 }
            $cIcon = if ($analyzerC) { [char]0x2705 } else { [char]0x23F3 }
            $iIcon = if ($issueProcessor) { [char]0x2705 } else { [char]0x23F3 }

            Write-Information "${DGray}    Cycle ${cycle}: A=$aIcon B=$bIcon C=$cIcon Implementer=$iIcon${Reset}"

            # Check verdicts
            if ($analyzerA -and $analyzerB -and $analyzerC) {
                $passCount = 0
                if ($body -match "(?s)<!-- MARKER:sfl-analyzer-a cycle:$cycle -->.*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }
                if ($body -match "(?s)<!-- MARKER:sfl-analyzer-b cycle:$cycle -->.*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }
                if ($body -match "(?s)<!-- MARKER:sfl-analyzer-c cycle:$cycle -->.*?\*\*(PASS|BLOCKING)") { if ($matches[1] -eq "PASS") { $passCount++ } }

                $vColor = if ($passCount -eq 3) { $Green } elseif ($passCount -ge 1) { $Yellow } else { $Red }
                Write-Information "${vColor}    Verdicts: $passCount/3 PASS${Reset}"

                if ($passCount -lt 3) {
                    Write-Information "${Cyan}    Status: Waiting for implementation feedback to route${Reset}"
                } elseif (-not $router) {
                    Write-Information "${Cyan}    Status: Waiting for PR Router${Reset}"
                } else {
                    Write-Information "${Green}    Status: Ready for human review handoff${Reset}"
                }
            } else {
                Write-Information "${DGray}    Status: Waiting for analyzer(s)${Reset}"
            }
        }
    }
} else {
    Write-Information "${Green}  No agent PRs in the loop.${Reset}"
}

# --- Ready for Human Review ---
Write-Information "${Yellow}`n--- READY FOR HUMAN REVIEW ---${Reset}"
$readyForReview = $prs | Where-Object {
    -not $_.isDraft -and
    ($_.labels | ForEach-Object { $_.name }) -contains "human:ready-for-review"
}
if ($readyForReview -and $readyForReview.Count -gt 0) {
    foreach ($pr in $readyForReview) {
        Write-Information "${Green}  PR #$($pr.number) $($pr.title)${Reset}"
    }
} else {
    Write-Information "${DGray}  None awaiting human review.${Reset}"
}

# --- Summary ---
Write-Information "${Cyan}`n--- PIPELINE SUMMARY ---${Reset}"
$queueCount = if ($fixable) { $fixable.Count } else { 0 }
$progressCount = if ($inProgress) { $inProgress.Count } else { 0 }
$draftCount = if ($agentPRs) { ($agentPRs | Where-Object { $_.isDraft }).Count } else { 0 }
$reviewCount = if ($readyForReview) { $readyForReview.Count } else { 0 }

Write-Information "  Queued:           $queueCount issue(s)"
Write-Information "  In Progress:      $progressCount issue(s)"
Write-Information "  Draft PRs:        $draftCount"
Write-Information "  Ready for Review: $reviewCount"

$total = $queueCount + $progressCount + $draftCount + $reviewCount
if ($total -eq 0) {
    Write-Information "${Green}`n  Pipeline is IDLE — no work in any stage.${Reset}"
} else {
    Write-Information "${Yellow}`n  Pipeline has $total item(s) across all stages.${Reset}"
}

Write-Information "${Cyan}`n=== LOOP STATE COMPLETE ===${Reset}"
