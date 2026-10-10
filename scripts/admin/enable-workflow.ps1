# Enable one existing ordinary workflow; numeric IDs are excluded.
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('CI', 'ci.yml', 'Security Scanning', 'security.yml',
        'Benchmarks', 'benchmarks.yml', 'Rust', 'rust.yml',
        'Dependabot Lockfile Fix', 'dependabot-lockfile.yml', 'Release', 'release.yml')]
    [string]$Workflow
)

$ErrorActionPreference = 'Stop'
gh auth status
$identity = gh api user --jq '.login'
if ($LASTEXITCODE -ne 0 -or $identity -ne 'HemSoft') {
    throw 'Use the HemSoft GitHub identity for hs-buddy operations.'
}
$repo = 'hemsoft-dev/hs-buddy'
gh workflow enable $Workflow --repo $repo
if ($LASTEXITCODE -ne 0) {
    throw "Failed to enable ordinary workflow: $Workflow"
}
