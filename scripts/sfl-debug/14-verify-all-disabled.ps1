<#
.SYNOPSIS
    Stage 14 — Verify All Disabled

.DESCRIPTION
    Confirms all SFL workflows are disabled after a gradual shutdown.
    This is the mirror of Stage 1 (verify-clean-slate) but only checks
    workflow state — it does NOT check for open issues/PRs since those
    may legitimately remain after a shutdown.

    For a full clean-slate check, use 01-verify-clean-slate.ps1 instead.
#>

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${Cyan}=== Stage 14: Verify All Disabled ===${Reset}"
Write-Information ""
Write-Information "${Yellow}Checking all SFL workflow states...${Reset}"
Write-Information ""

$sflWorkflows = @(
    "SFL Auditor"
    "Issue Processor"
    "PR Fixer — Authority"
    "PR Promoter"
    "PR Analyzer A — Full-Spectrum Review"
    "PR Analyzer B — Full-Spectrum Review"
    "PR Analyzer C — Full-Spectrum Review"
    "Daily Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

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

Write-Information ""
if ($allDisabled) {
    Write-Information "${Green}ALL SFL WORKFLOWS DISABLED${Reset}"
    Write-Information "${Green}Pipeline is fully stopped.${Reset}"
} else {
    Write-Information "${Red}Some workflows are still active!${Reset}"
    Write-Information "${Red}Run ../pause-sfl.ps1 to force-disable all, or disable individually above.${Reset}"
}

# Also show residual state for awareness
Write-Information ""
Write-Information "${Yellow}Residual state (informational):${Reset}"
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
$prCount = gh pr list --repo $repo --label "agent:pr" --state open --json number --jq 'length'
$issueColor = if ([int]$issueCount -gt 0) { $Yellow } else { $DGray }
$prColor = if ([int]$prCount -gt 0) { $Yellow } else { $DGray }
Write-Information "${issueColor}  Open agent:fixable issues: $issueCount${Reset}"
Write-Information "${prColor}  Open agent:pr PRs:         $prCount${Reset}"
Write-Information ""
