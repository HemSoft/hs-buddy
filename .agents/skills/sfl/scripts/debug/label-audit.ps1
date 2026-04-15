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
$InformationPreference = 'Continue'
$esc = [char]27

Write-Information "${esc}[36m`n=== LABEL AUDIT ===${esc}[0m"

# --- Get all labels ---
$labels = gh label list --repo $Repo --limit 100 --json name,description,color 2>&1 | ConvertFrom-Json
Write-Information "Total labels: $($labels.Count)"

# --- Group by prefix ---
$categories = @{}
foreach ($l in $labels) {
    $prefix = if ($l.name -match "^([^:]+):") { $matches[1] } else { "_ungrouped" }
    if (-not $categories[$prefix]) { $categories[$prefix] = @() }
    $categories[$prefix] += $l
}

Write-Information "${esc}[33m`n--- LABEL CATEGORIES ---${esc}[0m"
foreach ($cat in ($categories.Keys | Sort-Object)) {
    $count = $categories[$cat].Count
    $catColor = if ($count -gt 5) { '31' } elseif ($count -gt 3) { '33' } else { '32' }
    Write-Information "${esc}[$($catColor)m  $cat ($count):${esc}[0m"
    foreach ($l in $categories[$cat]) {
        $desc = if ($l.description) { " - $($l.description)" } else { "" }
        Write-Information "${esc}[90m    $($l.name)$desc${esc}[0m"
    }
}

# --- Check label usage on open issues/PRs ---
Write-Information "${esc}[33m`n--- LABEL USAGE (open issues + PRs) ---${esc}[0m"
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

Write-Information "${esc}[32m  Labels in use: $($used.Count)${esc}[0m"
$unusedColor = if ($unused.Count -gt 10) { '31' } else { '33' }
Write-Information "${esc}[$($unusedColor)m  Labels unused on open items: $($unused.Count)${esc}[0m"

if ($unused.Count -gt 0) {
    Write-Information "${esc}[90m`n  Unused labels:${esc}[0m"
    foreach ($l in $unused) {
        Write-Information "${esc}[90m    $($l.name)${esc}[0m"
    }
}

# --- Simplification analysis ---
Write-Information "${esc}[35m`n--- SIMPLIFICATION OPPORTUNITIES ---${esc}[0m"

$agentLabels = $categories["agent"]
$riskLabels = $categories["risk"]

if ($agentLabels -and $agentLabels.Count -gt 4) {
    Write-Information "${esc}[33m  OPPORTUNITY: agent: namespace has $($agentLabels.Count) labels.${esc}[0m"
    Write-Information "${esc}[90m    Consider merging low-usage agent labels.${esc}[0m"
}

if ($riskLabels -and $riskLabels.Count -gt 3) {
    Write-Information "${esc}[33m  OPPORTUNITY: risk: namespace has $($riskLabels.Count) labels.${esc}[0m"
    Write-Information "${esc}[90m    Consider reducing to low/medium/high (3 instead of $($riskLabels.Count)).${esc}[0m"
}

# Check for labels that could be combined
$totalCategories = $categories.Keys.Count
if ($totalCategories -gt 6) {
    Write-Information "${esc}[33m  OPPORTUNITY: $totalCategories label categories detected.${esc}[0m"
    Write-Information "${esc}[90m    High category count adds cognitive overhead.${esc}[0m"
    Write-Information "${esc}[90m    Target: 4-5 categories max for a small repo.${esc}[0m"
}

# Overall health score
$score = 100
if ($labels.Count -gt 20) { $score -= 20 }
if ($unused.Count -gt ($labels.Count / 2)) { $score -= 30 }
if ($totalCategories -gt 6) { $score -= 15 }
if ($agentLabels -and $agentLabels.Count -gt 5) { $score -= 10 }

$scoreAnsi = if ($score -ge 80) { '32' } elseif ($score -ge 50) { '33' } else { '31' }
Write-Information "${esc}[$($scoreAnsi)m`n  Label Health Score: $score/100${esc}[0m"

Write-Information "${esc}[36m`n=== LABEL AUDIT COMPLETE ===${esc}[0m"