#!/usr/bin/env pwsh
# Lists pull requests with status, created/updated dates, and labels.

param(
    [ValidateSet("open", "closed", "merged", "all")]
    [string]$State = "open",
    [int]$Limit = 30
)

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repo = "relias-engineering/hs-buddy"

$prs = gh pr list --repo $repo --state $State --limit $Limit --json number,title,state,isDraft,createdAt,updatedAt,labels | ConvertFrom-Json

if (-not $prs -or $prs.Count -eq 0) {
    Write-Host "No $State PRs found." -ForegroundColor DarkGray
    return
}

$results = foreach ($pr in $prs | Sort-Object number) {
    $created = ([DateTime]::Parse($pr.createdAt)).ToString("yyyy-MM-dd")
    $updated = ([DateTime]::Parse($pr.updatedAt)).ToString("yyyy-MM-dd")
    $labelNames = ($pr.labels | ForEach-Object { $_.name }) -join ", "
    $status = if ($pr.isDraft) { "draft" } else { $pr.state }

    [PSCustomObject]@{
        "#"      = $pr.number
        Title    = if ($pr.title.Length -gt 50) { $pr.title.Substring(0, 47) + "..." } else { $pr.title }
        Status   = $status
        Created  = $created
        Updated  = $updated
        Labels   = $labelNames
    }
}

$results | Format-Table -AutoSize
Write-Host "$($prs.Count) PR(s)" -ForegroundColor DarkGray
