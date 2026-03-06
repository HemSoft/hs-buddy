#!/usr/bin/env pwsh
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) {
    [Console]::Error.WriteLine("[agent-session-hook] $Message")
}

function Get-OptionalPropertyValue($InputObject, [string]$PropertyName, [string]$DefaultValue = 'unknown') {
    if ($null -eq $InputObject) {
        return $DefaultValue
    }

    $property = $InputObject.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        return $DefaultValue
    }

    $value = $property.Value
    if ($null -eq $value) {
        return $DefaultValue
    }

    $text = "$value"
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $DefaultValue
    }

    return $text
}

function Get-HookInput {
    try {
        $raw = [Console]::In.ReadToEnd()
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return $null
        }

        return ($raw | ConvertFrom-Json)
    }
    catch {
        Write-Info "Unable to parse hook stdin payload: $($_.Exception.Message)"
        return $null
    }
}

function Write-HookRuntimeLog($HookInput) {
    $tempPath = if ($env:TEMP) { $env:TEMP } else { [IO.Path]::GetTempPath() }
    $logPath = Join-Path $tempPath 'copilot-stop-hook.log'

    $eventName = Get-OptionalPropertyValue -InputObject $HookInput -PropertyName 'hookEventName'
    $sessionId = Get-OptionalPropertyValue -InputObject $HookInput -PropertyName 'sessionId'
    $active = Get-OptionalPropertyValue -InputObject $HookInput -PropertyName 'stop_hook_active'
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | event=$eventName | session=$sessionId | stop_hook_active=$active"

    Add-Content -Path $logPath -Value $line
}

function Get-StatusPorcelain {
    return (git status --porcelain)
}

function Invoke-GitAdd {
    $addOutput = @(& git add -A 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $details = ($addOutput -join [Environment]::NewLine)
        throw "git add failed during session-stop staging.$([Environment]::NewLine)$details"
    }

    $filtered = @(
        $addOutput |
            ForEach-Object { "$($_)" } |
            Where-Object { $_ -and ($_ -notmatch 'will be replaced by') }
    )

    foreach ($line in $filtered) {
        Write-Info "git add: $line"
    }
}

function Get-StagedFiles {
    return @(
        git diff --cached --name-only |
            ForEach-Object { "$($_)".Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

function Get-StagedShortStat {
    return ((git diff --cached --shortstat | Out-String).Trim())
}

function Get-BranchState {
    $branch = ((git rev-parse --abbrev-ref HEAD) | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq 'HEAD') {
        return 'detached HEAD'
    }

    return $branch
}

function New-StagedFileReport([string[]]$Files) {
    $fileList = @($Files)
    if ($fileList.Count -eq 0) {
        return '- None'
    }

    $preview = New-Object System.Collections.Generic.List[string]
    $previewCount = [Math]::Min($fileList.Count, 15)
    for ($index = 0; $index -lt $previewCount; $index++) {
        $preview.Add("- $($fileList[$index])")
    }

    if ($fileList.Count -gt $previewCount) {
        $preview.Add("- ... (+$($fileList.Count - $previewCount) more)")
    }

    return ($preview -join [Environment]::NewLine)
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw 'Not inside a Git repository.'
}

$hookInput = Get-HookInput
Write-HookRuntimeLog -HookInput $hookInput

Write-Info "Running in $repoRoot"

$status = Get-StatusPorcelain
if (-not $status) {
    Write-Info 'Working tree is clean.'
    @{ continue = $true } | ConvertTo-Json -Compress
    exit 0
}

Write-Info 'Detected uncommitted changes at session stop. Staging them for an AI-authored commit.'
Invoke-GitAdd

$stagedFiles = @(Get-StagedFiles)
if (-not $stagedFiles) {
    Write-Info 'No staged changes remain after git add.'
    @{ continue = $true } | ConvertTo-Json -Compress
    exit 0
}

$branchState = Get-BranchState
$shortStat = Get-StagedShortStat
if ([string]::IsNullOrWhiteSpace($shortStat)) {
    $shortStat = 'No diff stat available.'
}

$branchInstruction = if ($branchState -eq 'detached HEAD') {
    'The repository is in detached HEAD. Check out or create a branch before committing and pushing.'
}
else {
    "Commit the staged changes, then push branch '$branchState'. If no upstream exists, use git push --set-upstream."
}

$reason = @"
Staged changes were detected at session stop. Use the staged diff to write a descriptive Conventional Commit message before stopping.

Requirements:
- Inspect the staged diff instead of guessing from file names.
- Do not use static placeholders like 'chore(session): auto-followup'.
- Write a meaningful subject and body for the commit.
- Commit the currently staged changes only.
- $branchInstruction

Recommended inspection commands:
- git diff --cached --stat
- git diff --cached

Staged summary:
$shortStat

Staged files:
$(New-StagedFileReport -Files $stagedFiles)
"@

$output = @{
    hookSpecificOutput = @{
        hookEventName = 'Stop'
        decision = 'block'
        reason = $reason
    }
}

$output | ConvertTo-Json -Depth 5 -Compress
exit 0
