<#
.SYNOPSIS
  Stop hook: checks GitHub Actions for failures and tells the agent to fix them.
.DESCRIPTION
  Runs when the agent session is about to stop. Checks recent workflow runs
  for PR Analyzers A/B/C (and optionally all workflows). If failures are found,
  outputs JSON that blocks the agent from stopping and includes diagnostic info
  so it can attempt a fix.
#>
param()

$ErrorActionPreference = 'Continue'

# Read stdin for hook input
$hookInput = [Console]::In.ReadToEnd() | ConvertFrom-Json

# Prevent infinite loops: if we already ran a stop hook this session, let it stop
if ($hookInput.stop_hook_active -eq $true) {
    @{ continue = $true } | ConvertTo-Json -Compress
    exit 0
}

$repo = "HemSoft/hs-buddy"
$failures = @()

# Check key workflows
$workflows = @(
    @{ Name = "PR Analyzer A"; File = "pr-analyzer-a.lock.yml" }
    @{ Name = "PR Analyzer B"; File = "pr-analyzer-b.lock.yml" }
    @{ Name = "PR Analyzer C"; File = "pr-analyzer-c.lock.yml" }
    @{ Name = "SFL Dispatcher"; File = "sfl-dispatcher.yml" }
    @{ Name = "SFL Auditor";    File = "sfl-auditor.lock.yml" }
    @{ Name = "PR Fixer";       File = "pr-fixer.lock.yml" }
)

foreach ($wf in $workflows) {
    try {
        $runsJson = gh run list --repo $repo --workflow $wf.File --limit 1 --json databaseId,status,conclusion,createdAt 2>&1
        if ($LASTEXITCODE -ne 0) { continue }

        $runs = $runsJson | ConvertFrom-Json
        if ($runs.Count -eq 0) { continue }

        $run = $runs[0]
        if ($run.status -eq "completed" -and $run.conclusion -eq "failure") {
            # Pull key error lines from logs
            $errorLines = @()
            try {
                $logOutput = gh run view $run.databaseId --repo $repo --log 2>&1
                $errorLines = $logOutput |
                    Select-String -Pattern "error|failed|invalid|CAPIError|400|401|500" -CaseSensitive:$false |
                    Select-Object -Last 5 |
                    ForEach-Object { $_.Line.Trim() }
            } catch {}

            $failures += @{
                workflow  = $wf.Name
                runId     = $run.databaseId
                createdAt = $run.createdAt
                errors    = $errorLines
            }
        }
    } catch {
        continue
    }
}

if ($failures.Count -gt 0) {
    $failureReport = $failures | ForEach-Object {
        $errText = if ($_.errors.Count -gt 0) { ($_.errors -join "`n  ") } else { "No error details captured" }
        "FAILED: $($_.workflow) (run $($_.runId), created $($_.createdAt))`n  $errText"
    }
    $report = $failureReport -join "`n`n"

    $output = @{
        hookSpecificOutput = @{
            hookEventName = "Stop"
            decision      = "block"
            reason        = "GitHub Actions failures detected. Please investigate and fix:`n`n$report"
        }
    }
    $output | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

# No failures — allow the agent to stop normally
@{ continue = $true } | ConvertTo-Json -Compress
exit 0
