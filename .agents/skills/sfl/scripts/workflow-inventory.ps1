#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Catalog all workflows with type classification (agentic vs standard).
.DESCRIPTION
    Lists every workflow file in .github/workflows/, classifies it as
    agentic (has .md + .lock.yml) or standard (just .yml), and shows
    current state and last run status.
.PARAMETER Repo
    The repo to inspect (default: relias-engineering/hs-buddy).
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$InformationPreference = 'Continue'
$esc = [char]27

$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Write-Information "${esc}[96m`n=== WORKFLOW INVENTORY ===${esc}[0m"

# Get all files in .github/workflows/
$files = gh api "repos/$Repo/contents/.github/workflows" --jq '.[].name' 2>&1

$mdFiles = $files | Where-Object { $_ -match '\.md$' -and $_ -ne 'README.md' }
$ymlFiles = $files | Where-Object { $_ -match '\.ya?ml$' -and $_ -notmatch '\.lock\.yml$' }
$lockFiles = $files | Where-Object { $_ -match '\.lock\.yml$' }

# Build inventory
$inventory = @()

# Agentic workflows (have .md + .lock.yml)
foreach ($md in $mdFiles) {
    $baseName = $md -replace '\.md$', ''
    $hasLock = "$baseName.lock.yml" -in $lockFiles
    $inventory += [PSCustomObject]@{
        Name    = $baseName
        Type    = "Agentic"
        Files   = if ($hasLock) { ".md + .lock.yml" } else { ".md ONLY (missing lock!)" }
        HasLock = $hasLock
    }
}

# Standard workflows (just .yml, no matching .md)
foreach ($yml in $ymlFiles) {
    $baseName = $yml -replace '\.ya?ml$', ''
    $hasAgenticMd = "$baseName.md" -in $mdFiles
    if (-not $hasAgenticMd) {
        $inventory += [PSCustomObject]@{
            Name    = $baseName
            Type    = "Standard"
            Files   = ".yml"
            HasLock = $false
        }
    }
}

# Get workflow states
$workflowStates = gh workflow list --all --repo $Repo --json name,state,id 2>&1 | ConvertFrom-Json

# Enrich with state and last run
$enriched = foreach ($item in $inventory | Sort-Object Type, Name) {
    # Find matching workflow by approximate name match
    $wfMatch = $workflowStates | Where-Object {
        $_.name -match [regex]::Escape($item.Name) -or
        $item.Name -match ($_.name -replace '[^a-zA-Z0-9]', '.*')
    } | Select-Object -First 1

    $state = if ($wfMatch) { $wfMatch.state } else { "unknown" }

    $lastRun = $null
    if ($wfMatch) {
        $runs = gh run list --workflow $wfMatch.id --repo $Repo --limit 1 --json status,conclusion,updatedAt 2>$null | ConvertFrom-Json
        if ($runs -and $runs.Count -gt 0) {
            $run = $runs[0]
            $ago = ""
            if ($run.updatedAt) {
                $diff = [DateTime]::UtcNow - [DateTime]::Parse($run.updatedAt)
                $ago = if ($diff.TotalDays -ge 1) { "{0:N0}d ago" -f $diff.TotalDays }
                    elseif ($diff.TotalHours -ge 1) { "{0:N0}h ago" -f $diff.TotalHours }
                    else { "{0:N0}m ago" -f $diff.TotalMinutes }
            }
            $result = if ($run.status -eq "completed") { $run.conclusion } else { $run.status }
            $lastRun = "$result ($ago)"
        }
    }

    [PSCustomObject]@{
        Name    = $item.Name
        Type    = $item.Type
        Files   = $item.Files
        State   = $state
        LastRun = if ($lastRun) { $lastRun } else { "-" }
    }
}

# Display
Write-Information ""
Write-Information "${esc}[93m--- AGENTIC WORKFLOWS ---${esc}[0m"
$agentic = $enriched | Where-Object { $_.Type -eq "Agentic" }
if ($agentic) {
    $agentic | Format-Table Name, Files, State, LastRun -AutoSize
} else {
    Write-Information "${esc}[90m  None found.${esc}[0m"
}

Write-Information "${esc}[93m--- STANDARD WORKFLOWS ---${esc}[0m"
$standard = $enriched | Where-Object { $_.Type -eq "Standard" }
if ($standard) {
    $standard | Format-Table Name, Files, State, LastRun -AutoSize
} else {
    Write-Information "${esc}[90m  None found.${esc}[0m"
}

# Summary
$agenticMissing = $agentic | Where-Object { $_.Files -match 'missing lock' }
Write-Information "${esc}[96m--- SUMMARY ---${esc}[0m"
Write-Information "  Agentic workflows:  $($agentic.Count)"
Write-Information "  Standard workflows: $($standard.Count)"
Write-Information "  Total logical:      $($agentic.Count + $standard.Count)"
if ($agenticMissing.Count -gt 0) {
    Write-Information "${esc}[91m  Missing lock files: $($agenticMissing.Count)${esc}[0m"
    foreach ($m in $agenticMissing) {
        Write-Information "${esc}[33m    $($m.Name) — needs 'gh aw compile'${esc}[0m"
    }
}

Write-Information "${esc}[96m`n=== INVENTORY COMPLETE ===${esc}[0m"
