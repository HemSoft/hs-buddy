<#
.SYNOPSIS
    Submits an approval review for a pull request by number.
.DESCRIPTION
    Uses gh CLI to approve a PR review in the target repository.
    Runs ensure-auth first to enforce org/account mapping.
    If PRNumber is omitted, selects the oldest OPEN non-draft PR labeled
    human:ready-for-review.
.PARAMETER PRNumber
    Pull request number to approve. Optional.
.PARAMETER Repo
    Target repo in org/repo format (default: relias-engineering/hs-buddy).
.PARAMETER Body
    Optional approval message.
.OUTPUTS
    Returns $true on success, $false on failure.
.EXAMPLE
    & ".agents/skills/sfl/scripts/pr-approve.ps1" -PRNumber 101
    & ".agents/skills/sfl/scripts/pr-approve.ps1"
    & ".agents/skills/sfl/scripts/pr-approve.ps1" -PRNumber 101 -Body "SFL checks complete."
#>
[CmdletBinding()]
param(
    [int]$PRNumber = 0,

    [string]$Repo = "relias-engineering/hs-buddy",

    [string]$Body = "SFL admin approval via pr-approve command."
)

$authOk = & "$PSScriptRoot/ensure-auth.ps1" -Repo $Repo -Quiet
if (-not $authOk) {
    Write-Error "Auth preflight failed. Approval not submitted."
    return $false
}

$autoSelected = $false
if ($PRNumber -le 0) {
    $autoSelected = $true
    Write-Host "No PRNumber supplied. Selecting oldest OPEN non-draft PR with label 'human:ready-for-review'..." -ForegroundColor Cyan
    $selected = gh pr list --repo $Repo --state open --label "human:ready-for-review" --json number,isDraft,createdAt --jq '[.[] | select(.isDraft == false)] | sort_by(.createdAt) | .[0].number // empty' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to query candidate PRs in $Repo : $selected"
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($selected)) {
        Write-Error "No OPEN non-draft PR found with label 'human:ready-for-review' in $Repo."
        return $false
    }

    [int]$PRNumber = $selected.Trim()
    Write-Host "Selected PR #$PRNumber" -ForegroundColor Yellow
}

# Validate PR and evaluate SFL readiness criteria before approval.
$prJson = gh pr view $PRNumber --repo $Repo --json state,isDraft,labels,body,title,url 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Could not read PR #$PRNumber in $Repo : $prJson"
    return $false
}

$pr = $prJson | ConvertFrom-Json
$labelNames = @($pr.labels | ForEach-Object { $_.name })
$missingCriteria = New-Object System.Collections.Generic.List[string]

if ($pr.state -ne "OPEN") {
    $missingCriteria.Add("PR must be OPEN (current: $($pr.state))") | Out-Null
}
if ($pr.isDraft) {
    $missingCriteria.Add("PR must be non-draft") | Out-Null
}
if ($labelNames -notcontains "human:ready-for-review") {
    $missingCriteria.Add("Missing label: human:ready-for-review") | Out-Null
}

foreach ($requiredReviewLabel in @("review:a-done", "review:b-done", "review:c-done")) {
    if ($labelNames -notcontains $requiredReviewLabel) {
        $missingCriteria.Add("Missing label: $requiredReviewLabel") | Out-Null
    }
}

foreach ($analyzer in @("a", "b", "c")) {
    if ($pr.body -notmatch "\[MARKER:sfl-analyzer-$analyzer cycle:\d+\]") {
        $missingCriteria.Add("Missing analyzer marker for analyzer $analyzer") | Out-Null
        continue
    }
    if ($pr.body -notmatch "(?s)\[MARKER:sfl-analyzer-$analyzer cycle:\d+\].*?\*\*PASS\*\*") {
        $missingCriteria.Add("Analyzer $analyzer does not show PASS verdict") | Out-Null
    }
}

if ($missingCriteria.Count -gt 0) {
    Write-Error "PR #$PRNumber does not meet merge-suggestion criteria:"
    foreach ($item in $missingCriteria) {
        Write-Error " - $item"
    }
    return $false
}

if ($autoSelected) {
    Write-Host "Merge suggestion: PR #$PRNumber meets SFL criteria and is a candidate to merge after human review." -ForegroundColor Green
}

Write-Host "Submitting approval for PR #$PRNumber in $Repo..." -ForegroundColor Cyan
$approveResult = gh pr review $PRNumber --repo $Repo --approve --body $Body 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to approve PR #$PRNumber : $approveResult"
    return $false
}

Write-Host "Approved PR #$PRNumber" -ForegroundColor Green
return $true
