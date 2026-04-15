<#
.SYNOPSIS
    Check all open PRs for idempotency markers.
.DESCRIPTION
    Scans all open agent-fix PRs for <!-- MARKER:... --> tags,
    detects missing/duplicate markers, and identifies stuck PRs.
.PARAMETER Repo
    The repo to check (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"
$InformationPreference = 'Continue'
$esc = [char]27

Write-Information "${esc}[36m`n=== MARKER CHECK (All Open PRs) ===${esc}[0m"

$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,body,labels 2>&1 | ConvertFrom-Json

$agentPRs = $prs | Where-Object { @($_.labels | ForEach-Object { $_.name }) -contains "agent:pr" }

if ($agentPRs.Count -eq 0) {
    Write-Information "${esc}[32mNo open agent PRs found.${esc}[0m"
    return
}

Write-Information "Found $($agentPRs.Count) open agent PR(s).`n"

foreach ($pr in $agentPRs) {
    Write-Information "${esc}[33m--- PR #$($pr.number): $($pr.title) ---${esc}[0m"
    Write-Information "  Branch: $($pr.headRefName)"
    Write-Information "  Draft: $($pr.isDraft)"

    $body = $pr.body
    if (-not $body) {
        Write-Information "${esc}[31m  Body: EMPTY${esc}[0m"
        continue
    }

    $bodyLen = $body.Length
    Write-Information "  Body length: $bodyLen chars $(if ($bodyLen -gt 30000) { '(BLOATED!)' } elseif ($bodyLen -gt 15000) { '(large)' })"

    # Get cycle from label
    $cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
    $cycle = if ($cycleLabel) { [int]($cycleLabel -replace "pr:cycle-", "") } else { 0 }

    # Check all marker types
    $markerPattern = '<!-- MARKER:(sfl-analyzer-[abc]|sfl-issue-processor|sfl-pr-router) cycle:(\d+) -->'
    $matches_found = [regex]::Matches($body, $markerPattern)

    if ($matches_found.Count -eq 0) {
        Write-Information "${esc}[31m  Markers: NONE FOUND${esc}[0m"

        # Check for legacy markers
        $legacyPattern = '<!-- (pr-analyzer-[abc]|pr-fixer|pr-promoter) cycle:(\d+) -->'
        $legacyMatches = [regex]::Matches($body, $legacyPattern)
        if ($legacyMatches.Count -gt 0) {
            Write-Information "${esc}[33m  Legacy markers found: $($legacyMatches.Count)${esc}[0m"
            foreach ($lm in $legacyMatches) {
                Write-Information "${esc}[90m    $($lm.Value)${esc}[0m"
            }
            Write-Information "${esc}[31m  DIAGNOSIS: Analyzers using OLD marker format. Workflows need update.${esc}[0m"
        } else {
            Write-Information "${esc}[33m  DIAGNOSIS: No markers at all. Analyzers may not have run yet.${esc}[0m"
        }
    } else {
        Write-Information "${esc}[32m  Markers found: $($matches_found.Count)${esc}[0m"
        $markersByType = @{}
        foreach ($m in $matches_found) {
            $type = $m.Groups[1].Value
            $mCycle = [int]$m.Groups[2].Value
            if (-not $markersByType[$type]) { $markersByType[$type] = @() }
            $markersByType[$type] += $mCycle
            $ansiCode = if ($mCycle -eq $cycle) { '32' } else { '90' }
            Write-Information "${esc}[$($ansiCode)m    $($m.Value)${esc}[0m"
        }

        # Check for duplicates within same cycle
        foreach ($type in $markersByType.Keys) {
            $cycleCounts = $markersByType[$type] | Group-Object | Where-Object { $_.Count -gt 1 }
            if ($cycleCounts) {
                foreach ($cc in $cycleCounts) {
                    Write-Information "${esc}[31m  DUPLICATE: [$type cycle:$($cc.Name)] appears $($cc.Count) times!${esc}[0m"
                }
            }
        }

        # Check progression for current cycle
        $analyzersPresent = @("sfl-analyzer-a", "sfl-analyzer-b", "sfl-analyzer-c") |
            Where-Object { $markersByType[$_] -and $markersByType[$_] -contains $cycle }
        $fixerPresent = $markersByType["sfl-issue-processor"] -and $markersByType["sfl-issue-processor"] -contains $cycle
        $routerPresent = $markersByType["sfl-pr-router"] -and $markersByType["sfl-pr-router"] -contains $cycle

        Write-Information "`n  Cycle $cycle progression:"
        Write-Information "    Analyzers: $($analyzersPresent.Count)/3 $(if ($analyzersPresent.Count -eq 3) { '[COMPLETE]' } else { '[WAITING]' })"
        Write-Information "    Issue Processor: $(if ($fixerPresent) { '[DONE]' } else { '[PENDING]' })"
        Write-Information "    PR Router: $(if ($routerPresent) { '[DONE]' } else { '[PENDING]' })"
    }

    Write-Information ""
}

Write-Information "${esc}[36m=== MARKER CHECK COMPLETE ===${esc}[0m"