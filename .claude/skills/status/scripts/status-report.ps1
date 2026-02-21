[CmdletBinding()]
param(
    [string]$Repo = "HemSoft/hs-buddy",
    [string]$LastCheckUtc,
    [switch]$UpdateCheckpoint
)

$ErrorActionPreference = "Stop"

$data = & ".claude/skills/status/scripts/status-collect.ps1" -Repo $Repo -LastCheckUtc $LastCheckUtc
if ($data -is [string]) { $data = $data | ConvertFrom-Json }

function To-Eastern($utcText) {
    $utc = [DateTime]::Parse($utcText).ToUniversalTime()
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Eastern Standard Time")
    $local = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
    $abbr = if ($tz.IsDaylightSavingTime($local)) { "EDT" } else { "EST" }
    return "{0} {1}" -f $local.ToString("yyyy-MM-dd hh:mm tt"), $abbr
}

$nowEt = To-Eastern $data.nowUtc
$lastEt = To-Eastern $data.lastCheckUtc

Write-Output "## Status — $nowEt"
Write-Output "(last checked: $lastEt)"
Write-Output ""
Write-Output "### Issues & PRs"
Write-Output "| Issue | Labels | Matching PR | OK? |"
Write-Output "|-------|--------|-------------|-----|"

$allGood = $true

foreach ($issue in $data.issues) {
    $labels = @($issue.labels | ForEach-Object { $_.name })
    $labelText = ($labels -join ", ")
    $num = [int]$issue.number

    if ($labels -contains "agent:in-progress") {
        $matching = @($data.prs | Where-Object { $_.headRefName -match "agent-fix/issue-$num-" })
        if ($matching.Count -eq 1) {
            $pr = $matching[0]
            $ok = "✅"
            $matchText = "PR #$($pr.number) $(if($pr.isDraft){'(draft)'}else{'(ready)'})"
        } else {
            $ok = "❌"
            $matchText = if ($matching.Count -eq 0) { "none" } else { "multiple" }
            $allGood = $false
        }
    } elseif (($labels -contains "agent:pause") -or ($labels -contains "agent:human-required")) {
        $ok = "⚠️"
        $matchText = "requires human"
        $allGood = $false
    } else {
        $ok = "✅"
        $matchText = "waiting"
    }

    Write-Output "| #$num $($issue.title) | $labelText | $matchText | $ok |"
}

if (@($data.issues).Count -eq 0) {
    Write-Output "No active agent issues."
}

Write-Output ""
Write-Output "### Draft PR Marker State"
foreach ($marker in $data.markerState) {
    Write-Output "- PR #$($marker.prNumber): cycle $($marker.cycle), markers A/B/C = $($marker.analyzerA)/$($marker.analyzerB)/$($marker.analyzerC), body=$($marker.bodyLength)"
}

Write-Output ""
Write-Output "### Workflow Runs Since Last Check"
Write-Output "| Workflow | Runs | Failed |"
Write-Output "|----------|------|--------|"

$workflowFailed = $false
foreach ($wf in $data.workflows) {
    $name = $wf.workflow -replace "\.lock\.yml$", ""
    $failed = @($wf.failures)

    if ($wf.runs -eq 0) {
        Write-Output "| $name | 0 | (no runs) |"
        continue
    }

    if ($failed.Count -eq 0) {
        Write-Output "| $name | $($wf.runs) | 0 |"
        continue
    }

    $workflowFailed = $true
    $failedText = ($failed | ForEach-Object { "#$($_.id) ($($_.conclusion))" }) -join ", "
    Write-Output "| $name | $($wf.runs) | $failedText |"
}

$verdict = if ($allGood -and -not $workflowFailed) { "✅ ALL GOOD" } else { "⚠️ ISSUES FOUND" }
Write-Output ""
Write-Output "### Verdict: $verdict"

if ($UpdateCheckpoint) {
    & ".claude/skills/status/scripts/status-checkpoint.ps1" -Mode write -Value $data.nowUtc | Out-Null
}
