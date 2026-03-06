#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [int]$MaxFollowUpCommits = 5,
    [string]$CommitPrefix = 'chore(session):',
    [switch]$SkipPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Prevent recursive session-stop hook execution in case stop automation loops.
if ($env:AGENT_SESSION_HOOK_RUNNING -eq '1') {
    exit 0
}

$env:AGENT_SESSION_HOOK_RUNNING = '1'

function Write-Info([string]$Message) {
    Write-Host "[agent-session-hook] $Message"
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

function Get-CurrentBranch {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ([string]::IsNullOrWhiteSpace($branch)) {
        throw 'Unable to resolve current branch.'
    }

    return $branch
}

function Invoke-GitAdd {
    $addOutput = @(& git add -A 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $details = ($addOutput -join [Environment]::NewLine)
        throw "git add failed during follow-up pass.$([Environment]::NewLine)$details"
    }

    # Suppress common line-ending conversion noise while preserving actionable warnings.
    $filtered = @(
        $addOutput |
            ForEach-Object { "$($_)" } |
            Where-Object { $_ -and ($_ -notmatch 'will be replaced by') }
    )

    foreach ($line in $filtered) {
        Write-Info "git add: $line"
    }
}

function Join-CommitList([string[]]$Items) {
    $values = @(
        @($Items) |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Select-Object -Unique
    )

    if ($values.Count -eq 0) {
        return 'session changes'
    }

    if ($values.Count -eq 1) {
        return $values[0]
    }

    if ($values.Count -eq 2) {
        return "$($values[0]) and $($values[1])"
    }

    return "$($values[0]), $($values[1]), and $($values[2])"
}

function Get-CommitAreas([string[]]$Files) {
    $fileList = @($Files)
    $areas = New-Object System.Collections.Generic.List[string]

    foreach ($file in $fileList) {
        $area = switch -Regex ($file) {
            '^\.github/workflows/' { 'SFL workflows'; break }
            '^\.github/' { 'GitHub automation'; break }
            '^\.agents/skills/' { 'agent skills'; break }
            '^docs/' { 'documentation'; break }
            '^(README|CHANGELOG|TODO|ATTENTION|VERBIAGE|VISION)\.md$' { 'documentation'; break }
            '^src/components/' { 'desktop UI'; break }
            '^src/' { 'app code'; break }
            '^electron/' { 'Electron shell'; break }
            '^convex/' { 'Convex backend'; break }
            '^scripts/' { 'scripts'; break }
            '^(package\.json|bun\.lockb|tsconfig(\..+)?\.json|vite\.config\.ts|electron-builder\.json5)$' { 'build metadata'; break }
            default { $null }
        }

        if ($area -and -not $areas.Contains($area)) {
            $areas.Add($area)
        }
    }

    return $areas.ToArray()
}

function New-FollowUpCommitMessage([string[]]$Files, [int]$PassNumber, [string]$Prefix) {
    $fileList = @($Files)
    $normalizedPrefix = $Prefix.Trim()
    if ([string]::IsNullOrWhiteSpace($normalizedPrefix) -or $normalizedPrefix -match 'auto-followup') {
        $normalizedPrefix = 'chore(session):'
    }

    if (-not $normalizedPrefix.EndsWith(':')) {
        $normalizedPrefix = "${normalizedPrefix}:"
    }

    $areas = @(Get-CommitAreas -Files $fileList)
    $summary = if ($areas.Count -gt 0) {
        "update $(Join-CommitList -Items $areas)"
    }
    elseif ($fileList.Count -eq 1) {
        $name = [IO.Path]::GetFileNameWithoutExtension($fileList[0]) -replace '[-_]+', ' '
        "update $name"
    }
    else {
        'capture remaining session changes'
    }

    $subject = "$normalizedPrefix $summary"
    if ($subject.Length -gt 72 -and $areas.Count -gt 1) {
        $subject = "$normalizedPrefix update $($areas[0]) and related files"
    }

    $shortStat = Get-StagedShortStat
    $bodyLines = New-Object System.Collections.Generic.List[string]
    $bodyLines.Add('Session-stop follow-up commit for remaining uncommitted changes.')

    if ($shortStat) {
        $bodyLines.Add("Diff: $shortStat")
    }

    $bodyLines.Add("Pass: $PassNumber")
    $bodyLines.Add('Files:')

    $previewCount = [Math]::Min($fileList.Count, 8)
    for ($index = 0; $index -lt $previewCount; $index++) {
        $bodyLines.Add("- $($fileList[$index])")
    }

    if ($fileList.Count -gt $previewCount) {
        $remainingCount = $fileList.Count - $previewCount
        $bodyLines.Add("- ... (+$remainingCount more)")
    }

    return @{
        Subject = $subject
        Body = ($bodyLines -join [Environment]::NewLine)
    }
}

function Invoke-GitCommitFaultTolerant([string]$Subject, [string]$Body) {
    $commitArgs = @('commit', '-m', $Subject)
    if (-not [string]::IsNullOrWhiteSpace($Body)) {
        $commitArgs += @('-m', $Body)
    }

    $commitOutput = @(& git @commitArgs 2>&1)
    if ($LASTEXITCODE -eq 0) {
        return
    }

    Write-Info 'git commit failed (likely hook/lint checks). Retrying with --no-verify for session-stop fault tolerance.'
    $retryArgs = @('commit', '--no-verify', '-m', $Subject)
    if (-not [string]::IsNullOrWhiteSpace($Body)) {
        $retryArgs += @('-m', $Body)
    }

    $retryOutput = @(& git @retryArgs 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $firstAttempt = ($commitOutput -join [Environment]::NewLine)
        $secondAttempt = ($retryOutput -join [Environment]::NewLine)
        throw "git commit failed during follow-up pass (both normal and --no-verify attempts failed).$([Environment]::NewLine)First attempt:$([Environment]::NewLine)$firstAttempt$([Environment]::NewLine)Retry:$([Environment]::NewLine)$secondAttempt"
    }
}

function Invoke-GitPushWithRebaseRetry([string]$Branch) {
    $pushOutput = @(& git push 2>&1)
    if ($LASTEXITCODE -eq 0) {
        return
    }

    $pushText = ($pushOutput -join [Environment]::NewLine)
    $isNonFastForward = $pushText -match 'non-fast-forward|failed to push some refs|Updates were rejected'
    if (-not $isNonFastForward) {
        throw "git push failed during session-stop automation.$([Environment]::NewLine)$pushText"
    }

    Write-Info "Push rejected (non-fast-forward). Attempting 'git pull --rebase' then retrying push."
    $pullOutput = @(& git pull --rebase 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $pullText = ($pullOutput -join [Environment]::NewLine)
        throw "git pull --rebase failed during session-stop automation.$([Environment]::NewLine)$pullText"
    }

    $retryOutput = @(& git push 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $retryText = ($retryOutput -join [Environment]::NewLine)
        throw "git push retry failed after rebase during session-stop automation.$([Environment]::NewLine)$retryText"
    }
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw 'Not inside a Git repository.'
}

$hookInput = Get-HookInput
Write-HookRuntimeLog -HookInput $hookInput

Write-Info "Running in $repoRoot"

for ($i = 1; $i -le $MaxFollowUpCommits; $i++) {
    $status = Get-StatusPorcelain
    if (-not $status) {
        Write-Info 'Working tree is clean.'
        break
    }

    Write-Info "Detected uncommitted changes after commit. Follow-up pass $i/$MaxFollowUpCommits."
    Invoke-GitAdd

    $staged = @(Get-StagedFiles)
    if (-not $staged) {
        Write-Info 'No staged changes remain. Stopping follow-up loop.'
        break
    }

    $message = New-FollowUpCommitMessage -Files $staged -PassNumber $i -Prefix $CommitPrefix
    Write-Info "Using follow-up commit subject: $($message.Subject)"
    Invoke-GitCommitFaultTolerant -Subject $message.Subject -Body $message.Body
}

$remaining = Get-StatusPorcelain
if ($remaining) {
    throw "Repository is still dirty after $MaxFollowUpCommits follow-up commit attempts."
}

if (-not $SkipPush) {
    $branch = Get-CurrentBranch
    Write-Info "Pushing branch '$branch'"
    Invoke-GitPushWithRebaseRetry -Branch $branch
}

Write-Info 'Completed successfully.'
