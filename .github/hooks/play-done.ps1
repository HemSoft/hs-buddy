# Audio notification for postToolUse hook.
# Plays done.mp3 immediately when the tool is task_complete (turn is over).
$debugLog = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\logs\hook-debug.log'))
$debugDir = Split-Path $debugLog -Parent
if (-not (Test-Path $debugDir)) { New-Item -ItemType Directory -Force -Path $debugDir | Out-Null }
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'

# Read stdin for tool metadata
$toolName = '(unknown)'
$raw = try { [Console]::In.ReadToEnd() } catch { '' }
if ($raw) {
    try {
        $json = $raw | ConvertFrom-Json
        if ($json.toolName) { $toolName = $json.toolName }
        elseif ($json.tool) { $toolName = $json.tool }
        elseif ($json.name) { $toolName = $json.name }
    } catch { }
}

Add-Content $debugLog "[$ts] postToolUse [$toolName] fired"

# Only play audio on task_complete
if ($toolName -ne 'task_complete') { exit 0 }

$audioEnabled = $true
$settingsPath = '.github/hooks/hooks-settings.json'
if (Test-Path $settingsPath) {
    try {
        $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
        if ($null -ne $settings.audioEnabled) { $audioEnabled = $settings.audioEnabled }
    } catch { }
}
if (-not $audioEnabled) {
    Add-Content $debugLog "[$ts] task_complete but audio disabled - skipping"
    exit 0
}

$audioFile = (Resolve-Path '.github/hooks/done.mp3').Path
Add-Content $debugLog "[$ts] ── AUDIO PLAYING ── task_complete detected"
Start-Process -NoNewWindow -FilePath 'ffplay' -ArgumentList '-nodisp','-autoexit','-volume','50','-loglevel','quiet',$audioFile
