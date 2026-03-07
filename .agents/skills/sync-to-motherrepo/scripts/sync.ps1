<#
.SYNOPSIS
    Syncs SFL artifacts from hs-buddy to the HemSoft/set-it-free-loop motherrepo.

.PARAMETER DryRun
    Preview what would be copied without making changes.

.PARAMETER StatusOnly
    Show sync freshness (last-modified comparison) without copying.

.EXAMPLE
    .\sync.ps1              # Full sync
    .\sync.ps1 -DryRun      # Preview changes
    .\sync.ps1 -StatusOnly   # Compare timestamps
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$StatusOnly
)

$ErrorActionPreference = 'Stop'

# --- Configuration ---
$SourceRoot = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path   # hs-buddy repo root
$MotherRepo = "d:\github\HemSoft\set-it-free-loop"
$RemoteRepo = "HemSoft/set-it-free-loop"

# Agentic workflow prompt names (the .md files)
$AgenticWorkflows = @(
    "daily-repo-status"
    "discussion-processor"
    "sfl-issue-processor"
    "sfl-analyzer-a"
    "sfl-analyzer-b"
    "sfl-analyzer-c"
    "pr-fixer"
    "repo-audit"
    "sfl-auditor"
    "simplisticate"
)

# Standard YAML workflows (infrastructure)
$InfraWorkflows = @(
    "sfl-pr-router.yml"
)

# Dogfood-only workflows (copied to .github/workflows/ but not to deployment/)
$DogfoodOnlyWorkflows = @(
    "sfl-pr-label-actions.yml"
)

# Documentation files
$DocFiles = @(
    "docs/SET_IT_FREE_GOVERNANCE.md"
    "docs/SFL_ONBOARDING.md"
)

# Prompt files
$PromptGlob = ".github/prompts/sfl-*.prompt.md"

# Governance files
$GovernanceFiles = @(
    ".github/sfl-config.yml"
)

# --- Helpers ---

function Copy-SyncFile {
    param(
        [string]$Source,
        [string]$Dest,
        [switch]$Preview
    )

    if (-not (Test-Path $Source)) {
        Write-Warning "  SKIP (not found): $Source"
        return $false
    }

    $destDir = Split-Path $Dest -Parent
    if ($Preview) {
        if (Test-Path $Dest) {
            $srcHash = (Get-FileHash $Source -Algorithm SHA256).Hash
            $dstHash = (Get-FileHash $Dest -Algorithm SHA256).Hash
            if ($srcHash -eq $dstHash) {
                Write-Host "  UNCHANGED: $(Resolve-Path $Source -Relative 2>$null)" -ForegroundColor DarkGray
            } else {
                Write-Host "  CHANGED:   $(Resolve-Path $Source -Relative 2>$null) -> $Dest" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  NEW:       $(Resolve-Path $Source -Relative 2>$null) -> $Dest" -ForegroundColor Green
        }
        return $true
    }

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -Path $Source -Destination $Dest -Force
    Write-Host "  Copied: $(Resolve-Path $Source -Relative 2>$null) -> $Dest" -ForegroundColor Cyan
    return $true
}

function Show-TimestampComparison {
    param(
        [string]$Source,
        [string]$Dest,
        [string]$Label
    )

    if (-not (Test-Path $Source)) { return }

    $srcTime = (Get-Item $Source).LastWriteTime
    if (Test-Path $Dest) {
        $dstTime = (Get-Item $Dest).LastWriteTime
        $delta = $srcTime - $dstTime
        $status = if ($delta.TotalSeconds -gt 1) { "STALE" } elseif ($delta.TotalSeconds -lt -1) { "AHEAD" } else { "OK" }
        $color = switch ($status) { "STALE" { "Yellow" } "AHEAD" { "Magenta" } default { "Green" } }
        Write-Host ("  [{0,-5}] {1,-50} src={2:yyyy-MM-dd HH:mm}  dst={3:yyyy-MM-dd HH:mm}" -f $status, $Label, $srcTime, $dstTime) -ForegroundColor $color
    } else {
        Write-Host ("  [NEW  ] {0,-50} src={1:yyyy-MM-dd HH:mm}  dst=MISSING" -f $Label, $srcTime) -ForegroundColor Green
    }
}

# --- Preflight ---

Write-Host "`n=== SFL Sync to Motherrepo ===" -ForegroundColor White
Write-Host "Source: $SourceRoot" -ForegroundColor DarkGray
Write-Host "Target: $MotherRepo" -ForegroundColor DarkGray

if (-not (Test-Path $SourceRoot)) {
    Write-Error "Source repo not found at $SourceRoot"
}

if (-not (Test-Path $MotherRepo)) {
    if ($StatusOnly -or $DryRun) {
        Write-Error "Motherrepo not found at $MotherRepo — clone it first: gh repo clone $RemoteRepo $MotherRepo"
    }
    Write-Host "`nMotherrepo not found. Cloning..." -ForegroundColor Yellow
    & gh repo clone $RemoteRepo $MotherRepo
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to clone $RemoteRepo"
    }
}

# --- Status Only ---

if ($StatusOnly) {
    Write-Host "`n--- Timestamp Comparison ---" -ForegroundColor White
    Write-Host "(STALE = source newer than target, AHEAD = target newer, OK = in sync)`n"

    foreach ($wf in $AgenticWorkflows) {
        Show-TimestampComparison "$SourceRoot\.github\workflows\$wf.md" "$MotherRepo\deployment\workflows\$wf.md" "deployment/workflows/$wf.md"
    }
    foreach ($wf in $InfraWorkflows) {
        Show-TimestampComparison "$SourceRoot\.github\workflows\$wf" "$MotherRepo\deployment\infrastructure\$wf" "deployment/infrastructure/$wf"
    }
    foreach ($doc in $DocFiles) {
        Show-TimestampComparison "$SourceRoot\$doc" "$MotherRepo\$doc" $doc
    }
    foreach ($gov in $GovernanceFiles) {
        $destName = Split-Path $gov -Leaf
        Show-TimestampComparison "$SourceRoot\$gov" "$MotherRepo\deployment\governance\$destName" "deployment/governance/$destName"
    }

    Write-Host "`n=== STATUS COMPLETE ===" -ForegroundColor White
    return
}

# --- Sync / DryRun ---

$mode = if ($DryRun) { "DRY RUN" } else { "SYNC" }
Write-Host "`nMode: $mode`n" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Green" })

$copied = 0

# 1. Agentic workflow prompts -> deployment/workflows/ (canonical for consumers)
Write-Host "--- Workflow Prompts -> deployment/workflows/ ---" -ForegroundColor White
foreach ($wf in $AgenticWorkflows) {
    $src = "$SourceRoot\.github\workflows\$wf.md"
    $dst = "$MotherRepo\deployment\workflows\$wf.md"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 2. Agentic workflow prompts -> .github/workflows/ (dogfood)
Write-Host "`n--- Workflow Prompts -> .github/workflows/ (dogfood) ---" -ForegroundColor White
foreach ($wf in $AgenticWorkflows) {
    $src = "$SourceRoot\.github\workflows\$wf.md"
    $dst = "$MotherRepo\.github\workflows\$wf.md"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 3. Lock files -> .github/workflows/ (dogfood only)
Write-Host "`n--- Lock Files -> .github/workflows/ (dogfood) ---" -ForegroundColor White
foreach ($wf in $AgenticWorkflows) {
    $src = "$SourceRoot\.github\workflows\$wf.lock.yml"
    $dst = "$MotherRepo\.github\workflows\$wf.lock.yml"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 4. Infrastructure workflows -> deployment/infrastructure/ + .github/workflows/
Write-Host "`n--- Infrastructure -> deployment/ + .github/workflows/ ---" -ForegroundColor White
foreach ($wf in $InfraWorkflows) {
    $src = "$SourceRoot\.github\workflows\$wf"
    $dstDeploy = "$MotherRepo\deployment\infrastructure\$wf"
    $dstDogfood = "$MotherRepo\.github\workflows\$wf"
    if (Copy-SyncFile -Source $src -Dest $dstDeploy -Preview:$DryRun) { $copied++ }
    if (Copy-SyncFile -Source $src -Dest $dstDogfood -Preview:$DryRun) { $copied++ }
}

# 5. Dogfood-only workflows
Write-Host "`n--- Dogfood-Only Workflows ---" -ForegroundColor White
foreach ($wf in $DogfoodOnlyWorkflows) {
    $src = "$SourceRoot\.github\workflows\$wf"
    $dst = "$MotherRepo\.github\workflows\$wf"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 6. Workflow README
Write-Host "`n--- Workflow README ---" -ForegroundColor White
$src = "$SourceRoot\.github\workflows\README.md"
$dst = "$MotherRepo\.github\workflows\README.md"
if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }

# 7. Documentation
Write-Host "`n--- Documentation ---" -ForegroundColor White
foreach ($doc in $DocFiles) {
    $src = "$SourceRoot\$doc"
    $dst = "$MotherRepo\$doc"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 8. Governance files
Write-Host "`n--- Governance ---" -ForegroundColor White
foreach ($gov in $GovernanceFiles) {
    $src = "$SourceRoot\$gov"
    $destName = Split-Path $gov -Leaf
    $dst = "$MotherRepo\deployment\governance\$destName"
    if (Copy-SyncFile -Source $src -Dest $dst -Preview:$DryRun) { $copied++ }
}

# 9. Prompt files
Write-Host "`n--- Prompt Files ---" -ForegroundColor White
$promptFiles = Get-ChildItem "$SourceRoot\.github\prompts\sfl-*.prompt.md" -ErrorAction SilentlyContinue
foreach ($pf in $promptFiles) {
    $dst = "$MotherRepo\.github\prompts\$($pf.Name)"
    if (Copy-SyncFile -Source $pf.FullName -Dest $dst -Preview:$DryRun) { $copied++ }
}

# --- Summary ---

Write-Host "`n--- Summary ---" -ForegroundColor White
Write-Host "Files processed: $copied" -ForegroundColor Cyan

if (-not $DryRun) {
    Write-Host "`n--- Git Diff (motherrepo) ---" -ForegroundColor White
    Push-Location $MotherRepo
    try {
        & git diff --stat
        $changes = (& git status --porcelain | Measure-Object).Count
        if ($changes -eq 0) {
            Write-Host "`nNo changes detected — repos are already in sync." -ForegroundColor Green
        } else {
            Write-Host "`n$changes file(s) changed. Review, commit, and push from:" -ForegroundColor Yellow
            Write-Host "  cd $MotherRepo" -ForegroundColor Yellow
            Write-Host "  git add -A && git commit -m 'sync: update SFL from hs-buddy'" -ForegroundColor Yellow
            Write-Host "  git push" -ForegroundColor Yellow
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== $mode COMPLETE ===" -ForegroundColor White
