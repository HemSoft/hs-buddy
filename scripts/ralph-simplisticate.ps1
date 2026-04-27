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

# Resolve ralph.ps1 -- direct call needed; splatting doesn't survive the alias's @args forwarding
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

  CRAP(m) = complexity(m)^2 * (1 - coverage(m)/100)^3 + complexity(m)

TARGET: CRAP <= 15 for every function. Functions above 15 are high-risk -- prioritize the worst scores first. A CRAP of 15 is achievable even for moderately complex code if well-tested.

As a secondary guide, prefer cyclomatic complexity <= 7 per function. But CRAP is the primary metric -- a complexity-12 function at 95% coverage (CRAP ~= 12) is acceptable, while a complexity-5 function at 0% coverage (CRAP = 30) is not.

WORKFLOW:
1. Run 'bun run test:coverage' to get per-function coverage data.
2. Run 'npx eslint . --rule "complexity: [warn, 7]"' to find complex functions.
3. For each function, estimate its CRAP score from complexity + coverage. Sort by CRAP descending and work from the top.
4. Two levers reduce CRAP -- use both:
   a. REDUCE COMPLEXITY: extract helpers, simplify conditionals, reduce nesting.
   b. INCREASE COVERAGE: add or update tests for every function you touch.
5. After changes, re-run both commands to verify CRAP scores dropped.

CRITICAL: Never split a function without adding tests for the new pieces. Every iteration must move CRAP scores downward. After addressing high-CRAP functions, also fix any other code smells, code repetition, or unnecessary complexity you find.
'@
& $_ralph -Prompt $simplisticatePrompt -Branch "feature/simplisticate" -CleanupWorktree -Max 10 @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
