$input = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($input.toolName -eq 'task_complete') {
    Start-Process -NoNewWindow -FilePath 'ffplay' -ArgumentList '-nodisp', '-autoexit', '-volume', '50', '.github/hooks/done.mp3'
}
