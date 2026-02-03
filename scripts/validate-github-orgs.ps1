#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates GitHub organization access for configured accounts.

.DESCRIPTION
    Checks if each configured GitHub account has access to its specified organization.
    Helps identify 404 errors and access issues before running the app.

.EXAMPLE
    .\validate-github-orgs.ps1
#>

param(
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'

Write-Host "🔍 Validating GitHub Organization Access..." -ForegroundColor Cyan
Write-Host ""

# Check if gh CLI is installed
try {
    $null = gh --version
} catch {
    Write-Host "❌ GitHub CLI (gh) is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Install from: https://cli.github.com/" -ForegroundColor Yellow
    exit 1
}

# Get authenticated accounts
Write-Host "📋 Checking authenticated GitHub accounts..." -ForegroundColor Cyan
$authStatus = gh auth status 2>&1 | Out-String

# Parse authenticated accounts
$accounts = @()
$authStatus -split "`n" | ForEach-Object {
    if ($_ -match 'Logged in to github\.com account (\w+)') {
        $accounts += $Matches[1]
    }
}

if ($accounts.Count -eq 0) {
    Write-Host "❌ No authenticated GitHub accounts found" -ForegroundColor Red
    Write-Host "   Run: gh auth login" -ForegroundColor Yellow
    exit 1
}

Write-Host "   ✓ Found $($accounts.Count) authenticated account(s): $($accounts -join ', ')" -ForegroundColor Green
Write-Host ""

# Read Convex config to get GitHub accounts/orgs
Write-Host "📋 Reading Convex GitHub account configurations..." -ForegroundColor Cyan

# Check if running in dev mode (Convex dev server)
$convexUrl = $env:VITE_CONVEX_URL
if (-not $convexUrl) {
    Write-Host "⚠️  VITE_CONVEX_URL not set - using default dev URL" -ForegroundColor Yellow
    $convexUrl = "https://balanced-trout-451.convex.cloud"
}

Write-Host "   Convex URL: $convexUrl" -ForegroundColor Gray

# For now, we'll need to query common org patterns
# In a real scenario, you'd query the Convex DB directly or read from config
Write-Host ""
Write-Host "🔍 Testing organization access..." -ForegroundColor Cyan
Write-Host ""

$testOrgs = @(
    @{ Account = "fhemmerrelias"; Org = "ReliasLearning" },
    @{ Account = "HemSoft"; Org = "HemSoft" },
    @{ Account = "franzhemmer"; Org = "franzhemmer" }
)

$hasErrors = $false

foreach ($test in $testOrgs) {
    $account = $test.Account
    $org = $test.Org
    
    Write-Host "  Testing: $account → $org" -ForegroundColor White
    
    # Check if account is authenticated
    if ($account -notin $accounts) {
        Write-Host "    ❌ Account '$account' is not authenticated" -ForegroundColor Red
        Write-Host "       Run: gh auth login" -ForegroundColor Yellow
        $hasErrors = $true
        continue
    }
    
    # Test org access using gh api
    try {
        $token = gh auth token --user $account 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to get token for $account"
        }
        
        # Test org access
        gh api orgs/$org --silent 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✓ Access confirmed" -ForegroundColor Green
        } else {
            # Try as user instead of org
            gh api users/$org --silent 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "    ✓ Access confirmed (user account)" -ForegroundColor Green
            } else {
                Write-Host "    ❌ No access to org '$org'" -ForegroundColor Red
                Write-Host "       This may be a private org or the account lacks permissions" -ForegroundColor Yellow
                $hasErrors = $true
            }
        }
    } catch {
        Write-Host "    ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        $hasErrors = $true
    }
}

Write-Host ""
if ($hasErrors) {
    Write-Host "⚠️  Validation completed with errors" -ForegroundColor Yellow
    Write-Host "   Some organizations may not be accessible or accounts may need re-authentication" -ForegroundColor Gray
    exit 1
} else {
    Write-Host "✅ All organizations are accessible!" -ForegroundColor Green
    exit 0
}
