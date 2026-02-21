<#
.SYNOPSIS
    Full ecosystem snapshot — issues, PRs, labels, recent workflow runs.
.DESCRIPTION
    Produces a structured overview of the current state of the hs-buddy
    agentic loop. Use as the first step in any debug session.
#>
[CmdletBinding()]
param(
    [string]$Repo = "HemSoft/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== ECOSYSTEM SNAPSHOT ===" -ForegroundColor Cyan
Write-Host "Repo: $Repo"
Write-Host "Time: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) (local) / $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')) (UTC)"
Write-Host ""

# --- Issues ---
Write-Host "--- OPEN ISSUES WITH AGENT LABELS ---" -ForegroundColor Yellow
$issues = gh issue list --repo $Repo --state open --json number,title,labels,createdAt --jq '.[] | select(.labels | map(.name) | any(startswith("agent:")))' 2>&1 | ConvertFrom-Json
if ($issues) {
    foreach ($i in $issues) {
        $labels = ($i.labels | ForEach-Object { $_.name }) -join ", "
        Write-Host "  #$($i.number) $($i.title)"
        Write-Host "    Labels: $labels" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  No active agent issues." -ForegroundColor Green
}

# --- PRs ---
Write-Host "`n--- OPEN PULL REQUESTS ---" -ForegroundColor Yellow
$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,createdAt 2>&1 | ConvertFrom-Json
if ($prs) {
    foreach ($pr in $prs) {
        $labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
        $draft = if ($pr.isDraft) { "(DRAFT)" } else { "(READY)" }
        Write-Host "  PR #$($pr.number) $draft $($pr.title)"
        Write-Host "    Branch: $($pr.headRefName)" -ForegroundColor DarkGray
        Write-Host "    Labels: $labels" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  No open PRs." -ForegroundColor Green
}

# --- Label Count ---
Write-Host "`n--- LABEL METRICS ---" -ForegroundColor Yellow
$labelCount = (gh label list --repo $Repo --json name --jq '.[].name' 2>&1 | Measure-Object -Line).Lines
$color = if ($labelCount -le 20) { "Green" } elseif ($labelCount -le 25) { "Yellow" } else { "Red" }
Write-Host "  Total labels: $labelCount" -ForegroundColor $color
if ($labelCount -gt 25) {
    Write-Host "  WARNING: Label count exceeds recommended maximum of 25!" -ForegroundColor Red
}

# --- Harmony Check ---
Write-Host "`n--- HARMONY CHECK ---" -ForegroundColor Yellow
$harmony = $true

# Check: every in-progress issue has a PR
foreach ($i in $issues) {
    $isInProgress = ($i.labels | ForEach-Object { $_.name }) -contains "agent:in-progress"
    if ($isInProgress) {
        $num = $i.number
        $matchingPR = $prs | Where-Object { $_.headRefName -match "agent-fix/issue-$num-" }
        if (-not $matchingPR) {
            Write-Host "  FAIL: Issue #$num (agent:in-progress) has no matching PR" -ForegroundColor Red
            $harmony = $false
        } else {
            Write-Host "  OK: Issue #$num -> PR #$($matchingPR.number)" -ForegroundColor Green
        }
    }
}

# Check: no issue has both in-progress and fixable
foreach ($i in $issues) {
    $labelNames = $i.labels | ForEach-Object { $_.name }
    if (($labelNames -contains "agent:in-progress") -and ($labelNames -contains "agent:fixable")) {
        Write-Host "  FAIL: Issue #$($i.number) has BOTH agent:in-progress AND agent:fixable" -ForegroundColor Red
        $harmony = $false
    }
}

if ($harmony) {
    Write-Host "  All harmony checks passed." -ForegroundColor Green
}

# --- Recent Workflow Runs ---
Write-Host "`n--- RECENT WORKFLOW RUNS (last 2 hours) ---" -ForegroundColor Yellow
$since = [DateTime]::UtcNow.AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$workflows = @(
    "sfl-auditor.lock.yml",
    "issue-processor.lock.yml",
    "repo-audit.lock.yml",
    "pr-analyzer-a.lock.yml",
    "pr-analyzer-b.lock.yml",
    "pr-analyzer-c.lock.yml",
    "pr-fixer.lock.yml",
    "pr-promoter.lock.yml"
)
foreach ($w in $workflows) {
    $shortName = $w -replace '\.lock\.yml$', ''
    $runs = gh run list --repo $Repo --workflow $w --limit 10 --json databaseId,status,conclusion,createdAt 2>&1 | ConvertFrom-Json | Where-Object { $_.createdAt -ge $since }
    $total = ($runs | Measure-Object).Count
    $failures = $runs | Where-Object { $_.conclusion -and $_.conclusion -ne "success" }
    $failCount = ($failures | Measure-Object).Count
    $inProgress = $runs | Where-Object { -not $_.conclusion }
    $ipCount = ($inProgress | Measure-Object).Count

    $status = if ($total -eq 0) { "(no runs)" } elseif ($failCount -gt 0) { "$failCount FAILED" } else { "all success" }
    $color = if ($failCount -gt 0) { "Red" } elseif ($total -eq 0) { "DarkGray" } else { "Green" }
    $extra = if ($ipCount -gt 0) { " +${ipCount} in-progress" } else { "" }
    Write-Host "  ${shortName}: $total runs, $status$extra" -ForegroundColor $color
}

Write-Host "`n=== SNAPSHOT COMPLETE ===" -ForegroundColor Cyan
