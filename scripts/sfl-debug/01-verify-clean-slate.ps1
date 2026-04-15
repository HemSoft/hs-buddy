<#
.SYNOPSIS
    Stage 1 — Verify Clean Slate

.DESCRIPTION
    Confirms the SFL pipeline is fully stopped and the repo is in a clean state:
      - All SFL workflows are disabled
      - No open issues with agent:fixable label
      - No open pull requests with agent:pr label

    This is the starting point for a from-scratch SFL debug session.
    Run this FIRST before gradually enabling stages.
#>

$ErrorActionPreference = 'Stop'

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan    = "${esc}[36m"
$DGray    = "${esc}[90m"
$Green    = "${esc}[32m"
$Red    = "${esc}[31m"
$White    = "${esc}[37m"
$Yellow    = "${esc}[33m"
$Reset   = "${esc}[0m"
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${Cyan}=== Stage 1: Verify Clean Slate ===${Reset}"
Write-Information ""
Write-Information "${White}This script checks that:${Reset}"
Write-Information "${White}  1. All SFL workflows are disabled${Reset}"
Write-Information "${White}  2. No open agent:fixable issues exist${Reset}"
Write-Information "${White}  3. No open agent:pr pull requests exist${Reset}"
Write-Information ""
Write-Information "${DGray}Repo: $repo${Reset}"
Write-Information ""

# ── Check workflows ──────────────────────────────────────────────────────────

$sflWorkflows = @(
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "PR Analyzer A — Full-Spectrum Review"
    "PR Analyzer B — Full-Spectrum Review"
    "PR Analyzer C — Full-Spectrum Review"
    "Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Information "${Yellow}Checking workflow states...${Reset}"
$allDisabled = $true
foreach ($wf in $sflWorkflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Information "${Red}  ACTIVE:   $wf${Reset}"
        $allDisabled = $false
    } else {
        Write-Information "${DGray}  Disabled: $wf${Reset}"
    }
}

# ── Check issues ─────────────────────────────────────────────────────────────

Write-Information ""
Write-Information "${Yellow}Checking for open agent:fixable issues...${Reset}"
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
if ([int]$issueCount -gt 0) {
    Write-Information "${Yellow}  Found $issueCount open agent:fixable issue(s)${Reset}"
    gh issue list --repo $repo --label "agent:fixable" --state open --json number,title --jq '.[] | "    #\(.number) \(.title)"' | ForEach-Object { Write-Information "${Yellow}$_${Reset}" }
} else {
    Write-Information "${DGray}  No open agent:fixable issues${Reset}"
}

# ── Check PRs ────────────────────────────────────────────────────────────────

Write-Information ""
Write-Information "${Yellow}Checking for open agent:pr pull requests...${Reset}"
$prCount = gh pr list --repo $repo --label "agent:pr" --state open --json number --jq 'length'
if ([int]$prCount -gt 0) {
    Write-Information "${Yellow}  Found $prCount open agent:pr PR(s)${Reset}"
    gh pr list --repo $repo --label "agent:pr" --state open --json number,title --jq '.[] | "    #\(.number) \(.title)"' | ForEach-Object { Write-Information "${Yellow}$_${Reset}" }
} else {
    Write-Information "${DGray}  No open agent:pr PRs${Reset}"
}

# ── Verdict ──────────────────────────────────────────────────────────────────

Write-Information ""
if ($allDisabled -and [int]$issueCount -eq 0 -and [int]$prCount -eq 0) {
    Write-Information "${Green}CLEAN SLATE CONFIRMED${Reset}"
    Write-Information "${Green}Ready to proceed with Stage 2 (02-enable-reporting.ps1).${Reset}"
} else {
    Write-Information "${Red}NOT a clean slate.${Reset}"
    if (-not $allDisabled) {
        Write-Information "${Red}  -> Some workflows are still active. Run ../pause-sfl.ps1 first.${Reset}"
    }
    if ([int]$issueCount -gt 0) {
        Write-Information "${Red}  -> Close or unlabel the agent:fixable issues above if starting fresh.${Reset}"
    }
    if ([int]$prCount -gt 0) {
        Write-Information "${Red}  -> Close the agent:pr PRs above if starting fresh.${Reset}"
    }
}
Write-Information ""
