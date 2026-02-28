<#
.SYNOPSIS
    Inspect PR body structure, detect bloat, and measure content health.
.DESCRIPTION
    Analyzes the raw body of a PR for size, duplicate content,
    structural issues, and provides a health report.
.PARAMETER PRNumber
    The PR number to inspect.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PRNumber,
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== BODY INSPECTION: PR #$PRNumber ===" -ForegroundColor Cyan

$pr = gh pr view $PRNumber --repo $Repo --json number,title,body 2>&1 | ConvertFrom-Json
$body = $pr.body

if (-not $body) {
    Write-Host "PR body is EMPTY." -ForegroundColor Red
    return
}

$lines = $body -split "`n"
$chars = $body.Length

Write-Host "Title: $($pr.title)"
Write-Host "Body size: $chars chars, $($lines.Count) lines"

# Size classification
$sizeClass = if ($chars -gt 50000) { "CRITICAL BLOAT" }
    elseif ($chars -gt 30000) { "SEVERELY BLOATED" }
    elseif ($chars -gt 15000) { "BLOATED" }
    elseif ($chars -gt 5000) { "Large" }
    else { "Healthy" }

$sizeColor = switch ($sizeClass) {
    "CRITICAL BLOAT"    { "Red" }
    "SEVERELY BLOATED"  { "Red" }
    "BLOATED"           { "Yellow" }
    "Large"             { "DarkYellow" }
    "Healthy"           { "Green" }
}
Write-Host "Size class: $sizeClass" -ForegroundColor $sizeColor

# Heading analysis
Write-Host "`n--- HEADING STRUCTURE ---" -ForegroundColor Yellow
$headings = $lines | Where-Object { $_ -match "^#{1,4} " }
$headingCounts = @{}
foreach ($h in $headings) {
    $normalized = $h.Trim()
    $headingCounts[$normalized] = ($headingCounts[$normalized] ?? 0) + 1
}

$duplicateHeadings = $headingCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 }
if ($duplicateHeadings) {
    Write-Host "  DUPLICATE HEADINGS DETECTED:" -ForegroundColor Red
    foreach ($dh in $duplicateHeadings) {
        Write-Host "    $($dh.Value)x: $($dh.Key)" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  No duplicate headings." -ForegroundColor Green
}

# Section analysis
Write-Host "`n--- SECTION ANALYSIS ---" -ForegroundColor Yellow
$sections = @{
    "Analyzer A Reviews" = ([regex]::Matches($body, "(?:PR Analysis A|Analysis: Correctness)")).Count
    "Analyzer B Reviews" = ([regex]::Matches($body, "(?:PR Analysis B|Analysis: Security)")).Count
    "Analyzer C Reviews" = ([regex]::Matches($body, "(?:PR Analysis C|Analysis: Style)")).Count
    "Fix Summaries"      = ([regex]::Matches($body, "(?:Fix Summary|Changes Applied)")).Count
    "Marker Lines"       = ([regex]::Matches($body, "\[MARKER:")).Count
    "Legacy Markers"     = ([regex]::Matches($body, "<!-- pr-(?:analyzer|fixer|promoter)")).Count
    "PASS Verdicts"      = ([regex]::Matches($body, "\*\*PASS\*\*")).Count
    "BLOCK Verdicts"     = ([regex]::Matches($body, "\*\*BLOCKING")).Count
}

foreach ($s in ($sections.GetEnumerator() | Sort-Object Value -Descending)) {
    if ($s.Value -gt 0) {
        $color = if ($s.Value -gt 3) { "Red" } elseif ($s.Value -gt 1) { "Yellow" } else { "Green" }
        Write-Host "  $($s.Key): $($s.Value)" -ForegroundColor $color
    }
}

# Detect repeated blocks (sign of idempotency failure)
Write-Host "`n--- REPETITION DETECTION ---" -ForegroundColor Yellow
$blockSize = 200
$blocks = @{}
for ($i = 0; $i -lt $body.Length - $blockSize; $i += $blockSize) {
    $block = $body.Substring($i, $blockSize)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($block)
    )
    $key = [Convert]::ToBase64String($hash).Substring(0, 16)
    $blocks[$key] = ($blocks[$key] ?? 0) + 1
}

$repeatedBlocks = ($blocks.Values | Where-Object { $_ -gt 1 }).Count
$totalBlocks = $blocks.Count
$repeatPct = if ($totalBlocks -gt 0) { [math]::Round(($repeatedBlocks / $totalBlocks) * 100, 1) } else { 0 }

Write-Host "  Content blocks: $totalBlocks"
Write-Host "  Repeated blocks: $repeatedBlocks ($repeatPct%)" -ForegroundColor $(if ($repeatPct -gt 30) { "Red" } elseif ($repeatPct -gt 10) { "Yellow" } else { "Green" })

if ($repeatPct -gt 20) {
    Write-Host "  HIGH REPETITION: Idempotency is likely failing." -ForegroundColor Red
    Write-Host "  Analyzers are appending duplicate content instead of skipping." -ForegroundColor DarkGray
}

# Health score
$score = 100
if ($chars -gt 30000) { $score -= 30 }
elseif ($chars -gt 15000) { $score -= 15 }
if ($duplicateHeadings) { $score -= ($duplicateHeadings | Measure-Object -Property Value -Sum).Sum * 5 }
if ($repeatPct -gt 20) { $score -= 25 }
if ($sections["Legacy Markers"] -gt 0) { $score -= 10 }

$scoreColor = if ($score -ge 80) { "Green" } elseif ($score -ge 50) { "Yellow" } else { "Red" }
Write-Host "`nBody Health Score: $score/100" -ForegroundColor $scoreColor

Write-Host "`n=== BODY INSPECTION COMPLETE ===" -ForegroundColor Cyan
