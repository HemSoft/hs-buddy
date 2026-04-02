<#
.SYNOPSIS
    Full ecosystem snapshot — issues, PRs, labels, recent workflow runs.
.DESCRIPTION
    Produces a structured overview of the current state of the hs-buddy
    agentic loop. Use as the first step in any debug session.
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan    = "${esc}[36m"
$DGray    = "${esc}[90m"
$Green    = "${esc}[32m"
$Red    = "${esc}[31m"
$Yellow    = "${esc}[33m"
$Reset   = "${esc}[0m"

function Get-LinkedIssueNumber {
    param(
        [Parameter(Mandatory)]
        $PullRequest
    )

    $body = [string]$PullRequest.body
    if ($body -match 'Closes\s+#(\d+)') {
        return [int]$matches[1]
    }

    if ($body -match '\*\*Linked Issue\*\*:\s+#(\d+)') {
        return [int]$matches[1]
    }

    if ($PullRequest.headRefName -match 'agent-fix/issue-(\d+)-') {
        return [int]$matches[1]
    }

    return $null
}

Write-Information "${Cyan}`n=== ECOSYSTEM SNAPSHOT ===${Reset}"
Write-Information "Repo: $Repo"
Write-Information "Time: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')) (local) / $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')) (UTC)"
Write-Information ""

# --- Issues ---
Write-Information "${Yellow}--- OPEN ISSUES WITH AGENT LABELS ---${Reset}"
$issueRaw = gh issue list --repo $Repo --state open --json number,title,labels,createdAt 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Information "${Red}  ERROR: gh issue list failed. Check gh auth status.${Reset}"
    Write-Information "${DGray}  Output: $issueRaw${Reset}"
    exit 1
}
$issues = ($issueRaw | ConvertFrom-Json) | Where-Object { $_.labels | Where-Object { $_.name -like "agent:*" } }
if ($issues) {
    foreach ($i in $issues) {
        $labels = ($i.labels | ForEach-Object { $_.name }) -join ", "
        Write-Information "  #$($i.number) $($i.title)"
        Write-Information "${DGray}    Labels: $labels${Reset}"
    }
} else {
    Write-Information "${Green}  No active agent issues.${Reset}"
}

# --- PRs ---
Write-Information "${Yellow}`n--- OPEN PULL REQUESTS ---${Reset}"
$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,createdAt,body 2>&1 | ConvertFrom-Json
if ($prs) {
    foreach ($pr in $prs) {
        $labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
        $draft = if ($pr.isDraft) { "(DRAFT)" } else { "(READY)" }
        Write-Information "  PR #$($pr.number) $draft $($pr.title)"
        Write-Information "${DGray}    Branch: $($pr.headRefName)${Reset}"
        Write-Information "${DGray}    Labels: $labels${Reset}"
    }
} else {
    Write-Information "${Green}  No open PRs.${Reset}"
}

# --- Label Count ---
Write-Information "${Yellow}`n--- LABEL METRICS ---${Reset}"
$labelCount = (gh label list --repo $Repo --json name --jq '.[].name' 2>&1 | Measure-Object -Line).Lines
$lblColor = if ($labelCount -le 20) { $Green } elseif ($labelCount -le 25) { $Yellow } else { $Red }
Write-Information "${lblColor}  Total labels: $labelCount${Reset}"
if ($labelCount -gt 25) {
    Write-Information "${Red}  WARNING: Label count exceeds recommended maximum of 25!${Reset}"
}

# --- Harmony Check ---
Write-Information "${Yellow}`n--- HARMONY CHECK ---${Reset}"
$harmony = $true

$agentIssuePrMap = @{}
foreach ($pr in $prs) {
    $labelNames = @($pr.labels | ForEach-Object { $_.name })
    if ($labelNames -contains "agent:pr") {
        $issueNumber = Get-LinkedIssueNumber -PullRequest $pr
        if ($null -eq $issueNumber) {
            continue
        }
        if (-not $agentIssuePrMap.ContainsKey($issueNumber)) {
            $agentIssuePrMap[$issueNumber] = @()
        }
        $agentIssuePrMap[$issueNumber] += $pr
    }
}

# Check: every in-progress issue has a PR
foreach ($i in $issues) {
    $isInProgress = ($i.labels | ForEach-Object { $_.name }) -contains "agent:in-progress"
    if ($isInProgress) {
        $num = $i.number
        $matchingPRs = @($prs | Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq $num)
        })
        if ($matchingPRs.Count -eq 0) {
            Write-Information "${Red}  FAIL: Issue #$num (agent:in-progress) has no matching PR${Reset}"
            $harmony = $false
        } elseif ($matchingPRs.Count -gt 1) {
            $prNumbers = ($matchingPRs | ForEach-Object { "#$($_.number)" }) -join ", "
            Write-Information "${Red}  FAIL: Issue #$num (agent:in-progress) has multiple matching PRs: $prNumbers${Reset}"
            $harmony = $false
        } else {
            Write-Information "${Green}  OK: Issue #$num -> PR #$($matchingPRs[0].number)${Reset}"
        }
    }
}

# Check: no issue has both in-progress and fixable
foreach ($i in $issues) {
    $labelNames = $i.labels | ForEach-Object { $_.name }
    if (($labelNames -contains "agent:in-progress") -and ($labelNames -contains "agent:fixable")) {
        Write-Information "${Red}  FAIL: Issue #$($i.number) has BOTH agent:in-progress AND agent:fixable${Reset}"
        $harmony = $false
    }
}

# Check: no issue has more than one open agent PR
foreach ($entry in $agentIssuePrMap.GetEnumerator() | Sort-Object Name) {
    if ($entry.Value.Count -gt 1) {
        $prNumbers = ($entry.Value | ForEach-Object { "#$($_.number)" }) -join ", "
        Write-Information "${Red}  FAIL: Issue #$($entry.Key) is split across multiple open agent PRs: $prNumbers${Reset}"
        $harmony = $false
    }
}

if ($harmony) {
    Write-Information "${Green}  All harmony checks passed.${Reset}"
}

# --- Recent Workflow Runs ---
Write-Information "${Yellow}`n--- RECENT WORKFLOW RUNS (last 2 hours) ---${Reset}"
$since = [DateTime]::UtcNow.AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
$workflows = @(
    "sfl-auditor.lock.yml",
    "sfl-issue-processor.lock.yml",
    "repo-audit.lock.yml",
    "sfl-analyzer-a.lock.yml",
    "sfl-analyzer-b.lock.yml",
    "sfl-analyzer-c.lock.yml",
    "sfl-pr-router.yml",
    "sfl-pr-label-actions.yml"
)
foreach ($w in $workflows) {
    $shortName = $w -replace '\.lock\.yml$', ''
    $runs = gh run list --repo $Repo --workflow $w --limit 10 --json databaseId,status,conclusion,createdAt 2>&1 | ConvertFrom-Json | Where-Object { $_.createdAt -ge $since }
    $total = ($runs | Measure-Object).Count
    $failures = $runs | Where-Object { $_.conclusion -and $_.conclusion -ne "success" }
    $failCount = ($failures | Measure-Object).Count
    $inProgress = $runs | Where-Object { -not $_.conclusion }
    $ipCount = ($inProgress | Measure-Object).Count

    $status = if ($total -eq 0) { "(no runs)" } elseif ($failCount -gt 0) { "$failCount FAILED" } else { "all success" }
    $wfColor = if ($failCount -gt 0) { $Red } elseif ($total -eq 0) { $DGray } else { $Green }
    $extra = if ($ipCount -gt 0) { " +${ipCount} in-progress" } else { "" }
    Write-Information "${wfColor}  ${shortName}: $total runs, $status$extra${Reset}"
}

Write-Information "${Cyan}`n=== SNAPSHOT COMPLETE ===${Reset}"