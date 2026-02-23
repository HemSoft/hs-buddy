<#
.SYNOPSIS
    Audit GitHub labels for consistency, sprawl, and simplification opportunities.
.DESCRIPTION
    Lists all labels, groups by category, detects orphaned/unused labels,
    and identifies simplification opportunities.
.PARAMETER Repo
    The repo to audit (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== LABEL AUDIT ===" -ForegroundColor Cyan

# --- Get all labels ---
$labels = gh label list --repo $Repo --limit 100 --json name,description,color 2>&1 | ConvertFrom-Json
Write-Host "Total labels: $($labels.Count)"

# --- Group by prefix ---
$categories = @{}
foreach ($l in $labels) {
    $prefix = if ($l.name -match "^([^:]+):") { $matches[1] } else { "_ungrouped" }
    if (-not $categories[$prefix]) { $categories[$prefix] = @() }
    $categories[$prefix] += $l
}

Write-Host "`n--- LABEL CATEGORIES ---" -ForegroundColor Yellow
foreach ($cat in ($categories.Keys | Sort-Object)) {
    $count = $categories[$cat].Count
    $color = if ($count -gt 5) { "Red" } elseif ($count -gt 3) { "Yellow" } else { "Green" }
    Write-Host "  $cat ($count):" -ForegroundColor $color
    foreach ($l in $categories[$cat]) {
        $desc = if ($l.description) { " - $($l.description)" } else { "" }
        Write-Host "    $($l.name)$desc" -ForegroundColor DarkGray
    }
}

# --- Check label usage on open issues/PRs ---
Write-Host "`n--- LABEL USAGE (open issues + PRs) ---" -ForegroundColor Yellow
$issues = gh issue list --repo $Repo --state open --limit 100 --json number,labels 2>&1 | ConvertFrom-Json
$prs = gh pr list --repo $Repo --state open --limit 100 --json number,labels 2>&1 | ConvertFrom-Json

$usedLabels = @{}
foreach ($item in ($issues + $prs)) {
    foreach ($l in $item.labels) {
        $usedLabels[$l.name] = ($usedLabels[$l.name] ?? 0) + 1
    }
}

$unused = $labels | Where-Object { -not $usedLabels[$_.name] }
$used = $labels | Where-Object { $usedLabels[$_.name] }

Write-Host "  Labels in use: $($used.Count)" -ForegroundColor Green
Write-Host "  Labels unused on open items: $($unused.Count)" -ForegroundColor $(if ($unused.Count -gt 10) { "Red" } else { "Yellow" })

if ($unused.Count -gt 0) {
    Write-Host "`n  Unused labels:" -ForegroundColor DarkGray
    foreach ($l in $unused) {
        Write-Host "    $($l.name)" -ForegroundColor DarkGray
    }
}

# --- Simplification analysis ---
Write-Host "`n--- SIMPLIFICATION OPPORTUNITIES ---" -ForegroundColor Magenta

$agentLabels = $categories["agent"]
$prLabels = $categories["pr"]
$riskLabels = $categories["risk"]

if ($agentLabels -and $agentLabels.Count -gt 4) {
    Write-Host "  OPPORTUNITY: agent: namespace has $($agentLabels.Count) labels." -ForegroundColor Yellow
    Write-Host "    Consider merging low-usage agent labels." -ForegroundColor DarkGray
}

if ($riskLabels -and $riskLabels.Count -gt 3) {
    Write-Host "  OPPORTUNITY: risk: namespace has $($riskLabels.Count) labels." -ForegroundColor Yellow
    Write-Host "    Consider reducing to low/medium/high (3 instead of $($riskLabels.Count))." -ForegroundColor DarkGray
}

# Check for labels that could be combined
$totalCategories = $categories.Keys.Count
if ($totalCategories -gt 6) {
    Write-Host "  OPPORTUNITY: $totalCategories label categories detected." -ForegroundColor Yellow
    Write-Host "    High category count adds cognitive overhead." -ForegroundColor DarkGray
    Write-Host "    Target: 4-5 categories max for a small repo." -ForegroundColor DarkGray
}

# Overall health score
$score = 100
if ($labels.Count -gt 20) { $score -= 20 }
if ($unused.Count -gt ($labels.Count / 2)) { $score -= 30 }
if ($totalCategories -gt 6) { $score -= 15 }
if ($agentLabels -and $agentLabels.Count -gt 5) { $score -= 10 }

$scoreColor = if ($score -ge 80) { "Green" } elseif ($score -ge 50) { "Yellow" } else { "Red" }
Write-Host "`n  Label Health Score: $score/100" -ForegroundColor $scoreColor

Write-Host "`n=== LABEL AUDIT COMPLETE ===" -ForegroundColor Cyan
