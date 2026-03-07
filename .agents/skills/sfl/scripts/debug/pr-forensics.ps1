<#
.SYNOPSIS
    Deep forensic analysis of a single PR in the agentic pipeline.
.DESCRIPTION
    Examines a PR's body for markers, checks label state, verifies linked
    issue, and determines why the PR is or isn't progressing.
.PARAMETER PRNumber
    The PR number to investigate.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PRNumber,
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== PR #$PRNumber FORENSICS ===" -ForegroundColor Cyan

# --- Get PR details ---
$pr = gh pr view $PRNumber --repo $Repo --json number,title,isDraft,state,headRefName,labels,body,createdAt,comments 2>&1 | ConvertFrom-Json

Write-Host "Title: $($pr.title)"
Write-Host "State: $($pr.state) $(if ($pr.isDraft) { '(DRAFT)' } else { '(READY)' })"
Write-Host "Branch: $($pr.headRefName)"
Write-Host "Created: $($pr.createdAt)"
$labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
Write-Host "Labels: $labels"

# --- Extract linked issue ---
$issueNum = $null
if ($pr.body -match "Closes #(\d+)") {
    $issueNum = $matches[1]
    Write-Host "Linked Issue: #$issueNum" -ForegroundColor Green
} elseif ($pr.headRefName -match "agent-fix/issue-(\d+)") {
    $issueNum = $matches[1]
    Write-Host "Linked Issue (from branch): #$issueNum" -ForegroundColor Yellow
} else {
    Write-Host "Linked Issue: NONE FOUND" -ForegroundColor Red
}

# --- Check cycle label ---
$cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
if ($cycleLabel) {
    $cycle = [int]($cycleLabel -replace "pr:cycle-", "")
    Write-Host "Current Cycle: $cycle (label: $cycleLabel)" -ForegroundColor Cyan
} else {
    $cycle = 0
    Write-Host "Current Cycle: 0 (no cycle label)" -ForegroundColor Yellow
}

# --- Check markers in PR body ---
Write-Host "`n--- MARKER ANALYSIS (cycle $cycle) ---" -ForegroundColor Yellow
$body = $pr.body

$markerTypes = @(
    @{ Name = "Analyzer A"; Pattern = "[MARKER:sfl-analyzer-a cycle:$cycle]" },
    @{ Name = "Analyzer B"; Pattern = "[MARKER:sfl-analyzer-b cycle:$cycle]" },
    @{ Name = "Analyzer C"; Pattern = "[MARKER:sfl-analyzer-c cycle:$cycle]" },
    @{ Name = "Issue Processor"; Pattern = "[MARKER:sfl-issue-processor cycle:$cycle]" },
    @{ Name = "PR Router";  Pattern = "[MARKER:sfl-pr-router cycle:$cycle]" }
)

# Also check legacy HTML comment markers
$legacyMarkers = @(
    @{ Name = "Analyzer A (legacy)"; Pattern = "<!-- sfl-analyzer-a cycle:$cycle -->" },
    @{ Name = "Analyzer B (legacy)"; Pattern = "<!-- sfl-analyzer-b cycle:$cycle -->" },
    @{ Name = "Analyzer C (legacy)"; Pattern = "<!-- sfl-analyzer-c cycle:$cycle -->" },
    @{ Name = "Fixer (legacy)";      Pattern = "<!-- pr-fixer cycle:$cycle -->" },
    @{ Name = "Promoter (legacy)";   Pattern = "<!-- pr-promoter cycle:$cycle -->" }
)

$foundNew = 0
$foundLegacy = 0

foreach ($m in $markerTypes) {
    if ($body -and $body.Contains($m.Pattern)) {
        Write-Host "  FOUND: $($m.Name) -> $($m.Pattern)" -ForegroundColor Green
        $foundNew++
    } else {
        Write-Host "  MISSING: $($m.Name) -> $($m.Pattern)" -ForegroundColor Red
    }
}

foreach ($m in $legacyMarkers) {
    if ($body -and $body.Contains($m.Pattern)) {
        Write-Host "  FOUND (LEGACY): $($m.Name) -> $($m.Pattern)" -ForegroundColor DarkYellow
        $foundLegacy++
    }
}

if ($foundLegacy -gt 0 -and $foundNew -eq 0) {
    Write-Host "`n  WARNING: Only legacy HTML comment markers found." -ForegroundColor Red
    Write-Host "  The new [MARKER:...] format is not being produced." -ForegroundColor Red
    Write-Host "  This is likely why the PR is stuck." -ForegroundColor Red
}

# --- Check review content in body ---
Write-Host "`n--- REVIEW CONTENT ---" -ForegroundColor Yellow
$analyzerCount = ([regex]::Matches($body, "PR Analysis [ABC]")).Count
Write-Host "  Analyzer review sections found in body: $analyzerCount"
if ($analyzerCount -gt 3) {
    Write-Host "  WARNING: More than 3 reviews — duplicate reviews being appended!" -ForegroundColor Red
    Write-Host "  Body length: $($body.Length) chars" -ForegroundColor DarkGray
}

# --- Check verdicts ---
Write-Host "`n--- VERDICTS ---" -ForegroundColor Yellow
$passCount = ([regex]::Matches($body, "\*\*PASS\*\*")).Count
$blockCount = ([regex]::Matches($body, "\*\*BLOCKING ISSUES FOUND\*\*")).Count
Write-Host "  PASS verdicts: $passCount"
Write-Host "  BLOCKING verdicts: $blockCount"

# --- Check linked issue state ---
if ($issueNum) {
    Write-Host "`n--- LINKED ISSUE #$issueNum ---" -ForegroundColor Yellow
    $issue = gh issue view $issueNum --repo $Repo --json number,title,state,labels 2>&1 | ConvertFrom-Json
    $issueLabels = ($issue.labels | ForEach-Object { $_.name }) -join ", "
    Write-Host "  State: $($issue.state)"
    Write-Host "  Labels: $issueLabels"

    if ($issue.state -eq "OPEN" -and ($issue.labels | ForEach-Object { $_.name }) -contains "agent:in-progress") {
        Write-Host "  Issue<->PR link: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "  Issue<->PR link: BROKEN" -ForegroundColor Red
    }
}

# --- Diagnosis ---
Write-Host "`n--- DIAGNOSIS ---" -ForegroundColor Magenta
if ($foundNew -ge 3 -and $blockCount -eq 0) {
    Write-Host "  All 3 analyzer markers present, no blocking issues." -ForegroundColor Green
    Write-Host "  PR should be progressing to SFL PR Router." -ForegroundColor Green
    if ($pr.isDraft) {
        Write-Host "  PR is still draft — check PR Router and label-actions logs." -ForegroundColor Yellow
    }
} elseif ($foundNew -lt 3 -and $foundLegacy -gt 0) {
    Write-Host "  STUCK: Analyzers are producing legacy markers, not new [MARKER:] format." -ForegroundColor Red
    Write-Host "  FIX: Update analyzer .md prompts and ensure runtime-import picks up changes." -ForegroundColor Yellow
} elseif ($foundNew -lt 3) {
    $missing = $markerTypes | Where-Object { -not $body.Contains($_.Pattern) } | ForEach-Object { $_.Name }
    Write-Host "  WAITING: Missing markers from: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "  These analyzers either haven't run yet or failed to produce markers." -ForegroundColor DarkGray
} elseif ($blockCount -gt 0) {
    Write-Host "  BLOCKED: Analyzer(s) found blocking issues." -ForegroundColor Yellow
    Write-Host "  Issue Processor should address these on the next run." -ForegroundColor DarkGray
}

Write-Host "`n=== FORENSICS COMPLETE ===" -ForegroundColor Cyan
