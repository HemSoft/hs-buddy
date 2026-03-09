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

Write-Host "`n=== PR #$PRNumber FORENSICS ===" -ForegroundColor Cyan

# --- Get PR details ---
$pr = gh pr view $PRNumber --repo $Repo --json number,title,isDraft,state,headRefName,labels,body,createdAt,comments 2>&1 | ConvertFrom-Json

Write-Host "Title: $($pr.title)"
Write-Host "State: $($pr.state) $(if ($pr.isDraft) { '(DRAFT)' } else { '(READY)' })"
Write-Host "Branch: $($pr.headRefName)"
Write-Host "Created: $($pr.createdAt)"
$labels = ($pr.labels | ForEach-Object { $_.name }) -join ", "
Write-Host "Labels: $labels"

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
    Write-Host "Linked Issue: #$issueNum ($linkSource)" -ForegroundColor Green
} else {
    Write-Host "Linked Issue: NONE FOUND" -ForegroundColor Red
}

# --- Check cycle label ---
$cycleLabel = ($pr.labels | ForEach-Object { $_.name }) | Where-Object { $_ -match "^pr:cycle-\d+$" }
if ($cycleLabel) {
    $cycle = [int]($cycleLabel -replace "pr:cycle-", "")
    Write-Host "Current Cycle: $cycle (label: $cycleLabel)" -ForegroundColor Cyan
} else {
    $cycle = 0
    Write-Host "Current Cycle: 0 (no cycle label)" -ForegroundColor Yellow
}

# --- Check markers in PR body ---
Write-Host "`n--- MARKER ANALYSIS (cycle $cycle) ---" -ForegroundColor Yellow
$body = $pr.body

$markerTypes = @(
    @{ Name = "Analyzer A"; Pattern = "[MARKER:sfl-analyzer-a cycle:$cycle]" },
    @{ Name = "Analyzer B"; Pattern = "[MARKER:sfl-analyzer-b cycle:$cycle]" },
    @{ Name = "Analyzer C"; Pattern = "[MARKER:sfl-analyzer-c cycle:$cycle]" },
    @{ Name = "Issue Processor"; Pattern = "[MARKER:sfl-issue-processor cycle:$cycle]" },
    @{ Name = "PR Router";  Pattern = "[MARKER:sfl-pr-router cycle:$cycle]" }
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
        Write-Host "  FOUND: $($m.Name) -> $($m.Pattern)" -ForegroundColor Green
        $foundNew++
    } else {
        Write-Host "  MISSING: $($m.Name) -> $($m.Pattern)" -ForegroundColor Red
    }
}

foreach ($m in $legacyMarkers) {
    if ($body -and $body.Contains($m.Pattern)) {
        Write-Host "  FOUND (LEGACY): $($m.Name) -> $($m.Pattern)" -ForegroundColor DarkYellow
        $foundLegacy++
    }
}

if ($foundLegacy -gt 0 -and $foundNew -eq 0) {
    Write-Host "`n  WARNING: Only legacy HTML comment markers found." -ForegroundColor Red
    Write-Host "  The new [MARKER:...] format is not being produced." -ForegroundColor Red
    Write-Host "  This is likely why the PR is stuck." -ForegroundColor Red
}

# --- Check review content in body ---
Write-Host "`n--- REVIEW CONTENT ---" -ForegroundColor Yellow
$analyzerCount = ([regex]::Matches($body, "PR Analysis [ABC]")).Count
Write-Host "  Analyzer review sections found in body: $analyzerCount"
if ($analyzerCount -gt 3) {
    Write-Host "  WARNING: More than 3 reviews — duplicate reviews being appended!" -ForegroundColor Red
    Write-Host "  Body length: $($body.Length) chars" -ForegroundColor DarkGray
}

# --- Check verdicts ---
Write-Host "`n--- VERDICTS ---" -ForegroundColor Yellow
$passCount = ([regex]::Matches($body, "\*\*PASS\*\*")).Count
$blockCount = ([regex]::Matches($body, "\*\*BLOCKING ISSUES FOUND\*\*")).Count
Write-Host "  PASS verdicts: $passCount"
Write-Host "  BLOCKING verdicts: $blockCount"

# --- Check supersede narrative against emitted safe outputs ---
Write-Host "`n--- FOLLOW-UP OUTPUT PROOF ---" -ForegroundColor Yellow
$supersedeNarrative = $false
$supersededPR = $null
if ($body -match "Supersedes #(\d+)") {
    $supersedeNarrative = $true
    $supersededPR = $matches[1]
    Write-Host "  Supersede narrative found in PR body: #$supersededPR" -ForegroundColor Yellow
} else {
    Write-Host "  No supersede narrative found in PR body." -ForegroundColor DarkGray
}

$implementerRunId = $null
if ($body -match "Generated by \[SFL Issue Processor / Implementer\]\([^)]*/actions/runs/(\d+)\)") {
    $implementerRunId = $matches[1]
    Write-Host "  Implementer run: $implementerRunId" -ForegroundColor Cyan
} else {
    Write-Host "  Implementer run: not found in PR body" -ForegroundColor DarkGray
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
            Write-Host "  Emitted safe outputs: $($uniqueTypes -join ', ')"

            $attemptedPush = $uniqueTypes -contains "push_to_pull_request_branch"
            $attemptedCreate = $uniqueTypes -contains "create_pull_request"

            if ($supersedeNarrative -and -not $attemptedPush) {
                Write-Host "  NARRATIVE MISMATCH: PR claims a superseding follow-up after push failure, but the run emitted no push_to_pull_request_branch output." -ForegroundColor Red
                if ($attemptedCreate) {
                    Write-Host "  The run emitted create_pull_request instead, which indicates invalid output selection rather than a proven push failure." -ForegroundColor Yellow
                }
            } elseif ($supersedeNarrative -and $attemptedPush) {
                Write-Host "  Push attempt evidence found for the supersede narrative. Inspect run logs for the concrete failure reason." -ForegroundColor Yellow
            }
        } else {
            Write-Host "  Agent output artifact not found for implementer run." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  Unable to inspect implementer run artifacts: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

# --- Check linked issue state ---
if ($issueNum) {
    Write-Host "`n--- LINKED ISSUE #$issueNum ---" -ForegroundColor Yellow
    $issue = gh issue view $issueNum --repo $Repo --json number,title,state,labels 2>&1 | ConvertFrom-Json
    $relatedPRs = gh pr list --repo $Repo --state open --json number,headRefName,isDraft,labels,body 2>&1 | ConvertFrom-Json |
        Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq [int]$issueNum)
        }
    $issueLabels = ($issue.labels | ForEach-Object { $_.name }) -join ", "
    Write-Host "  State: $($issue.state)"
    Write-Host "  Labels: $issueLabels"
    Write-Host "  Open agent PRs for issue: $((@($relatedPRs) | ForEach-Object { "#$($_.number)" }) -join ', ')"

    if (@($relatedPRs).Count -gt 1) {
        Write-Host "  Issue<->PR link: AMBIGUOUS (multiple open agent PRs)" -ForegroundColor Red
    } elseif ($issue.state -eq "CLOSED" -and $pr.state -eq "MERGED") {
        if (($issue.labels | ForEach-Object { $_.name }) -contains "agent:in-progress") {
            Write-Host "  Issue<->PR link: RESOLVED (issue closed, stale agent:in-progress label remains)" -ForegroundColor Yellow
        } else {
            Write-Host "  Issue<->PR link: RESOLVED" -ForegroundColor Green
        }
    } elseif ($issue.state -eq "OPEN" -and ($issue.labels | ForEach-Object { $_.name }) -contains "agent:in-progress") {
        Write-Host "  Issue<->PR link: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "  Issue<->PR link: BROKEN" -ForegroundColor Red
    }
}

# --- Diagnosis ---
Write-Host "`n--- DIAGNOSIS ---" -ForegroundColor Magenta
if ($foundNew -ge 3 -and $blockCount -eq 0) {
    Write-Host "  All 3 analyzer markers present, no blocking issues." -ForegroundColor Green
    Write-Host "  PR should be progressing to SFL PR Router." -ForegroundColor Green
    if ($pr.isDraft) {
        Write-Host "  PR is still draft — check PR Router and label-actions logs." -ForegroundColor Yellow
    }
} elseif ($foundNew -lt 3 -and $foundLegacy -gt 0) {
    Write-Host "  STUCK: Analyzers are producing legacy markers, not new [MARKER:] format." -ForegroundColor Red
    Write-Host "  FIX: Update analyzer .md prompts and ensure runtime-import picks up changes." -ForegroundColor Yellow
} elseif ($foundNew -lt 3) {
    $missing = $markerTypes | Where-Object { -not $body.Contains($_.Pattern) } | ForEach-Object { $_.Name }
    Write-Host "  WAITING: Missing markers from: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "  These analyzers either haven't run yet or failed to produce markers." -ForegroundColor DarkGray
} elseif ($blockCount -gt 0) {
    Write-Host "  BLOCKED: Analyzer(s) found blocking issues." -ForegroundColor Yellow
    Write-Host "  Issue Processor should address these on the next run." -ForegroundColor DarkGray
}

if ($issueNum) {
    $relatedPRs = gh pr list --repo $Repo --state open --json number,headRefName,labels,body 2>&1 | ConvertFrom-Json |
        Where-Object {
            $prLabelNames = @($_.labels | ForEach-Object { $_.name })
            ($prLabelNames -contains "agent:pr") -and ((Get-LinkedIssueNumber -PullRequest $_) -eq [int]$issueNum)
        }
    if (@($relatedPRs).Count -gt 1) {
        $prNumbers = (@($relatedPRs) | ForEach-Object { "#$($_.number)" }) -join ", "
        Write-Host "  DUPLICATE STATE: Issue #$issueNum currently has multiple open agent PRs: $prNumbers" -ForegroundColor Red
        Write-Host "  Treat this as a pipeline failure, not a healthy in-progress state." -ForegroundColor Yellow
    }
}

Write-Host "`n=== FORENSICS COMPLETE ===" -ForegroundColor Cyan
