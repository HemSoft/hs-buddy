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

$InformationPreference = 'Continue'
$esc = [char]27
$ansi = @{ 'Red'='91';'Green'='92';'Yellow'='93';'DarkYellow'='33';'DarkGray'='90';'Cyan'='96';'White'='97';'Magenta'='95' }

$ErrorActionPreference = "Stop"

Write-Information "${esc}[96m`n=== BODY INSPECTION: PR #$PRNumber ===${esc}[0m"

$pr = gh pr view $PRNumber --repo $Repo --json number,title,body 2>&1 | ConvertFrom-Json
$body = $pr.body

if (-not $body) {
    Write-Information "${esc}[91mPR body is EMPTY.${esc}[0m"
    return
}

$lines = $body -split "`n"
$chars = $body.Length

Write-Information "Title: $($pr.title)"
Write-Information "Body size: $chars chars, $($lines.Count) lines"

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
Write-Information "${esc}[$($ansi[$sizeColor])mSize class: $sizeClass${esc}[0m"

# Heading analysis
Write-Information "${esc}[93m`n--- HEADING STRUCTURE ---${esc}[0m"
$headings = $lines | Where-Object { $_ -match "^#{1,4} " }
$headingCounts = @{}
foreach ($h in $headings) {
    $normalized = $h.Trim()
    $headingCounts[$normalized] = ($headingCounts[$normalized] ?? 0) + 1
}

$duplicateHeadings = $headingCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 }
if ($duplicateHeadings) {
    Write-Information "${esc}[91m  DUPLICATE HEADINGS DETECTED:${esc}[0m"
    foreach ($dh in $duplicateHeadings) {
        Write-Information "${esc}[33m    $($dh.Value)x: $($dh.Key)${esc}[0m"
    }
} else {
    Write-Information "${esc}[92m  No duplicate headings.${esc}[0m"
}

# Section analysis
Write-Information "${esc}[93m`n--- SECTION ANALYSIS ---${esc}[0m"
$sections = @{
    "Analyzer A Reviews" = ([regex]::Matches($body, "(?:PR Analysis A|Analysis: Correctness)")).Count
    "Analyzer B Reviews" = ([regex]::Matches($body, "(?:PR Analysis B|Analysis: Security)")).Count
    "Analyzer C Reviews" = ([regex]::Matches($body, "(?:PR Analysis C|Analysis: Style)")).Count
    "Fix Summaries"      = ([regex]::Matches($body, "(?:Fix Summary|Changes Applied)")).Count
    "Marker Lines"       = ([regex]::Matches($body, "<!-- MARKER:")).Count
    "Legacy Markers"     = ([regex]::Matches($body, "<!-- pr-(?:analyzer|fixer|promoter)")).Count
    "PASS Verdicts"      = ([regex]::Matches($body, "\*\*PASS\*\*")).Count
    "BLOCK Verdicts"     = ([regex]::Matches($body, "\*\*BLOCKING")).Count
}

foreach ($s in ($sections.GetEnumerator() | Sort-Object Value -Descending)) {
    if ($s.Value -gt 0) {
        $color = if ($s.Value -gt 3) { "Red" } elseif ($s.Value -gt 1) { "Yellow" } else { "Green" }
        Write-Information "${esc}[$($ansi[$color])m  $($s.Key): $($s.Value)${esc}[0m"
    }
}

# Detect repeated blocks (sign of idempotency failure)
Write-Information "${esc}[93m`n--- REPETITION DETECTION ---${esc}[0m"
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

Write-Information "  Content blocks: $totalBlocks"
Write-Information ("${esc}[$($ansi[$(if ($repeatPct -gt 30) { 'Red' } elseif ($repeatPct -gt 10) { 'Yellow' } else { 'Green' })])m  Repeated blocks: $repeatedBlocks ($repeatPct%)${esc}[0m")

if ($repeatPct -gt 20) {
    Write-Information "${esc}[91m  HIGH REPETITION: Idempotency is likely failing.${esc}[0m"
    Write-Information "${esc}[90m  Analyzers are appending duplicate content instead of skipping.${esc}[0m"
}

# Health score
$score = 100
if ($chars -gt 30000) { $score -= 30 }
elseif ($chars -gt 15000) { $score -= 15 }
if ($duplicateHeadings) { $score -= ($duplicateHeadings | Measure-Object -Property Value -Sum).Sum * 5 }
if ($repeatPct -gt 20) { $score -= 25 }
if ($sections["Legacy Markers"] -gt 0) { $score -= 10 }

$scoreColor = if ($score -ge 80) { "Green" } elseif ($score -ge 50) { "Yellow" } else { "Red" }
Write-Information "${esc}[$($ansi[$scoreColor])m`nBody Health Score: $score/100${esc}[0m"

Write-Information "${esc}[96m`n=== BODY INSPECTION COMPLETE ===${esc}[0m"
