# Re-enables all SFL scheduled workflows.


$InformationPreference = 'Continue'
$esc = [char]27
$emdash = [char]0x2014  # em dash - matches actual GitHub workflow names
$repo = "relias-engineering/hs-buddy"

$workflows = @(
    "Agentic Maintenance"
    "Copilot Setup Steps"
    "SFL Auditor"
    "Issue Processor"
    "SFL Analyzer A $emdash Full-Spectrum Review"
    "SFL Analyzer B $emdash Full-Spectrum Review"
    "SFL Analyzer C $emdash Full-Spectrum Review"
    "Simplisticate Audit"
    "Daily Repo Status"
    "Daily Repo Audit"
    "Discussion Processor"
    "PR Label Actions"
)

Write-Information "${esc}[93mResuming all SFL workflows...${esc}[0m"

foreach ($wf in $workflows) {
    $state = gh workflow view $wf --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Information "${esc}[90m  Already enabled: $wf${esc}[0m"
    } else {
        gh workflow enable $wf --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[92m  Enabled: $wf${esc}[0m"
        } else {
            Write-Information "${esc}[91m  Failed:  $wf${esc}[0m"
        }
    }
}

Write-Information "${esc}[92m`nAll SFL workflows resumed.${esc}[0m"
