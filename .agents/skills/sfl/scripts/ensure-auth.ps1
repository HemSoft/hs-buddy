<#
.SYNOPSIS
    Ensures the correct gh CLI account is active for the target repo.
.DESCRIPTION
    Maps repo org to the required gh account and switches if needed.
    Call this at the start of any SFL script or debug session.
.PARAMETER Repo
    The target repo in org/repo format (default: relias-engineering/hs-buddy).
.PARAMETER Quiet
    Suppress output when already on the correct account.
.OUTPUTS
    Returns $true if auth is correct (or was switched), $false on failure.
.EXAMPLE
    & ".agents/skills/sfl/scripts/ensure-auth.ps1"
    & ".agents/skills/sfl/scripts/ensure-auth.ps1" -Repo "HemSoft/set-it-free-loop"
#>
[CmdletBinding()]
param(
    [string]$Repo = "relias-engineering/hs-buddy",
    [switch]$Quiet
)

$InformationPreference = 'Continue'
$esc = [char]27

# Org -> required gh account mapping
$OrgAccountMap = @{
    "relias-engineering" = "fhemmerrelias"
    "HemSoft"            = "HemSoft"
    "franzhemmer"        = "franzhemmer"
    "fhemmer2-relias"    = "fhemmer2-relias"
}

$org = ($Repo -split "/")[0]
$requiredAccount = $OrgAccountMap[$org]

if (-not $requiredAccount) {
    Write-Warning "Unknown org '$org' — no account mapping. Proceeding with current auth."
    return $true
}

# Get current active account
$authOutput = gh auth status 2>&1 | Out-String
if ($authOutput -match 'account (\S+) \(keyring\)\s*\n\s*- Active account: true') {
    $currentAccount = $Matches[1]
} else {
    Write-Error "Could not determine active gh account. Run 'gh auth status' manually."
    return $false
}

if ($currentAccount -eq $requiredAccount) {
    if (-not $Quiet) {
        Write-Information "${esc}[92m  gh auth: $currentAccount (correct for $org)${esc}[0m"
    }
    return $true
}

# Need to switch
Write-Information "${esc}[93m  gh auth: switching $currentAccount -> $requiredAccount (for $org)${esc}[0m"
$switchResult = gh auth switch --user $requiredAccount 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to switch to $requiredAccount : $switchResult"
    return $false
}
Write-Information "${esc}[92m  gh auth: now $requiredAccount${esc}[0m"
return $true
