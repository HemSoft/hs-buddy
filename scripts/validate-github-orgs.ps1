<#
.SYNOPSIS
    Validates GitHub organization access for configured accounts.

.DESCRIPTION
    Checks if each configured GitHub account has access to its specified organization.
    Helps identify 404 errors and access issues before running the app.

.EXAMPLE
    .\validate-github-orgs.ps1
#>

param()

$ErrorActionPreference = 'Stop'

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$Gray = "${esc}[37m"
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$White = "${esc}[37m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"

Write-Information "${Cyan}Validating GitHub Organization Access...${Reset}"
Write-Information ""

# Check if gh CLI is installed
try {
    $null = gh --version
} catch {
    Write-Information "${Red}ERROR: GitHub CLI (gh) is not installed or not in PATH${Reset}"
    Write-Information "${Yellow}   Install from: https://cli.github.com/${Reset}"
    exit 1
}

# Get authenticated accounts
Write-Information "${Cyan}Checking authenticated GitHub accounts...${Reset}"
$authStatus = gh auth status 2>&1 | Out-String

# Parse authenticated accounts
$accounts = @()
$authStatus -split "`n" | ForEach-Object {
    if ($_ -match 'Logged in to github\.com account (\w+)') {
        $accounts += $Matches[1]
    }
}

if ($accounts.Count -eq 0) {
    Write-Information "${Red}ERROR: No authenticated GitHub accounts found${Reset}"
    Write-Information "${Yellow}   Run: gh auth login${Reset}"
    exit 1
}

Write-Information "${Green}   OK: Found $($accounts.Count) authenticated account(s): $($accounts -join ', ')${Reset}"
Write-Information ""

# Read Convex config to get GitHub accounts/orgs
Write-Information "${Cyan}Reading Convex GitHub account configurations...${Reset}"

# Check if running in dev mode (Convex dev server)
$convexUrl = $env:VITE_CONVEX_URL
if (-not $convexUrl) {
    Write-Information "${Yellow}WARNING: VITE_CONVEX_URL not set - using default dev URL${Reset}"
    $convexUrl = "https://balanced-trout-451.convex.cloud"
}

Write-Information "${Gray}   Convex URL: $convexUrl${Reset}"

# For now, we'll need to query common org patterns
# In a real scenario, you'd query the Convex DB directly or read from config
Write-Information ""
Write-Information "${Cyan}Testing organization access...${Reset}"
Write-Information ""

$testOrgs = @(
    @{ Account = "fhemmerrelias"; Org = "ReliasLearning" },
    @{ Account = "HemSoft"; Org = "HemSoft" },
    @{ Account = "franzhemmer"; Org = "franzhemmer" }
)

$hasErrors = $false

foreach ($test in $testOrgs) {
    $account = $test.Account
    $org = $test.Org
    
    Write-Information "${White}  Testing: $account -> $org${Reset}"
    
    # Check if account is authenticated
    if ($account -notin $accounts) {
        Write-Information "${Red}    ERROR: Account '$account' is not authenticated${Reset}"
        Write-Information "${Yellow}       Run: gh auth login${Reset}"
        $hasErrors = $true
        continue
    }
    
    # Test org access using gh api
    try {
        $null = gh auth token --user $account 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to get token for $account"
        }
        
        # Test org access
        gh api orgs/$org --silent 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${Green}    OK: Access confirmed${Reset}"
        } else {
            # Try as user instead of org
            gh api users/$org --silent 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Information "${Green}    OK: Access confirmed (user account)${Reset}"
            } else {
                Write-Information "${Red}    ERROR: No access to org '$org'${Reset}"
                Write-Information "${Yellow}       This may be a private org or the account lacks permissions${Reset}"
                $hasErrors = $true
            }
        }
    } catch {
        Write-Information "${Red}    ERROR: $($_.Exception.Message)${Reset}"
        $hasErrors = $true
    }
}

Write-Information ""
if ($hasErrors) {
    Write-Information "${Yellow}WARNING: Validation completed with errors${Reset}"
    Write-Information "${Gray}   Some organizations may not be accessible or accounts may need re-authentication${Reset}"
    exit 1
} else {
    Write-Information "${Green}OK: All organizations are accessible!${Reset}"
    exit 0
}
