<#
.SYNOPSIS
    Creates the Set it Free label taxonomy in a GitHub repository.

.DESCRIPTION
    Sets up all labels defined in labels.json, the canonical machine-readable
    label taxonomy for the Set it Free governance policy.

    Idempotent: updates existing labels rather than failing on duplicates.

.PARAMETER Owner
    GitHub org or user that owns the target repository.

.PARAMETER Repo
    Repository name.

.PARAMETER DryRun
    Print what would be done without making any API calls.

.EXAMPLE
    .\.sfl\setup-labels.ps1 -Owner HemSoft -Repo hs-buddy
    .\.sfl\setup-labels.ps1 -Owner HemSoft -Repo hs-buddy -DryRun
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string] $Owner,

    [Parameter(Mandatory)]
    [string] $Repo,

    [switch] $DryRun
)

$InformationPreference = 'Continue'
$esc = [char]27

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Label definitions (read from canonical labels.json) ─────────────────────

$LabelsJsonPath = Join-Path $PSScriptRoot "labels.json"
if (-not (Test-Path $LabelsJsonPath)) {
    Write-Error "labels.json not found at $LabelsJsonPath"
    exit 1
}
$Labels = Get-Content $LabelsJsonPath -Raw | ConvertFrom-Json

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Write-Status([string]$Emoji, [string]$Message, [string]$ColorName = "Cyan") {
    $code = @{ 'Red'='91';'Green'='92';'Yellow'='93';'Cyan'='96';'White'='97';'DarkGray'='90' }[$ColorName]
    if (-not $code) { $code = '96' }
    Write-Information "${esc}[${code}m$Emoji  $Message${esc}[0m"
}

function Get-GhToken {
    $token = & gh auth token 2>$null
    if (-not $token) {
        throw "GitHub CLI is not authenticated. Run 'gh auth login' first."
    }
    return $token
}

function Invoke-GhApi {
    param(
        [string] $Method,
        [string] $Endpoint,
        [hashtable] $Body
    )

    $ghArgs = @("api", "--method", $Method, $Endpoint)
    if ($Body) {
        foreach ($key in $Body.Keys) {
            $ghArgs += @("-f", "$key=$($Body[$key])")
        }
    }

    $result = & gh @ghArgs 2>&1
    $exitCode = $LASTEXITCODE

    return @{ ExitCode = $exitCode; Output = $result }
}

function Get-ExistingLabelList {
    $response = & gh api "repos/$Owner/$Repo/labels" --paginate 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to list labels: $response"
    }
    return ($response | ConvertFrom-Json) | ForEach-Object { $_.name }
}

# ─── Main ─────────────────────────────────────────────────────────────────────

Write-Status "🏷️" "Set it Free — GitHub Label Setup" White
Write-Status "📦" "Target: $Owner/$Repo"

if ($DryRun) {
    Write-Status "🔍" "DRY RUN — no changes will be made" Yellow
}

# Verify gh CLI is available
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is not installed. Install via: winget install GitHub.cli"
    exit 1
}

# Fetch existing labels
Write-Status "📋" "Fetching existing labels…"
try {
    $existing = Get-ExistingLabelList
    Write-Status "✅" "Found $($existing.Count) existing label(s)"
} catch {
    Write-Error $_
    exit 1
}

$created = 0
$updated = 0
$skipped = 0
$failed  = 0

foreach ($label in $Labels) {
    $name   = $label.name
    $color  = $label.color
    $desc   = $label.description
    $exists = $existing -contains $name

    if ($DryRun) {
        $action = if ($exists) { "UPDATE" } else { "CREATE" }
        Write-Status "🔍" "[$action] $name (#$color)"
        continue
    }

    try {
        if ($exists) {
            # PATCH to update color/description
            $result = Invoke-GhApi -Method PATCH `
                -Endpoint "repos/$Owner/$Repo/labels/$([uri]::EscapeDataString($name))" `
                -Body @{ color = $color; description = $desc }

            if ($result.ExitCode -eq 0) {
                Write-Status "✏️ " "Updated:  $name" Green
                $updated++
            } else {
                Write-Status "❌" "Failed to update $name`: $($result.Output)" Red
                $failed++
            }
        } else {
            # POST to create
            $result = Invoke-GhApi -Method POST `
                -Endpoint "repos/$Owner/$Repo/labels" `
                -Body @{ name = $name; color = $color; description = $desc }

            if ($result.ExitCode -eq 0) {
                Write-Status "✅" "Created:  $name" Green
                $created++
            } else {
                Write-Status "❌" "Failed to create $name`: $($result.Output)" Red
                $failed++
            }
        }
    } catch {
        Write-Status "❌" "Error on $name`: $_" Red
        $failed++
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Information ""
Write-Information "${esc}[90m─────────────────────────────────────────${esc}[0m"
if ($DryRun) {
    Write-Status "🔍" "Dry run complete. $($Labels.Count) label(s) would be processed." Yellow
} else {
    Write-Status "📊" "Created: $created  |  Updated: $updated  |  Skipped: $skipped  |  Failed: $failed"
    if ($failed -gt 0) {
        Write-Status "⚠️ " "$failed label(s) failed. Check output above." Yellow
        exit 1
    } else {
        Write-Status "🎉" "Done! View labels at: https://github.com/$Owner/$Repo/labels" Green
    }
}
