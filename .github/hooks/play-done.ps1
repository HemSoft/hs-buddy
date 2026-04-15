$raw = try { [Console]::In.ReadToEnd() } catch { '' }
if ($raw) {
    try {
        $json = $raw | ConvertFrom-Json
        if ($json.toolName -eq 'task_complete') {
            Start-Process -NoNewWindow -FilePath 'ffplay' -ArgumentList '-nodisp', '-autoexit', '-volume', '50', '.github/hooks/done.mp3'
        }
    } catch { Write-Error "Failed to parse or handle task_complete: $_" }
}
