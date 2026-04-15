<#
.SYNOPSIS
    Dispatches SFL Analyzer A for a pull request, starting the A→B→C chain.
.DESCRIPTION
    Validates the PR exists and is open, then dispatches sfl-analyzer-a
    via gh workflow run. Analyzer A chains to B, then C automatically.
    Runs ensure-auth first to enforce org/account mapping.
.PARAMETER PRNumber
    Pull request number to analyze. If omitted, selects the oldest open
    draft PR labeled agent:pr.
.PARAMETER Only
    Run a specific analyzer instead of A (accepts A, B, or C).
.PARAMETER Repo
    Target repo in org/repo format (default: relias-engineering/hs-buddy).
.EXAMPLE
    & ".agents/skills/sfl/scripts/analyze-pr.ps1" -PRNumber 489
    & ".agents/skills/sfl/scripts/analyze-pr.ps1"
    & ".agents/skills/sfl/scripts/analyze-pr.ps1" -PRNumber 489 -Only C
#>
[CmdletBinding()]
param(
    [int]$PRNumber = 0,

    [ValidateSet("A", "B", "C")]
    [string]$Only = "A",

    [string]$Repo = "relias-engineering/hs-buddy"
)

$InformationPreference = 'Continue'
$esc = [char]27

$ErrorActionPreference = 'Stop'
$esc = [char]27
$Cyan   = "${esc}[36m"
$Green  = "${esc}[32m"
$Red    = "${esc}[31m"
$White  = "${esc}[37m"
$DGray  = "${esc}[90m"
$Reset  = "${esc}[0m"

# --- Auth ---
try {
    $authOk = & "$PSScriptRoot/ensure-auth.ps1" -Repo $Repo -Quiet
} catch {
    $authOk = $false
}
if (-not $authOk) {
    Write-Information "${esc}[91m${Red}Auth preflight failed.${Reset}${esc}[0m"
    return $false
}

# --- Resolve PR ---
if ($PRNumber -le 0) {
    Write-Information "${Cyan}No PR number supplied. Finding oldest open draft PR with agent:pr label...${Reset}"
    $PRNumber = gh pr list --repo $Repo --state open --label "agent:pr" --json number,isDraft,createdAt `
        --jq '[.[] | select(.isDraft == true)] | sort_by(.createdAt) | .[0].number // empty' 2>&1
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$PRNumber")) {
        Write-Information "${esc}[91m${Red}No open draft PR with agent:pr label found.${Reset}${esc}[0m"
        return $false
    }
    $PRNumber = [int]$PRNumber
    Write-Information "${Green}Auto-selected PR #$PRNumber${Reset}"
}

# --- Validate PR exists ---
$prJson = gh pr view $PRNumber --repo $Repo --json number,title,state,isDraft,labels 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Information "${esc}[91m${Red}PR #$PRNumber not found in $Repo.${Reset}${esc}[0m"
    return $false
}
$pr = $prJson | ConvertFrom-Json
Write-Information ""
Write-Information "${White}PR #$($pr.number): $($pr.title)${Reset}"
Write-Information "${DGray}  State: $($pr.state)  Draft: $($pr.isDraft)${Reset}"
$labelNames = ($pr.labels | ForEach-Object { $_.name }) -join ", "
if ($labelNames) {
    Write-Information "${DGray}  Labels: $labelNames${Reset}"
}

if ($pr.state -ne "OPEN") {
    Write-Information "${esc}[91m${Red}PR is $($pr.state) — cannot analyze a closed/merged PR.${Reset}${esc}[0m"
    return $false
}

# --- Map analyzer ---
$workflowFile = switch ($Only) {
    "A" { "sfl-analyzer-a.lock.yml" }
    "B" { "sfl-analyzer-b.lock.yml" }
    "C" { "sfl-analyzer-c.lock.yml" }
}
$analyzerName = "Analyzer $Only"

# --- Dispatch ---
Write-Information ""
Write-Information "${Cyan}Dispatching $analyzerName for PR #$PRNumber...${Reset}"

gh workflow run $workflowFile --repo $Repo -f "pull-request-number=$PRNumber" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Information "${esc}[91m${Red}Failed to dispatch $analyzerName.${Reset}${esc}[0m"
    return $false
}

$chainMsg = if ($Only -eq "A") { " (chains to B → C automatically)" }
            elseif ($Only -eq "B") { " (chains to C automatically)" }
            else { "" }

Write-Information "${Green}✓ $analyzerName dispatched for PR #$PRNumber$chainMsg${Reset}"
Write-Information "${DGray}  View runs: https://github.com/$Repo/actions${Reset}"
return $true
