# Runs ralph to reduce complexity and code smells on a dedicated feature branch.
param(
    [switch]$Autopilot,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [ValidateSet('sonnet', 'opus46', 'opus47', 'gpt')]
    [string]$Model,
    [string]$WorkUntil
)
$ErrorActionPreference = 'Stop'

# Resolve ralph.ps1 — direct call needed; splatting doesn't survive the alias's @args forwarding
$_ralphCmd = Get-Command ralph -ErrorAction SilentlyContinue
$_ralph = if ($_ralphCmd.CommandType -eq 'Function' -and $_ralphCmd.ScriptBlock -match "'([^']+)'") {
    $matches[1]
} elseif ($_ralphCmd.Source) { $_ralphCmd.Source } else { $null }
if (-not $_ralph -or -not (Test-Path $_ralph)) { throw "Cannot resolve ralph.ps1 from 'ralph' command" }

$passThru = @{}
if ($Autopilot) { $passThru['Autopilot'] = $true }
if ($NoAudio) { $passThru['NoAudio'] = $true }
if ($SkipReview) { $passThru['SkipReview'] = $true }
if ($Model) { $passThru['Model'] = $Model }
if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
$simplisticatePrompt = @'
Your goal is to reduce CRAP scores across the codebase. CRAP (Change Risk Anti-Patterns) combines cyclomatic complexity with test coverage:

  CRAP(m) = complexity(m)^2 × (1 - coverage(m)/100)^3 + complexity(m)

A CRAP score above 30 means the method is too complex for its test coverage. A perfectly-covered method (100%) has CRAP equal to its complexity. An untested method has CRAP = complexity^2 + complexity.

WORKFLOW:
1. Run 'npx eslint . --rule "complexity: [error, 10]"' to find high-complexity functions.
2. Run 'bun run test:coverage' to get per-function coverage data.
3. For each function, estimate its CRAP score from complexity + coverage. Prioritize the highest CRAP scores first — these are the riskiest functions.
4. Refactor to reduce complexity: extract helper functions, simplify conditionals, reduce nesting. Target complexity ≤ 10 (ESLint threshold).
5. For every function you touch or extract, add or update tests to increase coverage. Both levers reduce CRAP.
6. After changes, re-run both commands to verify: complexity decreased, coverage maintained or improved, CRAP scores dropped.

CRITICAL: Every refactoring iteration must improve BOTH complexity AND coverage. Never split a function without adding tests for the new pieces. After addressing high-CRAP functions, also fix any other code smells, code repetition, or unnecessary complexity you find.
'@
& $_ralph -Prompt $simplisticatePrompt -Branch "feature/simplisticate" -CleanupWorktree -Max 10 @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
