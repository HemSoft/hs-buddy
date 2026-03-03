<#
.SYNOPSIS
    Check all open PRs for idempotency markers.
.DESCRIPTION
    Scans all open agent-fix PRs for [MARKER:...] tags,
    detects missing/duplicate markers, and identifies stuck PRs.
.PARAMETER Repo
    The repo to check (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== MARKER CHECK (All Open PRs) ===" -ForegroundColor Cyan

$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,body,labels 2>&1 | ConvertFrom-Json

$agentPRs = $prs | Where-Object { $_.headRefName -match "^agent-fix/" }

if ($agentPRs.Count -eq 0) {
    Write-Host "No open agent-fix PRs found." -ForegroundColor Green
    return
}

Write-Host "Found $($agentPRs.Count) open agent-fix PR(s).`n"

foreach ($pr in $agentPRs) {
    Write-Host "--- PR #$($pr.number): $($pr.title) ---" -ForegroundColor Yellow
    Write-Host "  Branch: $($pr.headRefName)"
    Write-Host "  Draft: $($pr.isDraft)"

    $body = $pr.body
    if (-not $body) {
        Write-Host "  Body: EMPTY" -ForegroundColor Red
        continue
    }

    $bodyLen = $body.Length
    Write-Host "  Body length: $bodyLen chars $(if ($bodyLen -gt 30000) { '(BLOATED!)' } elseif ($bodyLen -gt 15000) { '(large)' })"

    # Get cycle from label
    $cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
    $cycle = if ($cycleLabel) { [int]($cycleLabel -replace "pr:cycle-", "") } else { 0 }

    # Check all marker types
    $markerPattern = '\[MARKER:(pr-analyzer-[abc]|pr-fixer|pr-promoter) cycle:(\d+)\]'
    $matches_found = [regex]::Matches($body, $markerPattern)

    if ($matches_found.Count -eq 0) {
        Write-Host "  Markers: NONE FOUND" -ForegroundColor Red

        # Check for legacy markers
        $legacyPattern = '<!-- (pr-analyzer-[abc]|pr-fixer|pr-promoter) cycle:(\d+) -->'
        $legacyMatches = [regex]::Matches($body, $legacyPattern)
        if ($legacyMatches.Count -gt 0) {
            Write-Host "  Legacy markers found: $($legacyMatches.Count)" -ForegroundColor DarkYellow
            foreach ($lm in $legacyMatches) {
                Write-Host "    $($lm.Value)" -ForegroundColor DarkGray
            }
            Write-Host "  DIAGNOSIS: Analyzers using OLD marker format. Workflows need update." -ForegroundColor Red
        } else {
            Write-Host "  DIAGNOSIS: No markers at all. Analyzers may not have run yet." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Markers found: $($matches_found.Count)" -ForegroundColor Green
        $markersByType = @{}
        foreach ($m in $matches_found) {
            $type = $m.Groups[1].Value
            $mCycle = [int]$m.Groups[2].Value
            if (-not $markersByType[$type]) { $markersByType[$type] = @() }
            $markersByType[$type] += $mCycle
            $color = if ($mCycle -eq $cycle) { "Green" } else { "DarkGray" }
            Write-Host "    $($m.Value)" -ForegroundColor $color
        }

        # Check for duplicates within same cycle
        foreach ($type in $markersByType.Keys) {
            $cycleCounts = $markersByType[$type] | Group-Object | Where-Object { $_.Count -gt 1 }
            if ($cycleCounts) {
                foreach ($cc in $cycleCounts) {
                    Write-Host "  DUPLICATE: [$type cycle:$($cc.Name)] appears $($cc.Count) times!" -ForegroundColor Red
                }
            }
        }

        # Check progression for current cycle
        $analyzersPresent = @("sfl-analyzer-a", "sfl-analyzer-b", "sfl-analyzer-c") |
            Where-Object { $markersByType[$_] -and $markersByType[$_] -contains $cycle }
        $fixerPresent = $markersByType["pr-fixer"] -and $markersByType["pr-fixer"] -contains $cycle
        $promoterPresent = $markersByType["pr-promoter"] -and $markersByType["pr-promoter"] -contains $cycle

        Write-Host "`n  Cycle $cycle progression:"
        Write-Host "    Analyzers: $($analyzersPresent.Count)/3 $(if ($analyzersPresent.Count -eq 3) { '[COMPLETE]' } else { '[WAITING]' })"
        Write-Host "    Fixer: $(if ($fixerPresent) { '[DONE]' } else { '[PENDING]' })"
        Write-Host "    Promoter: $(if ($promoterPresent) { '[DONE]' } else { '[PENDING]' })"
    }

    Write-Host ""
}

Write-Host "=== MARKER CHECK COMPLETE ===" -ForegroundColor Cyan
