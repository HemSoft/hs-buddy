<#
.SYNOPSIS
    Stage 4 — Enable Issue Processor

.DESCRIPTION
        Enables the core issue-to-PR pipeline entrypoint:
            - Issue Processor    — claims an agent:fixable issue, creates a branch, opens a draft PR

        IMPORTANT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue,
        because analyzers are event-driven (pull_request: opened) and will miss the
        event if disabled when the PR opens.
#>

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$White = "${esc}[37m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${Cyan}=== Stage 4: Enable Issue Processor ===${Reset}"
Write-Information ""
Write-Information "${White}This will enable:${Reset}"
Write-Information "${White}  - Issue Processor   (claims issues -> opens draft PRs)${Reset}"
Write-Information ""
Write-Information "${Red}IMPORTANT: Enable PR Analyzers (Stage 5) before opening a new${Reset}"
Write-Information "${Red}fixable issue, or the analyzers will miss the pull_request:opened event.${Reset}"
Write-Information ""

# Show current issue count
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
$issueColor = if ([int]$issueCount -gt 0) { $Green } else { $Yellow }
Write-Information "${issueColor}Current agent:fixable issues: $issueCount${Reset}"
Write-Information ""

$confirm = Read-Host "Enable Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${Yellow}Aborted.${Reset}"
    return
}

$workflows = @(
    @{ File = "sfl-issue-processor.lock.yml";    Name = "SFL Issue Processor" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Information "${DGray}  Already enabled: $($wf.Name)${Reset}"
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${Green}  Enabled: $($wf.Name)${Reset}"
        } else {
            Write-Information "${Red}  Failed:  $($wf.Name)${Reset}"
        }
    }
}

Write-Information ""
Write-Information "${Green}Issue Processor enabled.${Reset}"
Write-Information ""
Write-Information "${Red}NEXT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue!${Reset}"
Write-Information ""
Write-Information "${Cyan}Next step: Stage 5 (05-enable-pr-analyzers.ps1)${Reset}"
Write-Information ""
