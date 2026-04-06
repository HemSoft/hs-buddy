<#
.SYNOPSIS
    Deep forensic analysis of a single PR in the agentic pipeline.
.DESCRIPTION
    Examines a PR's body for markers, checks label state, verifies linked
    issue, and determines why the PR is or isn't progressing.
.PARAMETER PRNumber
    The PR number to investigate.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PRNumber,
    [string]$Repo = "relias-engineering/hs-buddy"
)

$ErrorActionPreference = "Stop"

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan    = "${esc}[36m"
$DGray    = "${esc}[90m"
$Yellow    = "${esc}[33m"
$Green    = "${esc}[32m"
$Magenta    = "${esc}[35m"
$Red    = "${esc}[31m"
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

    if ($PullRequest.headRefName -match 'agent-fix/issue-(\d+)') {
        return [int]$matches[1]
    }

    return $null
}

Write-Information "${Cyan}`n=== PR #$PRNumber FORENSICS ===${Reset}"

# --- Get PR details ---
$pr = gh pr view $PRNumber --repo $Repo --json number,title,isDraft,state,headRefName,labels,body,createdAt,comments 2>&1 | ConvertFrom-Json

Write-Information "Title: $($pr.title)"
Write-Information "State: $($pr.state) $(if ($pr.isDraft) { '(DRAFT)' } else { '(READY)' })"
Write-Information "Branch: $($pr.headRefName)"
Write-Information "Created: $($pr.createdAt)"
$labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
Write-Information "Labels: $labels"

# --- Extract linked issue ---
$issueNum = Get-LinkedIssueNumber -PullRequest $pr
if ($null -ne $issueNum) {
    $linkSource = if ($pr.body -match 'Closes\s+#(\d+)') {
        'body closes reference'
    } elseif ($pr.body -match '\*\*Linked Issue\*\*:\s+#(\d+)') {
        'body linked-issue marker'
    } else {
        'branch fallback'
    }
    Write-Information "${Green}Linked Issue: #$issueNum ($linkSource)${Reset}"
} else {
    Write-Information "${Red}Linked Issue: NONE FOUND${Reset}"
}

# --- Check cycle label ---
$cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
if ($cycleLabel) {
    $cycle = [int]($cycleLabel -replace "pr:cycle-", "")
    Write-Information "${Cyan}Current Cycle: $cycle (label: $cycleLabel)${Reset}"
} else {
    $cycle = 0
    Write-Information "${Yellow}Current Cycle: 0 (no cycle label)${Reset}"
}

# --- Check markers in PR body ---
Write-Information "${Yellow}`n--- MARKER ANALYSIS (cycle $cycle) ---${Reset}"
$body = $pr.body

$markerTypes = @(
    @{ Name = "Analyzer A"; Pattern = "<!-- MARKER:sfl-analyzer-a cycle:$cycle -->" },
    @{ Name = "Analyzer B"; Pattern = "<!-- MARKER:sfl-analyzer-b cycle:$cycle -->" },
    @{ Name = "Analyzer C"; Pattern = "<!-- MARKER:sfl-analyzer-c cycle:$cycle -->" },
    @{ Name = "Issue Processor"; Pattern = "<!-- MARKER:sfl-issue-processor cycle:$cycle -->" },
    @{ Name = "PR Router";  Pattern = "<!-- MARKER:sfl-pr-router cycle:$cycle -->" }
)

# Also check legacy HTML comment markers
$legacyMarkers = @(
    @{ Name = "Analyzer A (legacy)"; Pattern = "<!-- sfl-analyzer-a cycle:$cycle -->" },
    @{ Name = "Analyzer B (legacy)"; Pattern = "<!-- sfl-analyzer-b cycle:$cycle -->" },
    @{ Name = "Analyzer C (legacy)"; Pattern = "<!-- sfl-analyzer-c cycle:$cycle -->" },
    @{ Name = "Fixer (legacy)";      Pattern = "<!-- pr-fixer cycle:$cycle -->" },
    @{ Name = "Promoter (legacy)";   Pattern = "<!-- pr-promoter cycle:$cycle -->" }
)

$foundNew = 0
$foundLegacy = 0

foreach ($m in $markerTypes) {
    if ($body -and $body.Contains($m.Pattern)) {
        Write-Information "${Green}  FOUND: $($m.Name) -> $($m.Pattern)${Reset}"
        $foundNew++
    } else {
        Write-Information "${Red}  MISSING: $($m.Name) -> $($m.Pattern)${Reset}"
    }
}

foreach ($m in $legacyMarkers) {
    if ($body -and $body.Contains($m.Pattern)) {
        Write-Information "${Yellow}  FOUND (LEGACY): $($m.Name) -> $($m.Pattern)${Reset}"
        $foundLegacy++
    }
}

if ($foundLegacy -gt 0 -and $foundNew -eq 0) {
    Write-Information "${Red}`n  WARNING: Only legacy HTML comment markers found.${Reset}"
    Write-Information "${Red}  The new <!-- MARKER:... --> format is not being produced.${Reset}"
    Write-Information "${Red}  This is likely why the PR is stuck.${Reset}"
}

# --- Check review content in body ---
Write-Information "${Yellow}`n--- REVIEW CONTENT ---${Reset}"
$analyzerCount = ([regex]::Matches($body, "PR Analysis [ABC]")).Count
Write-Information "  Analyzer review sections found in body: $analyzerCount"
if ($analyzerCount -gt 3) {
    Write-Information "${Red}  WARNING: More than 3 reviews — duplicate reviews being appended!${Reset}"
    Write-Information "${DGray}  Body length: $($body.Length) chars${Reset}"
}

# --- Check verdicts ---
Write-Information "${Yellow}`n--- VERDICTS ---${Reset}"
$passCount = ([regex]::Matches($body, "\*\*PASS\*\*")).Count
$blockCount = ([regex]::Matches($body, "\*\*BLOCKING ISSUES FOUND\*\*")).Count
Write-Information "  PASS verdicts: $passCount"
Write-Information "  BLOCKING verdicts: $blockCount"

# --- Check supersede narrative against emitted safe outputs ---
Write-Information "${Yellow}`n--- FOLLOW-UP OUTPUT PROOF ---${Reset}"
$supersedeNarrative = $false
$supersededPR = $null
if ($body -match "Supersedes #(\d+)") {
    $supersedeNarrative = $true
    $supersededPR = $matches[1]
    Write-Information "${Yellow}  Supersede narrative found in PR body: #$supersededPR${Reset}"
} else {
    Write-Information "${DGray}  No supersede narrative found in PR body.${Reset}"
}

$implementerRunId = $null
if ($body -match "Generated by \[SFL Issue Processor / Implementer\]\([^)]*/actions/runs/(\d+)\)") {
    $implementerRunId = $matches[1]
    Write-Information "${Cyan}  Implementer run: $implementerRunId${Reset}"
} else {
    Write-Information "${DGray}  Implementer run: not found in PR body${Reset}"
}

if ($implementerRunId) {
    try {
        $artifactRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sfl-pr-forensics-$PRNumber-$implementerRunId"
        if (Test-Path $artifactRoot) {
            Remove-Item -Recurse -Force $artifactRoot
        }
        New-Item -ItemType Directory -Path $artifactRoot | Out-Null
        gh run download $implementerRunId --repo $Repo -D $artifactRoot 2>$null | Out-Null

        $agentOutputPath = Join-Path $artifactRoot "agent-output\agent_output.json"
        if (Test-Path $agentOutputPath) {
            $agentOutput = Get-Content $agentOutputPath -Raw | ConvertFrom-Json
            $emittedTypes = @($agentOutput.items | ForEach-Object { $_.type })
            $uniqueTypes = @($emittedTypes | Sort-Object -Unique)
            Write-Information "  Emitted safe outputs: $($uniqueTypes -join ', ')"

            $attemptedPush = $uniqueTypes -contains "push_to_pull_request_branch"
            $attemptedCreate = $uniqueTypes -contains "create_pull_request"

            if ($supersedeNarrative -and -not $attemptedPush) {
                Write-Information "${Red}  NARRATIVE MISMATCH: PR claims a superseding follow-up after push failure, but the run emitted no push_to_pull_request_branch output.${Reset}"
                if ($attemptedCreate) {
                    Write-Information "${Yellow}  The run emitted create_pull_request instead, which indicates invalid output selection rather than a proven push failure.${Reset}"
                }
            } elseif ($supersedeNarrative -and $attemptedPush) {
                Write-Information "${Yellow}  Push attempt evidence found for the supersede narrative. Inspect run logs for the concrete failure reason.${Reset}"
            }
        } else {
            Write-Information "${DGray}  Agent output artifact not found for implementer run.${Reset}"
        }
    } catch {
        Write-Information "${DGray}  Unable to inspect implementer run artifacts: $($_.Exception.Message)${Reset}"
    }
}

# --- Check linked issue state ---
if ($issueNum) {
    Write-Information "${Yellow}`n--- LINKED ISSUE #$issueNum ---${Reset}"
    $issue = gh issue view $issueNum --repo $Repo --json number,title,state,labels 2>&1 | ConvertFrom-Json
    $relatedPRs = gh pr list --repo $Repo --state open --json number,headRefName,isDraft,labels,body 2>&1 | ConvertFrom-Json |
        Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq [int]$issueNum)
        }
    $issueLabels = ($issue.labels | ForEach-Object { $_.name }) -join ", "
    Write-Information "  State: $($issue.state)"
    Write-Information "  Labels: $issueLabels"
    Write-Information "  Open agent PRs for issue: $((@($relatedPRs) | ForEach-Object { "#$($_.number)" }) -join ', ')"

    if (@($relatedPRs).Count -gt 1) {
        Write-Information "${Red}  Issue<->PR link: AMBIGUOUS (multiple open agent PRs)${Reset}"
    } elseif ($issue.state -eq "CLOSED" -and $pr.state -eq "MERGED") {
        if (($issue.labels | ForEach-Object { $_.name }) -contains "agent:in-progress") {
            Write-Information "${Yellow}  Issue<->PR link: RESOLVED (issue closed, stale agent:in-progress label remains)${Reset}"
        } else {
            Write-Information "${Green}  Issue<->PR link: RESOLVED${Reset}"
        }
    } elseif ($issue.state -eq "OPEN" -and ($issue.labels | ForEach-Object { $_.name }) -contains "agent:in-progress") {
        Write-Information "${Green}  Issue<->PR link: HEALTHY${Reset}"
    } else {
        Write-Information "${Red}  Issue<->PR link: BROKEN${Reset}"
    }
}

# --- Diagnosis ---
Write-Information "${Magenta}`n--- DIAGNOSIS ---${Reset}"
if ($foundNew -ge 3 -and $blockCount -eq 0) {
    Write-Information "${Green}  All 3 analyzer markers present, no blocking issues.${Reset}"
    Write-Information "${Green}  PR should be progressing to SFL PR Router.${Reset}"
    if ($pr.isDraft) {
        Write-Information "${Yellow}  PR is still draft — check PR Router and label-actions logs.${Reset}"
    }
} elseif ($foundNew -lt 3 -and $foundLegacy -gt 0) {
    Write-Information "${Red}  STUCK: Analyzers are producing legacy markers, not new <!-- MARKER: --> format.${Reset}"
    Write-Information "${Yellow}  FIX: Update analyzer .md prompts and ensure runtime-import picks up changes.${Reset}"
} elseif ($foundNew -lt 3) {
    $missing = $markerTypes | Where-Object { -not $body.Contains($_.Pattern) } | ForEach-Object { $_.Name }
    Write-Information "${Yellow}  WAITING: Missing markers from: $($missing -join ', ')${Reset}"
    Write-Information "${DGray}  These analyzers either haven't run yet or failed to produce markers.${Reset}"
} elseif ($blockCount -gt 0) {
    Write-Information "${Yellow}  BLOCKED: Analyzer(s) found blocking issues.${Reset}"
    Write-Information "${DGray}  Issue Processor should address these on the next run.${Reset}"
}

if ($issueNum) {
    $relatedPRs = gh pr list --repo $Repo --state open --json number,headRefName,labels,body 2>&1 | ConvertFrom-Json |
        Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq [int]$issueNum)
        }
    if (@($relatedPRs).Count -gt 1) {
        $prNumbers = (@($relatedPRs) | ForEach-Object { "#$($_.number)" }) -join ", "
        Write-Information "${Red}  DUPLICATE STATE: Issue #$issueNum currently has multiple open agent PRs: $prNumbers${Reset}"
        Write-Information "${Yellow}  Treat this as a pipeline failure, not a healthy in-progress state.${Reset}"
    }
}

Write-Information "${Cyan}`n=== FORENSICS COMPLETE ===${Reset}"