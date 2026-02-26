#!/usr/bin/env pwsh
# Lists open issues with status, created date, and labels.

param(
    [ValidateSet("open", "closed", "all")]
    [string]$State = "open",
    [int]$Limit = 30
)

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repo = "relias-engineering/hs-buddy"

$issues = gh issue list --repo $repo --state $State --limit $Limit --json number,title,state,createdAt,labels | ConvertFrom-Json

if (-not $issues -or $issues.Count -eq 0) {
    Write-Host "No $State issues found." -ForegroundColor DarkGray
    return
}

$results = foreach ($issue in $issues | Sort-Object number) {
    $created = ([DateTime]::Parse($issue.createdAt)).ToString("yyyy-MM-dd")
    $labelNames = ($issue.labels | ForEach-Object { $_.name }) -join ", "

    [PSCustomObject]@{
        "#"      = $issue.number
        Title    = if ($issue.title.Length -gt 60) { $issue.title.Substring(0, 57) + "..." } else { $issue.title }
        State    = $issue.state
        Created  = $created
        Labels   = $labelNames
    }
}

$results | Format-Table -AutoSize
Write-Host "$($issues.Count) issue(s)" -ForegroundColor DarkGray
