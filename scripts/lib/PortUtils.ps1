# Cross-platform port utilities for hs-buddy launcher scripts.
# Dot-source from any script: . "$PSScriptRoot/lib/PortUtils.ps1"

function Test-PortOpen([int]$Port, [string]$Address = '127.0.0.1') {
    Test-Connection -TargetName $Address -TcpPort $Port -Quiet
}

function Get-PortOwner([int]$Port) {
    if ($IsWindows) {
        return Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -ne 0 }
    }
    # macOS/Linux: lsof filtered to LISTEN to avoid killing clients
    $pids = (lsof -nP -iTCP:${Port} -sTCP:LISTEN -t 2>$null) -split "`n" |
        Where-Object { $_ } |
        ForEach-Object { [int]$_ } |
        Sort-Object -Unique
    return $pids
}

function Stop-PortOwner([int]$Port, [string]$Label = "Port $Port") {
    $pids = Get-PortOwner -Port $Port
    if ($pids) {
        foreach ($pid in $pids) {
            Write-Information "Killing process on $Label (PID $pid)..."
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
}

function Resolve-Aspire {
    $cmd = Get-Command aspire -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # Standalone installer location (has embedded bundle payload)
    $aspireBin = Join-Path $HOME '.aspire' 'bin' 'aspire'
    if (Test-Path $aspireBin) { return $aspireBin }
    # Dotnet global tool location
    $dotnetTools = Join-Path $HOME '.dotnet' 'tools' 'aspire'
    if (Test-Path $dotnetTools) { return $dotnetTools }
    return $null
}

function Initialize-DotnetRoot {
    # Ensure DOTNET_ROOT is set so dotnet global tools (e.g. aspire) find the runtime.
    # Homebrew on macOS installs .NET to a Cellar path that the tool shims don't auto-detect.
    if ($env:DOTNET_ROOT) { return }
    $dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnetCmd) { return }
    $info = & $dotnetCmd.Source --info 2>$null
    $basePath = ($info | Select-String 'Base Path:\s+(.+)' | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() })
    if ($basePath) {
        # Base Path is like .../libexec/sdk/10.0.107/ — walk up to libexec
        $candidate = $basePath
        while ($candidate -and (Split-Path $candidate -Leaf) -ne 'libexec') {
            $candidate = Split-Path $candidate -Parent
        }
        if ($candidate -and (Test-Path $candidate)) {
            $env:DOTNET_ROOT = $candidate
        }
    }
}
