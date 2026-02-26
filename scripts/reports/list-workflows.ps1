#!/usr/bin/env pwsh
# Lists all workflows with name, status, last run result, and elapsed time.

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repo = "relias-engineering/hs-buddy"

$workflows = gh workflow list --all --json name,state,id --repo $repo | ConvertFrom-Json

$results = foreach ($wf in $workflows | Sort-Object name) {
    $lastRun = gh run list --workflow $wf.id --repo $repo --limit 1 --json status,conclusion,updatedAt,event 2>$null | ConvertFrom-Json

    if ($lastRun -and $lastRun.Count -gt 0) {
        $run = $lastRun[0]
        $ago = if ($run.updatedAt) {
            $ts = [DateTime]::Parse($run.updatedAt)
            $diff = [DateTime]::UtcNow - $ts
            if ($diff.TotalDays -ge 1) { "{0:N0}d ago" -f $diff.TotalDays }
            elseif ($diff.TotalHours -ge 1) { "{0:N0}h ago" -f $diff.TotalHours }
            else { "{0:N0}m ago" -f $diff.TotalMinutes }
        } else { "-" }
        $result = if ($run.status -eq "completed") { $run.conclusion } else { $run.status }
    } else {
        $ago = "never"
        $result = "-"
    }

    [PSCustomObject]@{
        Name     = $wf.name
        State    = $wf.state
        LastRun  = $result
        When     = $ago
    }
}

$results | Format-Table -AutoSize
