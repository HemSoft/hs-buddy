# Log-Prompt.ps1 - Captures the actual prompt text from UserPromptSubmit stdin JSON
$raw = try { [Console]::In.ReadToEnd() } catch { '' }

$prompt = 'N/A'
if ($raw) {
    try {
        $json = $raw | ConvertFrom-Json
        $prompt = if ($json.prompt) { $json.prompt }
                  elseif ($json.userPrompt) { $json.userPrompt }
                  elseif ($json.content) { $json.content }
                  else { $raw }
    } catch {
        $prompt = $raw
    }
}

# Normalize whitespace and truncate to keep logs manageable
$prompt = ($prompt -replace '[\r\n]+', ' ').Trim()
if ($prompt.Length -gt 300) { $prompt = $prompt.Substring(0, 300) + '...' }

$dir = 'logs/session'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$logFile = Join-Path $dir ((Get-Date -Format 'yyyy-MM-dd') + '.log')
Add-Content -Path $logFile -Value ('[{0}] [UserPrompt] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $prompt)
