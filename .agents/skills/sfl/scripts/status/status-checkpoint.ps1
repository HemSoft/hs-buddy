[CmdletBinding()]
param(
    [ValidateSet("read", "write")]
    [string]$Mode = "read",
    [string]$Path = ".github/prompts/.status-checkpoint",
    [string]$Value
)

$ErrorActionPreference = "Stop"

if ($Mode -eq "read") {
    if (Test-Path $Path) {
        (Get-Content $Path -Raw).Trim()
    } else {
        [DateTime]::UtcNow.AddHours(-24).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    exit 0
}

if (-not $Value) {
    $Value = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
}

Set-Content -NoNewline -Path $Path -Value $Value
$Value
