$raw = try { [Console]::In.ReadToEnd() } catch { '' }
if ($raw) {
    try {
        $json = $raw | ConvertFrom-Json
        if ($json.toolName -eq 'task_complete') {
            $audioEnabled = $true
            $settingsPath = '.github/hooks/hooks-settings.json'
            if (Test-Path $settingsPath) {
                try {
                    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
                    if ($null -ne $settings.audioEnabled) { $audioEnabled = $settings.audioEnabled }
                } catch {}
            }
            if ($audioEnabled) {
                Start-Process -NoNewWindow -FilePath 'ffplay' -ArgumentList '-nodisp', '-autoexit', '-volume', '50', '.github/hooks/done.mp3'
            }
        }
    } catch { Write-Error "Failed to parse or handle task_complete: $_" }
}
