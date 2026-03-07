[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy",
    [string]$LastCheckUtc,
    [switch]$AsJson
)

$ErrorActionPreference = "Stop"

if (-not $LastCheckUtc) {
    if (Test-Path ".github/prompts/.status-checkpoint") {
        $LastCheckUtc = (Get-Content ".github/prompts/.status-checkpoint" -Raw).Trim()
    } else {
        $LastCheckUtc = [DateTime]::UtcNow.AddHours(-24).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
}

$issues = gh issue list --repo $Repo --state open --json number,title,labels 2>$null |
    ConvertFrom-Json |
    Where-Object { (($_.labels | ForEach-Object { $_.name }) -join ",") -match "agent:" }

$prs = gh pr list --repo $Repo --state open --json number,title,isDraft,headRefName,labels,body 2>$null |
    ConvertFrom-Json

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

$wfSummary = @()
foreach ($wf in $workflows) {
    $runs = gh run list --repo $Repo --workflow $wf --limit 30 --json databaseId,conclusion,createdAt,status 2>$null |
        ConvertFrom-Json |
        Where-Object { $_.createdAt -gt $LastCheckUtc }

    $nonSuccess = $runs | Where-Object {
        $_.conclusion -and $_.conclusion -ne "success"
    }

    $wfSummary += [PSCustomObject]@{
        workflow = $wf
        runs = @($runs).Count
        failures = @($nonSuccess | ForEach-Object { [PSCustomObject]@{ id = $_.databaseId; conclusion = $_.conclusion; createdAt = $_.createdAt } })
    }
}

$prMarkers = @()
foreach ($pr in $prs) {
    $labels = @($pr.labels | ForEach-Object { $_.name })
    if (-not ($labels -contains "agent:pr")) { continue }

    $cycleLabel = $labels | Where-Object { $_ -match "^pr:cycle-\d+$" } | Select-Object -First 1
    $cycle = if ($cycleLabel) { [int]($cycleLabel -replace "pr:cycle-", "") } else { 0 }
    $body = [string]$pr.body

    $a = $body.Contains("[MARKER:sfl-analyzer-a cycle:$cycle]")
    $b = $body.Contains("[MARKER:sfl-analyzer-b cycle:$cycle]")
    $c = $body.Contains("[MARKER:sfl-analyzer-c cycle:$cycle]")

    $prMarkers += [PSCustomObject]@{
        prNumber = $pr.number
        cycle = $cycle
        analyzerA = $a
        analyzerB = $b
        analyzerC = $c
        hasHumanRequired = ($labels -contains "agent:human-required")
        bodyLength = $body.Length
    }
}

$result = [PSCustomObject]@{
    repo = $Repo
    lastCheckUtc = $LastCheckUtc
    nowUtc = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    issues = $issues
    prs = $prs
    markerState = $prMarkers
    workflows = $wfSummary
}

if ($AsJson) {
    $result | ConvertTo-Json -Depth 10
} else {
    $result
}
