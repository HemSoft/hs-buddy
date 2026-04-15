<#
.SYNOPSIS
  Waits, then checks GitHub Actions for failures and attempts remediation.
.DESCRIPTION
  Background monitor that sleeps for a configured delay, then inspects
  recent workflow runs for PR Analyzers A/B/C. On failure it pulls logs,
  diagnoses the issue, and attempts automatic re-runs for transient errors.
  Results are written to a report file.
#>
param(
    [int]$DelayMinutes = 30,
    [string]$Repo = "relias-engineering/hs-buddy"
)


$InformationPreference = 'Continue'
$ErrorActionPreference = 'Continue'
$reportPath = Join-Path $PSScriptRoot ".." "action-monitor-report.md"
$workflows = @(
    @{ Name = "SFL Analyzer A"; File = "sfl-analyzer-a.lock.yml" }
    @{ Name = "SFL Analyzer B"; File = "sfl-analyzer-b.lock.yml" }
    @{ Name = "SFL Analyzer C"; File = "sfl-analyzer-c.lock.yml" }
)

function Write-Report {
    param([string]$Line)
    $Line | Out-File -FilePath $reportPath -Append -Encoding utf8
    Write-Information $Line
}

# --- Wait ---
$target = (Get-Date).AddMinutes($DelayMinutes)
Write-Information "[$((Get-Date).ToString('HH:mm:ss'))] Monitoring started. Will check at $($target.ToString('HH:mm:ss')) ($DelayMinutes min delay)..."
Start-Sleep -Seconds ($DelayMinutes * 60)

# --- Begin evaluation ---
"" | Out-File -FilePath $reportPath -Encoding utf8  # clear/create
Write-Report "# GitHub Actions Monitor Report"
Write-Report "**Generated**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Report "**Repository**: $Repo"
Write-Report ""

$failedWorkflows = @()
$successCount = 0

foreach ($wf in $workflows) {
    Write-Report "## $($wf.Name)"
    Write-Report ""

    # Get the latest run for this workflow file
    $runsJson = gh run list --repo $Repo --workflow $wf.File --limit 1 --json databaseId,status,conclusion,createdAt,headBranch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Report "- **Status**: Could not fetch runs: $runsJson"
        Write-Report ""
        continue
    }

    $runs = $runsJson | ConvertFrom-Json
    if ($runs.Count -eq 0) {
        Write-Report "- **Status**: No runs found since push"
        Write-Report ""
        continue
    }

    $run = $runs[0]
    $runId = $run.databaseId
    $status = $run.status
    $conclusion = $run.conclusion

    Write-Report "- **Run ID**: $runId"
    Write-Report "- **Status**: $status"
    Write-Report "- **Conclusion**: $conclusion"
    Write-Report "- **Created**: $($run.createdAt)"
    Write-Report ""

    if ($status -eq "in_progress" -or $status -eq "queued") {
        Write-Report "- Still running — will check conclusion later."
        Write-Report ""
        continue
    }

    if ($conclusion -eq "success") {
        $successCount++
        Write-Report "- **Result**: PASS"
        Write-Report ""
        continue
    }

    # --- Failure path ---
    Write-Report "- **Result**: FAILED — pulling logs for diagnosis..."
    Write-Report ""

    # Pull last 100 lines of logs looking for errors
    $logSnippet = gh run view $runId --repo $Repo --log 2>&1 |
        Select-String -Pattern "error|failed|invalid|400|401|403|500|exception|CAPIError" -CaseSensitive:$false |
        Select-Object -Last 20

    if ($logSnippet) {
        Write-Report "### Error Log Excerpts"
        Write-Report '```'
        foreach ($line in $logSnippet) {
            Write-Report ($line.Line.Trim())
        }
        Write-Report '```'
        Write-Report ""
    }

    # Classify the failure
    $logText = ($logSnippet | ForEach-Object { $_.Line }) -join "`n"
    $isTransient = $false
    $diagnosis = "Unknown failure"

    if ($logText -match "CAPIError.*400") {
        $diagnosis = "API returned 400 Bad Request — model may not be supported by the Copilot API backend"
    }
    elseif ($logText -match "argument .+ is invalid.*Allowed choices") {
        $diagnosis = "Invalid model name — CLI does not recognize the configured model"
    }
    elseif ($logText -match "rate.limit|429|too many requests") {
        $diagnosis = "Rate limited — transient failure"
        $isTransient = $true
    }
    elseif ($logText -match "timeout|timed.out|ETIMEDOUT") {
        $diagnosis = "Timeout — transient failure"
        $isTransient = $true
    }
    elseif ($logText -match "network|ECONNRESET|ECONNREFUSED|socket hang up") {
        $diagnosis = "Network error — transient failure"
        $isTransient = $true
    }

    Write-Report "### Diagnosis"
    Write-Report "- **Category**: $(if ($isTransient) { 'Transient' } else { 'Persistent' })"
    Write-Report "- **Details**: $diagnosis"
    Write-Report ""

    # Attempt remediation for transient failures
    if ($isTransient) {
        Write-Report "### Remediation: Re-running workflow..."
        $rerunResult = gh run rerun $runId --repo $Repo --failed 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Report "- Re-run triggered successfully."
        } else {
            Write-Report "- Re-run failed: $rerunResult"
        }
        Write-Report ""
    }
    else {
        Write-Report "### Remediation"
        Write-Report "- Persistent failure detected. Manual investigation required."
        Write-Report "- Run: ``gh run view $runId --repo $Repo --log``"
        Write-Report ""
    }

    $failedWorkflows += @{ Name = $wf.Name; RunId = $runId; Diagnosis = $diagnosis; Transient = $isTransient }
}

# --- Summary ---
Write-Report "---"
Write-Report "## Summary"
Write-Report ""
Write-Report "| Workflow | Result |"
Write-Report "|----------|--------|"
foreach ($wf in $workflows) {
    $failed = $failedWorkflows | Where-Object { $_.Name -eq $wf.Name }
    if ($failed) {
        Write-Report "| $($wf.Name) | FAILED ($($failed.Diagnosis)) |"
    } else {
        Write-Report "| $($wf.Name) | PASS |"
    }
}
Write-Report ""

if ($failedWorkflows.Count -eq 0) {
    Write-Report "**All PR Analyzers passed!**"
} else {
    $transientCount = ($failedWorkflows | Where-Object { $_.Transient }).Count
    $persistentCount = $failedWorkflows.Count - $transientCount
    Write-Report "**$($failedWorkflows.Count) failure(s)**: $transientCount transient (re-run attempted), $persistentCount persistent (needs manual fix)."
}

Write-Report ""
Write-Report "Report saved to: $reportPath"
Write-Information ""
Write-Information "=== Monitor complete. Report at: $reportPath ==="
