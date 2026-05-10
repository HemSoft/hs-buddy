# ralph-process-issues.ps1 — Process GitHub Issues until none remain.
# Version: 1.5.1
# Repeatedly calls ralph -Issue until no open issues are left.
# Supports explicit issue ordering via -Issues or a config file.
# Pulls main between each run so the next issue sees the latest code.
# NOTE: PowerShell uses single-dash params: -Help, -Max 5 (not --help)
param(
    [int[]]$Issues,
    [string]$IssueConfig,
    [int]$Max = 0,
    [string]$IssueLabel,
    [string]$WorkUntil,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [string]$Model,
    [string]$Provider,
    [string]$ReviewProduct,
    [string]$ReviewMode,
    [string[]]$Agents,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'ralph-loops' 'lib' 'config.ps1')

if (-not $Provider) { $Provider = Get-RalphDefaultProvider }
try {
    $script:ProviderConfig = Resolve-RalphProvider -Name $Provider
}
catch {
    Write-Host "Invalid provider '$Provider'. Valid: $((Get-RalphProviderNames) -join ', ')" -ForegroundColor Red
    exit 1
}

if ($Help) {
    Write-Host ""
    Write-Host "ralph-process-issues.ps1 — Process Issues Until Done" -ForegroundColor Cyan
    Write-Host "Repeatedly picks open GitHub Issues, works on them, and creates PRs."
    Write-Host "Stops when no open issues remain, or -Max / -WorkUntil limits are reached."
    Write-Host ""
    Write-Host "PARAMETERS" -ForegroundColor Yellow
    Write-Host "  -Issues <int[]>        Explicit issue numbers to process in order (e.g. -Issues 294,280,281)"
    Write-Host "  -IssueConfig <path>    Path to JSON config file with ordered issue numbers"
    Write-Host "                         Format: { `"issues`": [294, 280, 281, 286] }"
    Write-Host "                         Default lookup: ./ralph-issue-queue.json (if it exists)"
    Write-Host "  -Max <int>             Maximum issues to process (default: unlimited)"
    Write-Host "  -IssueLabel <label>    Only process issues with this label (e.g. 'automated', 'tech-debt')"
    Write-Host "  -WorkUntil <HH:mm>     Stop after this local time (e.g. -WorkUntil 08:00)"
    Write-Host "  -Model <name>          Model to pass through to ralph.ps1"
    Write-Host "  -Provider <name>       CLI provider to pass through"
    Write-Host "  -ReviewProduct <name>  Automated PR review product to pass through to ralph.ps1"
    Write-Host "  -ReviewMode <name>     Review request mode to pass through when supported"
    Write-Host "  -Agents <specs>        Agent specs to pass through"
    Write-Host "  -NoAudio               Suppress audio feedback"
    Write-Host "  -SkipReview            Skip automated PR review requests"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "ISSUE ORDER PRIORITY" -ForegroundColor Yellow
    Write-Host "  1. -Issues parameter (explicit list)"
    Write-Host "  2. -IssueConfig file (or auto-detected ralph-issue-queue.json)"
    Write-Host "  3. Oldest open issue (default behavior)"
    Write-Host ""
    Write-Host "EXAMPLES" -ForegroundColor Yellow
    Write-Host "  ralph-process-issues                                # oldest first (default)"
    Write-Host "  ralph-process-issues -Issues 294,280,281            # explicit order"
    Write-Host "  ralph-process-issues -IssueConfig ./my-queue.json   # from config file"
    Write-Host "  ralph-process-issues -IssueLabel automated          # only 'automated' issues"
    Write-Host "  ralph-process-issues -Max 5                         # process up to 5 issues"
    Write-Host "  ralph-process-issues -WorkUntil 08:00               # work until 8am"
    Write-Host "  ralph-process-issues -Max 3 -Model opus47           # 3 issues with opus 4.7"
    Write-Host ""
    exit 0
}

# --- Resolve ralph.ps1 path ---
$ralphPath = Join-Path $PSScriptRoot 'ralph-loops' 'ralph.ps1'
if (-not (Test-Path $ralphPath)) {
    # Fallback: resolve from ralph command
    $ralphCmd = Get-Command ralph -ErrorAction SilentlyContinue
    if ($ralphCmd -and $ralphCmd.Source) {
        $ralphPath = Join-Path (Split-Path $ralphCmd.Source -Parent) 'ralph.ps1'
    }
}
$ralphPath = (Resolve-Path $ralphPath -ErrorAction SilentlyContinue).Path
if (-not $ralphPath -or -not (Test-Path $ralphPath)) {
    Write-Host "ERROR: Cannot find ralph.ps1" -ForegroundColor Red
    exit 1
}

# --- Parse deadline ---
$deadline = $null
if ($WorkUntil) {
    try {
        $parsed = [DateTime]::ParseExact($WorkUntil, 'HH:mm', $null)
        $deadline = Get-Date -Hour $parsed.Hour -Minute $parsed.Minute -Second 0
        if ($deadline -le (Get-Date)) { $deadline = $deadline.AddDays(1) }
    }
    catch {
        Write-Host "Invalid -WorkUntil format. Use HH:mm (e.g. 08:00)." -ForegroundColor Red
        exit 1
    }
}

# --- Resolve repo slug ---
$repoSlug = gh repo view --json nameWithOwner -q '.nameWithOwner' 2>$null
if (-not $repoSlug) {
    $remoteUrl = git --no-pager remote get-url origin 2>$null
    if ($remoteUrl -match '[:/]([^/]+/[^/]+?)(?:\.git)?$') {
        $repoSlug = $Matches[1]
    }
}
if (-not $repoSlug) {
    Write-Host "ERROR: Cannot determine repo slug." -ForegroundColor Red
    exit 1
}

# --- Main loop ---
# Resolve issue queue: -Issues > -IssueConfig > auto-detect > oldest
$issueQueue = @()
if ($Issues -and $Issues.Count -gt 0) {
    $issueQueue = $Issues
    Write-Host "  Order:     explicit ($($issueQueue -join ', '))"
}
elseif ($IssueConfig -and (Test-Path $IssueConfig)) {
    $config = Get-Content $IssueConfig -Raw | ConvertFrom-Json
    $issueQueue = @($config.issues)
    Write-Host "  Order:     config file ($IssueConfig) — $($issueQueue.Count) issues"
}
else {
    # Auto-detect ralph-issue-queue.json in repo root
    $autoConfig = Join-Path (git rev-parse --show-toplevel 2>$null) 'ralph-issue-queue.json'
    if (Test-Path $autoConfig) {
        $config = Get-Content $autoConfig -Raw | ConvertFrom-Json
        $issueQueue = @($config.issues)
        Write-Host "  Order:     auto-detected ($autoConfig) — $($issueQueue.Count) issues"
    }
    else {
        Write-Host "  Order:     oldest first (default)"
    }
}

$maxIssues = if ($Max -gt 0) { $Max } else { [int]::MaxValue }
# If we have an explicit queue, cap at queue length
if ($issueQueue.Count -gt 0 -and $maxIssues -gt $issueQueue.Count) {
    $maxIssues = $issueQueue.Count
}
$processed = 0
$runStart = Get-Date

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "ralph-process-issues — Processing open issues" -ForegroundColor Cyan
Write-Host "  Repo:      $repoSlug"
Write-Host "  Label:     $(if ($IssueLabel) { $IssueLabel } else { '(any)' })"
Write-Host "  Max:       $(if ($Max -gt 0) { $Max } else { 'unlimited' })"
Write-Host "  WorkUntil: $(if ($deadline) { $deadline.ToString('HH:mm') } else { '(none)' })"
Write-Host "====================================" -ForegroundColor Cyan

for ($i = 1; $i -le $maxIssues; $i++) {
    # Check deadline
    if ($deadline -and (Get-Date) -ge $deadline) {
        Write-Host ""
        Write-Host "Deadline reached ($($deadline.ToString('HH:mm'))). Stopping." -ForegroundColor Yellow
        break
    }

    Write-Host ""
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host "== Processing issue $i$(if ($Max -gt 0) { " of $Max" })" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan

    # Build ralph args
    $ralphArgs = @{
        Autopilot = $true
    }

    # Determine issue number
    $issueNumber = $null
    if ($issueQueue.Count -gt 0) {
        $issueNumber = $issueQueue[$i - 1]
    }
    else {
        # Find oldest open issue (with optional label filter)
        $ghListArgs = @('issue', 'list', '--repo', $repoSlug, '--state', 'open', '--limit', '1', '--json', 'number', '-q', '.[0].number')
        if ($IssueLabel) { $ghListArgs += @('--label', $IssueLabel) }
        $issueNumber = & gh @ghListArgs 2>$null
        if (-not $issueNumber) {
            Write-Host "No more open issues. Done!" -ForegroundColor Green
            break
        }
        $issueNumber = [int]$issueNumber
    }

    # Fetch issue details and build prompt
    $issueJson = gh issue view $issueNumber --repo $repoSlug --json title,body 2>$null | ConvertFrom-Json
    if ($issueJson) {
        $issuePrompt = @"
Fix GitHub Issue #$issueNumber — $($issueJson.title)

$($issueJson.body)

Make changes, run tests, commit, and push.
"@
        $ralphArgs['Prompt'] = $issuePrompt
    }
    else {
        Write-Host "WARNING: Could not fetch issue #$issueNumber details. Using generic prompt." -ForegroundColor Yellow
        $ralphArgs['Prompt'] = "Fix GitHub Issue #$issueNumber. Make changes, run tests, commit, and push."
    }

    Write-Host "  Issue:  #$issueNumber$(if ($issueJson) { " — $($issueJson.title)" })" -ForegroundColor White

    if ($Model) { $ralphArgs['Model'] = $Model }
    if ($Provider) { $ralphArgs['Provider'] = $Provider }
    if ($Agents) { $ralphArgs['Agents'] = $Agents }
    if ($NoAudio) { $ralphArgs['NoAudio'] = $true }
    if ($SkipReview) { $ralphArgs['SkipReview'] = $true }

    & $ralphPath @ralphArgs
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 2) {
        Write-Host ""
        Write-Host "No more open issues. Done!" -ForegroundColor Green
        break
    }
    elseif ($exitCode -ne 0) {
        Write-Host "ralph.ps1 exited with code $exitCode. Stopping." -ForegroundColor Yellow
        break
    }

    $processed++

    # Pull main before next issue
    if ($i -lt $maxIssues) {
        Write-Host ""
        Write-Host "Pulling latest main before next issue..." -ForegroundColor DarkGray
        git checkout main 2>&1 | Out-Null
        git pull --ff-only 2>&1 | Out-Null
    }
}

# --- Summary ---
$totalDuration = (Get-Date) - $runStart
$totalDurStr = "{0:hh\:mm\:ss}" -f $totalDuration

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "ralph-process-issues — Complete" -ForegroundColor Green
Write-Host "  Issues processed: $processed"
Write-Host "  Duration:         $totalDurStr"
Write-Host "====================================" -ForegroundColor Green
