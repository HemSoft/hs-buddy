# ralph-improve-quality.ps1 -- Unified code quality improver (multi-stack).
# Version: 1.2.0
# Detects stacks in the repo and applies appropriate quality tooling:
#   .NET    -> C# quality expert (analyzers, code style, strictness levels)
#   TS/React -> react-doctor (component health, patterns, accessibility)
#   General -> SOLID, DRY, complexity reduction, naming, testability
param(
    [ValidateSet('all', 'dotnet', 'typescript')]
    [string]$Stack = 'all',
    [switch]$Autopilot,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [string]$Model,
    [string]$Provider,
    [string[]]$Agents,
    [string]$WorkUntil,
    [switch]$Once,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Output ""
    Write-Output "ralph-improve-quality.ps1 - Unified Code Quality Improver"
    Write-Output "Runs ralph to improve code quality across all stacks in the repo."
    Write-Output "Automatically detects .NET, TypeScript/React, and applies the right tooling."
    Write-Output ""
    Write-Output "PARAMETERS"
    Write-Output "  -Stack <name>          Focus on a specific stack: all, dotnet, typescript (default: all)"
    Write-Output "  -Model <name>          Model to use (validated by ralph.ps1)"
    Write-Output "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Output "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Output "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Output "  -WorkUntil <HH:mm>     Stop after this local time"
    Write-Output "  -Autopilot             Enable autopilot mode (auto-merge PRs)"
    Write-Output "  -NoAudio               Suppress audio feedback"
    Write-Output "  -SkipReview            Skip Copilot PR review requests"
    Write-Output "  -Once                  Run only one work iteration"
    Write-Output "  -Help                  Show this help message"
    Write-Output ""
    Write-Output "STACKS"
    Write-Output "  all          Auto-detect stacks and apply all applicable quality improvements"
    Write-Output "  dotnet       .NET/C# -- analyzers, code style enforcement, strictness levels"
    Write-Output "  typescript   TypeScript/React -- react-doctor score, component patterns, accessibility"
    Write-Output ""
    Write-Output "EXAMPLES"
    Write-Output "  ralph-improve-quality -Autopilot"
    Write-Output "  ralph-improve-quality -Stack dotnet -Model sonnet"
    Write-Output "  ralph-improve-quality -Stack typescript -Once"
    Write-Output "  ralph-improve-quality -Agents pr-review-quality,auditor-code-quality"
    Write-Output "  ralph-improve-quality -Agents pr-review-quality@opus47  # multi-model review"
    Write-Output ""
    exit 0
}

# --- Build stack-aware prompt ---
$promptParts = @()

$promptParts += "Improve code quality for this repo."

switch ($Stack) {
    'dotnet' {
        $promptParts += @(
            "Focus on .NET/C# quality improvements."
            "Apply C# quality expert practices: enable Roslyn analyzers, enforce code style via .editorconfig, increase build strictness (TreatWarningsAsErrors, nullable enable, implicit usings)."
            "Fix all analyzer warnings. Improve naming, reduce cyclomatic complexity, apply SOLID principles."
            "Use the csharp-quality-expert skill if available."
        )
    }
    'typescript' {
        $promptParts += @(
            "Focus on TypeScript/React quality improvements."
            "Run react-doctor and fix all issues to reach a score of 100."
            "Improve component patterns, accessibility, type safety, and reduce complexity."
            "Use the react-doctor skill if available."
        )
    }
    default {
        $promptParts += @(
            "Detect which stacks are present in this repo (look for .csproj/.sln for .NET, package.json/tsconfig.json for TypeScript/React)."
            "For .NET/C#: apply C# quality expert practices -- enable Roslyn analyzers, enforce code style via .editorconfig, increase build strictness (TreatWarningsAsErrors, nullable enable). Fix all analyzer warnings."
            "For TypeScript/React: run react-doctor and fix all issues to reach a score of 100. Improve component patterns, accessibility, and type safety."
            "For all stacks: improve naming, reduce cyclomatic complexity, apply SOLID and DRY principles, improve testability."
            "Use the csharp-quality-expert and react-doctor skills if available."
        )
    }
}

$prompt = $promptParts -join ' '
$branchSuffix = if ($Stack -eq 'all') { 'quality' } else { "quality-$Stack" }

# Resolve ralph.ps1 -- direct call needed; splatting doesn't survive the alias's @args forwarding
$_ralphCmd = Get-Command ralph -ErrorAction SilentlyContinue
$_ralph = if ($_ralphCmd.CommandType -eq 'Function' -and $_ralphCmd.ScriptBlock -match "'([^']+\.ps1)'") {
    $matches[1]
} elseif ($_ralphCmd.Source) { $_ralphCmd.Source } else { $null }
if (-not $_ralph -or -not (Test-Path $_ralph)) { throw "Cannot resolve ralph.ps1 from 'ralph' command" }

$passThru = @{}
if ($Autopilot) { $passThru['Autopilot'] = $true }
if ($NoAudio) { $passThru['NoAudio'] = $true }
if ($SkipReview) { $passThru['SkipReview'] = $true }
if ($Model) { $passThru['Model'] = $Model }
if ($Provider) { $passThru['Provider'] = $Provider }
if ($Agents) { $passThru['Agents'] = $Agents }
if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
if ($Once) { $passThru['Once'] = $true }
& $_ralph -Prompt $prompt -Branch "feature/improve-$branchSuffix" -CleanupWorktree -Max 10 @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
