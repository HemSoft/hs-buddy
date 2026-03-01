<#
.SYNOPSIS
    Extracts dispatcher decision output from a workflow run.
.DESCRIPTION
    Fetches logs for a dispatcher run and extracts only the runtime decision
    output (not bash source). The gh run view log format is:
      jobName<TAB>stepName<TAB>timestamp message
    Runtime output appears AFTER the "shell:" and "env:" lines.
.PARAMETER RunId
    The workflow run database ID. If omitted, uses the latest dispatcher run.
.PARAMETER Last
    Number of recent dispatcher runs to show (default: 1). Used when RunId is omitted.
.PARAMETER Raw
    Show all output lines, not just decisions.
.EXAMPLE
    & ".agents/skills/sfl/scripts/debug/dispatcher-log.ps1"
    & ".agents/skills/sfl/scripts/debug/dispatcher-log.ps1" -RunId 22539261987
    & ".agents/skills/sfl/scripts/debug/dispatcher-log.ps1" -Last 3
#>
[CmdletBinding()]
param(
    [long]$RunId,
    [int]$Last = 1,
    [switch]$Raw
)

$ErrorActionPreference = "Stop"

# Ensure auth
& "$PSScriptRoot\..\ensure-auth.ps1" -Quiet | Out-Null

if (-not $RunId) {
    $runs = gh run list --workflow sfl-dispatcher.yml --limit $Last --json databaseId,status,conclusion,createdAt 2>&1 | ConvertFrom-Json
    if (-not $runs -or $runs.Count -eq 0) {
        Write-Host "No dispatcher runs found." -ForegroundColor Yellow
        exit 0
    }
} else {
    $runs = @([PSCustomObject]@{ databaseId = $RunId; status = ""; conclusion = ""; createdAt = "" })
}

# Decision steps — these contain the actual dispatch logic output
$decisionSteps = @(
    "Model drift guard"
    "Check for fixable issues"
    "Check for draft PRs with agent:pr"
    "Dispatch PR Fixer"
    "Check for non-draft PRs awaiting promotion"
    "Check for draft PRs with ready-for-review label"
    "Summary"
)

foreach ($run in $runs) {
    $id = $run.databaseId
    $time = if ($run.createdAt) {
        [DateTimeOffset]::Parse($run.createdAt).ToOffset([TimeSpan]::FromHours(-5)).ToString("yyyy-MM-dd hh:mm tt") + " EST"
    } else { "unknown" }
    $status = if ($run.conclusion) { $run.conclusion } elseif ($run.status) { $run.status } else { "unknown" }
    $color = switch ($status) { "success" { "Green" } "failure" { "Red" } default { "Yellow" } }

    Write-Host "`n--- Dispatcher Run $id ($time) [$status] ---" -ForegroundColor $color

    # Fetch log and parse per-step
    # Log format: dispatch<TAB>StepName<TAB>TimestampZ Message
    # Runtime output appears after the "shell:" and "env:" block for each step
    $logLines = @(gh run view $id --log 2>&1)

    # For each decision step, extract only the runtime output (lines after env: block)
    foreach ($step in $decisionSteps) {
        $stepLines = $logLines | Where-Object { $_ -match "^dispatch`t$([regex]::Escape($step))`t" }
        if ($stepLines.Count -eq 0) { continue }

        # Find where source code ends and runtime output begins
        # Pattern: lines after "REPO: ..." are runtime output
        $inOutput = $false
        $outputLines = @()
        foreach ($line in $stepLines) {
            if ($line -match "`t\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+REPO:\s") {
                $inOutput = $true
                continue
            }
            if (-not $inOutput) { continue }

            # Extract the message after timestamp
            if ($line -match "`t\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(.+)") {
                $msg = $Matches[1].Trim()
                # Skip empty lines and step summary markers
                if ($msg -and $msg -notmatch '^\s*$|^##\[') {
                    $outputLines += $msg
                }
            }
        }

        if ($outputLines.Count -gt 0) {
            Write-Host "  [$step]" -ForegroundColor DarkCyan
            foreach ($msg in $outputLines) {
                $textColor = if ($msg -match "DRIFT|::error::|exit code 1") { "Red" }
                    elseif ($msg -match "will dispatch|Dispatching|Found \d|https://") { "Cyan" }
                    elseif ($msg -match "No |skipping|not needed|not ready") { "DarkGray" }
                    elseif ($msg -match "All models consistent|PR #") { "Green" }
                    else { "White" }
                Write-Host "    $msg" -ForegroundColor $textColor
            }
        }
    }
}

Write-Host ""
