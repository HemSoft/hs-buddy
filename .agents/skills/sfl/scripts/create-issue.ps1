<#
.SYNOPSIS
    Creates an SFL-ready issue with the labels needed for pipeline pickup.
.DESCRIPTION
    Creates a GitHub issue in the target repo with default labels
    `agent:fixable` and `action-item` so SFL can process it.

    You can provide freeform issue intent via -What and optionally source
    content from a TODO section via -TodoItem. When -TodoItem is provided,
    the script pulls that section from TODO.md and embeds it in the issue body.
.PARAMETER What
    Short summary of what the issue should be about.
.PARAMETER Title
    Optional explicit issue title. If omitted, title is derived from -TodoItem
    (when provided) or from -What.
.PARAMETER TodoItem
    Optional TODO section heading (from "### <heading>") to import into body.
.PARAMETER TodoFile
    Path to TODO markdown file (default: TODO.md in repo root).
.PARAMETER Repo
    Target repository in org/repo format.
.PARAMETER Labels
    Labels to apply. Defaults to `agent:fixable` and `action-item`.
.PARAMETER DryRun
    Print generated title/body without creating an issue.
.EXAMPLE
    & ".agents/skills/sfl/scripts/create-issue.ps1" -What "Fix stale branch cleanup logic"

    & ".agents/skills/sfl/scripts/create-issue.ps1" -What "Implement SFL loop panel" -TodoItem "SFL Loop monitoring in Organizations tree"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$What,

    [string]$Title = "",

    [string]$TodoItem = "",

    [string]$TodoFile = "TODO.md",

    [string]$Repo = "relias-engineering/hs-buddy",

    [string[]]$Labels = @("agent:fixable", "action-item"),

    [switch]$DryRun
)

function Get-PlainTaskName {
    param([string]$TaskCell)

    $value = $TaskCell.Trim()
    $value = $value -replace '^\[(.+?)\]\(#.+?\)$', '$1'
    $value = $value -replace '\*\*', ''
    return $value.Trim()
}

function Get-TodoSection {
    param(
        [string]$Markdown,
        [string]$Heading
    )

    if ([string]::IsNullOrWhiteSpace($Heading)) {
        return $null
    }

    $escaped = [Regex]::Escape($Heading.Trim())
    $pattern = "(?ms)^###\s+$escaped\s*\r?\n(?<body>.*?)(?=^###\s+|\z)"
    $match = [Regex]::Match($Markdown, $pattern)
    if (-not $match.Success) {
        return $null
    }

    return $match.Groups['body'].Value.Trim()
}

function Get-TodoRowNotes {
    param(
        [string]$Markdown,
        [string]$Heading
    )

    $lines = $Markdown -split "`r?`n"
    foreach ($line in $lines) {
        if ($line -notmatch '^\|') {
            continue
        }

        $cells = $line.Trim('|').Split('|') | ForEach-Object { $_.Trim() }
        if ($cells.Count -lt 4) {
            continue
        }

        $taskName = Get-PlainTaskName -TaskCell $cells[2]
        if ($taskName -ieq $Heading.Trim()) {
            return $cells[3]
        }
    }

    return $null
}

$authOk = & "$PSScriptRoot/ensure-auth.ps1" -Repo $Repo -Quiet
if (-not $authOk) {
    Write-Error "Auth preflight failed. Issue not created."
    return $false
}

$todoMarkdown = ""
$todoSection = $null
$todoNotes = $null

if (-not [string]::IsNullOrWhiteSpace($TodoItem)) {
    if (-not (Test-Path -LiteralPath $TodoFile)) {
        Write-Error "Todo file not found: $TodoFile"
        return $false
    }

    $todoMarkdown = Get-Content -LiteralPath $TodoFile -Raw
    $todoSection = Get-TodoSection -Markdown $todoMarkdown -Heading $TodoItem
    if (-not $todoSection) {
        Write-Error "Could not find TODO section heading: '$TodoItem' in $TodoFile"
        return $false
    }

    $todoNotes = Get-TodoRowNotes -Markdown $todoMarkdown -Heading $TodoItem
}

$finalTitle = $Title.Trim()
if ([string]::IsNullOrWhiteSpace($finalTitle)) {
    if (-not [string]::IsNullOrWhiteSpace($TodoItem)) {
        $finalTitle = $TodoItem.Trim()
    } elseif ($What.Length -le 100) {
        $finalTitle = $What.Trim()
    } else {
        $finalTitle = ($What.Substring(0, 100)).TrimEnd()
    }
}

$bodyLines = New-Object System.Collections.Generic.List[string]
$bodyLines.Add("## Finding") | Out-Null
$bodyLines.Add("") | Out-Null
if (-not [string]::IsNullOrWhiteSpace($TodoItem)) {
    $bodyLines.Add("The requested capability is not yet implemented: $TodoItem.") | Out-Null
} else {
    $bodyLines.Add($What.Trim()) | Out-Null
}

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## Fix") | Out-Null
$bodyLines.Add("") | Out-Null
if (-not [string]::IsNullOrWhiteSpace($TodoItem)) {
    $bodyLines.Add("Implement the TODO specification for '$TodoItem' using the imported context below. Keep changes scoped to the listed files/components and follow existing architecture patterns.") | Out-Null
} else {
    $bodyLines.Add("Implement the requested change with minimal, targeted edits that align with existing code patterns.") | Out-Null
}

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## Acceptance criteria") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add("- The requested behavior is implemented end-to-end.") | Out-Null
$bodyLines.Add("- Changes compile and relevant checks pass.") | Out-Null
$bodyLines.Add("- Scope remains focused on the requested functionality.") | Out-Null

if (-not [string]::IsNullOrWhiteSpace($TodoItem)) {
    $bodyLines.Add("") | Out-Null
    $bodyLines.Add("## Source TODO Item") | Out-Null
    $bodyLines.Add("") | Out-Null
    $bodyLines.Add("- Item: $TodoItem") | Out-Null
    $bodyLines.Add("- Source: $TodoFile") | Out-Null
    if (-not [string]::IsNullOrWhiteSpace($todoNotes)) {
        $bodyLines.Add("- Table Notes: $todoNotes") | Out-Null
    }

    $bodyLines.Add("") | Out-Null
    $bodyLines.Add("## Imported Context") | Out-Null
    $bodyLines.Add("") | Out-Null
    $bodyLines.Add($todoSection) | Out-Null
}

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## SFL Routing") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add('This issue is intentionally labeled for SFL pickup (`agent:fixable` + `action-item`).') | Out-Null

$issueBody = ($bodyLines -join "`n")

if ($DryRun) {
    Write-Host "[DRY RUN] Repo: $Repo" -ForegroundColor Cyan
    Write-Host "[DRY RUN] Title: $finalTitle" -ForegroundColor Cyan
    Write-Host "[DRY RUN] Labels: $($Labels -join ', ')" -ForegroundColor Cyan
    Write-Host "`n$issueBody"
    return $true
}

$bodyFile = Join-Path $env:TEMP ("sfl-create-issue-{0}.md" -f ([Guid]::NewGuid().ToString('N')))
try {
    Set-Content -LiteralPath $bodyFile -Value $issueBody -Encoding UTF8

    $ghArgs = @('issue', 'create', '--repo', $Repo, '--title', $finalTitle, '--body-file', $bodyFile)
    foreach ($label in $Labels) {
        $ghArgs += @('--label', $label)
    }

    $result = & gh @ghArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create issue: $result"
        return $false
    }

    Write-Host "Created issue: $result" -ForegroundColor Green
    return $true
} finally {
    if (Test-Path -LiteralPath $bodyFile) {
        Remove-Item -LiteralPath $bodyFile -Force
    }
}
