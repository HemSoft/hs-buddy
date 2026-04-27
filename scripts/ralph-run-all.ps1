# Runs all ralph-*.ps1 scripts in the current directory sequentially in autopilot mode.
# Between each script, pulls latest main so the next run branches from fresh code.
# Stops on the first failure.
param(
    [switch]$Pick,
    [ValidateSet('sonnet', 'opus46', 'opus47', 'gpt')]
    [string]$Model,
    [string]$WorkUntil,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'

if ($Help) {
    Write-Output ""
    Write-Output "ralph-run-all.ps1 - Sequential Autopilot Orchestrator"
    Write-Output "Runs all ralph-*.ps1 scripts in the scripts/ directory sequentially."
    Write-Output "Each script runs in full autopilot mode -- PRs are auto-merged."
    Write-Output ""
    Write-Output "PARAMETERS"
    Write-Output "  -Pick                  Choose which scripts to run (default: run all)"
    Write-Output "  -Model <alias>         Model to pass through: sonnet, opus46, opus47, gpt"
    Write-Output "  -WorkUntil <HH:mm>     Stop after this local time (passed to each script)"
    Write-Output "  -NoAudio               Suppress audio feedback"
    Write-Output "  -Help                  Show this help message"
    Write-Output ""
    Write-Output "EXAMPLES"
    Write-Output "  ralph-run-all"
    Write-Output "  ralph-run-all -Pick"
    Write-Output "  ralph-run-all -Model sonnet -WorkUntil 08:00"
    Write-Output "  ralph-run-all -NoAudio"
    Write-Output ""
    exit 0
}

# --- Verify git state ---
$repoRoot = ([string](git rev-parse --show-toplevel 2>&1)).Trim() -replace '/', '\'
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not inside a git repository." -ErrorAction Continue
    exit 1
}
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()

# --- Discover scripts from this repo's scripts/ directory ---
$scriptsDir = Join-Path $repoRoot "scripts"
$myName = Split-Path -Leaf $MyInvocation.MyCommand.Path

$allScripts = Get-ChildItem -Path $scriptsDir -Filter "ralph-*.ps1" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne $myName } |
    Sort-Object Name

if ($allScripts.Count -eq 0) {
    Write-Error "No ralph-*.ps1 scripts found in $scriptsDir" -ErrorAction Continue
    exit 1
}

$scripts = $allScripts

# --- Pick mode ---
if ($Pick) {
    Write-Information ""
    Write-Information "Available scripts:"
    for ($i = 0; $i -lt $allScripts.Count; $i++) {
        Write-Information "  [$($i + 1)] $($allScripts[$i].Name)"
    }
    Write-Information ""
    $selection = Read-Host "Enter numbers to run (comma-separated, e.g. 1,3) or 'all'"
    if ($selection -eq 'all') {
        # keep all
    }
    else {
        $indices = $selection -split ',' | ForEach-Object { [int]$_.Trim() - 1 }
        $indices = $indices | Where-Object { $_ -ge 0 -and $_ -lt $allScripts.Count }
        if ($indices.Count -eq 0) {
            Write-Error "No valid selections." -ErrorAction Continue
            exit 1
        }
        $scripts = $indices | ForEach-Object { $allScripts[$_] }
    }
    Write-Information ""
}

# --- Banner ---
$runStart = Get-Date
Write-Information ""
Write-Information "===================================="
Write-Information "  RALPH RUN-ALL"
Write-Information "===================================="
Write-Information "  Started:   $($runStart.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Information "  Scripts:   $($scripts.Count)"
for ($i = 0; $i -lt $scripts.Count; $i++) {
    Write-Information "    $($i + 1). $($scripts[$i].Name)"
}
Write-Information "  Branch:    $currentBranch"
Write-Information "  Repo:      $repoRoot"
if ($Model) { Write-Information "  Model:     $Model" }
if ($WorkUntil) { Write-Information "  WorkUntil: $WorkUntil" }
Write-Information "===================================="
Write-Information ""

# --- Run scripts sequentially ---
$results = @()
$failed = $false

for ($i = 0; $i -lt $scripts.Count; $i++) {
    $script = $scripts[$i]
    $stepStart = Get-Date

    # Check deadline
    if ($WorkUntil) {
        try {
            $parsed = [DateTime]::ParseExact($WorkUntil, 'HH:mm', $null)
            $deadline = Get-Date -Hour $parsed.Hour -Minute $parsed.Minute -Second 0
            if ($deadline -le $runStart) { $deadline = $deadline.AddDays(1) }
            if ((Get-Date) -ge $deadline) {
                Write-Warning "Deadline reached ($WorkUntil). Stopping before $($script.Name)."
                break
            }
        }
        catch { Write-Verbose "Deadline parse failed: $_" }
    }

    Write-Information ""
    Write-Information "===================================="
    Write-Information "== [$($i + 1)/$($scripts.Count)] $($script.Name)"
    Write-Information "===================================="
    Write-Information ""

    # Build args -- always pass -Autopilot
    $scriptArgs = @{ Autopilot = $true }
    if ($NoAudio) { $scriptArgs['NoAudio'] = $true }
    if ($SkipReview) { $scriptArgs['SkipReview'] = $true }
    if ($Model) { $scriptArgs['Model'] = $Model }
    if ($WorkUntil) { $scriptArgs['WorkUntil'] = $WorkUntil }

    # Invoke the script
    & $script.FullName @scriptArgs
    $exitCode = $LASTEXITCODE

    $stepEnd = Get-Date
    $stepDuration = $stepEnd - $stepStart
    $stepDurStr = "{0:hh\:mm\:ss}" -f $stepDuration

    $status = if ($exitCode -eq 0) { "OK" } else { "FAILED (exit $exitCode)" }
    $results += [PSCustomObject]@{
        Script   = $script.Name
        Status   = $status
        Duration = $stepDurStr
        ExitCode = $exitCode
    }

    if ($exitCode -ne 0) {
        Write-Information ""
        Write-Error "$($script.Name) failed with exit code $exitCode. Stopping." -ErrorAction Continue
        $failed = $true
        break
    }

    Write-Information ""
    Write-Information "$($script.Name) completed successfully ($stepDurStr)."

    # Pull latest main before next script
    if ($i -lt $scripts.Count - 1) {
        Write-Information ""
        Write-Information "Pulling latest main before next script..."
        git fetch origin main 2>&1 | Out-Null
        git checkout main 2>&1 | Out-Null
        git pull --ff-only 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "git pull on main failed. Continuing anyway."
        }
        else {
            Write-Information "Main is up to date." -InformationAction Continue
        }
    }
}

# --- Summary ---
$runEnd = Get-Date
$totalDuration = $runEnd - $runStart
$totalDurStr = "{0:hh\:mm\:ss}" -f $totalDuration
$successCount = ($results | Where-Object { $_.ExitCode -eq 0 }).Count

Write-Information ""
Write-Information "===================================="
Write-Information "  RALPH RUN-ALL SUMMARY"
Write-Information "===================================="
Write-Information "  Finished:  $($runEnd.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Information "  Duration:  $totalDurStr"
Write-Information "  Results:   $successCount/$($results.Count) succeeded"
Write-Information ""
foreach ($r in $results) {
    Write-Information "    $($r.Status.PadRight(20)) $($r.Duration)  $($r.Script)"
}
Write-Information ""
Write-Information "===================================="

if ($failed) { exit 1 }
