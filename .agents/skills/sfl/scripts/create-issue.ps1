<#
.SYNOPSIS
    Creates an SFL-ready issue with the labels needed for pipeline pickup.
.DESCRIPTION
    Creates a GitHub issue in the target repo with the default label
    `agent:fixable` so SFL can process it.

    Provide freeform issue intent via -What. TODO.md is a historical work
    index and is not an issue specification source.
.PARAMETER What
    Short summary of what the issue should be about.
.PARAMETER Title
    Optional explicit issue title. If omitted, title is derived from -What.
.PARAMETER Repo
    Target repository in org/repo format.
.PARAMETER Labels
    Labels to apply. Defaults to `agent:fixable`.
.PARAMETER DryRun
    Print generated title/body without creating an issue.
.EXAMPLE
    & ".agents/skills/sfl/scripts/create-issue.ps1" -Repo "HemSoft/hs-buddy" -What "Fix stale branch cleanup logic"

    & ".agents/skills/sfl/scripts/create-issue.ps1" -Repo "HemSoft/hs-buddy" -What "Implement SFL loop monitoring in the Organizations tree" -Title "Add SFL loop monitoring" -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$What,

    [string]$Title = "",

    [string]$Repo = "relias-engineering/hs-buddy",

    [string[]]$Labels = @("agent:fixable"),

    [switch]$DryRun
)

$InformationPreference = 'Continue'
$esc = [char]27

$authOk = & "$PSScriptRoot/ensure-auth.ps1" -Repo $Repo -Quiet
if (-not $authOk) {
    Write-Error "Auth preflight failed. Issue not created."
    return $false
}

$finalTitle = $Title.Trim()
if ([string]::IsNullOrWhiteSpace($finalTitle)) {
    if ($What.Length -le 100) {
        $finalTitle = $What.Trim()
    } else {
        $finalTitle = ($What.Substring(0, 100)).TrimEnd()
    }
}

$bodyLines = New-Object System.Collections.Generic.List[string]
$bodyLines.Add("## Finding") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add($What.Trim()) | Out-Null

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## Fix") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add("Implement the requested change with minimal, targeted edits that align with existing code patterns.") | Out-Null

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## Acceptance criteria") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add("- The requested behavior is implemented end-to-end.") | Out-Null
$bodyLines.Add("- Changes compile and relevant checks pass.") | Out-Null
$bodyLines.Add("- Scope remains focused on the requested functionality.") | Out-Null

$bodyLines.Add("") | Out-Null
$bodyLines.Add("## SFL Routing") | Out-Null
$bodyLines.Add("") | Out-Null
$bodyLines.Add('This issue is intentionally labeled for SFL pickup (`agent:fixable`).') | Out-Null

$issueBody = ($bodyLines -join "`n")

if ($DryRun) {
    Write-Information "${esc}[96m[DRY RUN] Repo: $Repo${esc}[0m"
    Write-Information "${esc}[96m[DRY RUN] Title: $finalTitle${esc}[0m"
    Write-Information "${esc}[96m[DRY RUN] Labels: $($Labels -join ', ')${esc}[0m"
    Write-Information "`n$issueBody"
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

    Write-Information "${esc}[92mCreated issue: $result${esc}[0m"
    return $true
} finally {
    if (Test-Path -LiteralPath $bodyFile) {
        Remove-Item -LiteralPath $bodyFile -Force
    }
}
