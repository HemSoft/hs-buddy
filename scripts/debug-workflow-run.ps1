#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Debug a GitHub Actions agentic workflow run by extracting key information
  from the logs in a structured, targeted way.

.DESCRIPTION
  Instead of manually grepping through massive log output with dozens of
  discovery calls, this script extracts exactly what matters for debugging
  an agentic workflow run:

  1. Run metadata (workflow, status, conclusion, timing, model)
  2. Available safe-output tools and their limits
  3. Safe-input calls made by the agent
  4. Safe-output tool calls made by the agent
  5. Agent output ingestion summary (what was produced)
  6. Missing tool/data records
  7. Noop message (if any)
  8. Failure handling results
  9. The full agent output content (first 2000 chars)

.PARAMETER RunId
  The workflow run ID to debug. If omitted, shows recent runs to pick from.

.PARAMETER Workflow
    Workflow file name filter (e.g., "sfl-analyzer-c"). Shows recent runs for that workflow.

.PARAMETER Repo
  Repository (default: relias-engineering/hs-buddy).

.PARAMETER Full
  Show the complete agent output content instead of truncating at 2000 chars.

.EXAMPLE
  .\debug-workflow-run.ps1 -RunId 22528612554
    .\debug-workflow-run.ps1 -Workflow sfl-analyzer-c
  .\debug-workflow-run.ps1 -Workflow pr-fixer -Full
#>
param(
    [string]$RunId,
    [string]$Workflow,
    [string]$Repo = "relias-engineering/hs-buddy",
    [switch]$Full
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$InformationPreference = 'Continue'

# -- Helper: colored output --
function Write-Section([string]$Title) {
    Write-Information "$([char]27)[36m`n=== $Title ===$([char]27)[0m"
}

function Write-KeyValue([string]$Key, [string]$Value, [string]$ValueColor = 'White') {
    $colorMap = @{ White = '37'; Green = '32'; Red = '31'; Yellow = '33' }
    $code = if ($colorMap.ContainsKey($ValueColor)) { $colorMap[$ValueColor] } else { '37' }
    Write-Information "  $([char]27)[90m${Key}: $([char]27)[0m$([char]27)[${code}m${Value}$([char]27)[0m"
}

function Write-Detail([string]$Text, [string]$Color = 'Gray') {
    $colorMap = @{ Gray = '37'; Green = '32'; Red = '31'; Yellow = '33'; DarkGray = '90'; DarkYellow = '33' }
    $code = if ($colorMap.ContainsKey($Color)) { $colorMap[$Color] } else { '37' }
    Write-Information "  $([char]27)[${code}m${Text}$([char]27)[0m"
}

# -- Resolve run ID --
if (-not $RunId) {
    if ($Workflow) {
        # Auto-pick the most recent run for the given workflow
        $wfFile = if ($Workflow -match '\.yml$') { $Workflow }
                  elseif ($Workflow -match '\.lock\.yml$') { $Workflow }
                  else { "$Workflow.lock.yml" }

        $runs = gh run list --repo $Repo --workflow $wfFile --limit 1 --json databaseId 2>&1 |
            ConvertFrom-Json
        if ($runs -and $runs.Count -gt 0) {
            $RunId = $runs[0].databaseId.ToString()
        }
        else {
            Write-Information "$([char]27)[31mNo runs found for workflow $wfFile$([char]27)[0m"
            exit 1
        }
    }
    else {
        Write-Information "$([char]27)[31mERROR: Provide -RunId <id> or -Workflow <name>$([char]27)[0m"
        exit 1
    }
}

# -- Fetch run metadata --
Write-Section "Run Metadata"
$meta = gh run view $RunId --repo $Repo --json databaseId,status,conclusion,createdAt,updatedAt,workflowName,event,headBranch 2>&1 |
    ConvertFrom-Json

$conclusionColor = switch ($meta.conclusion) {
    'success' { 'Green' }
    'failure' { 'Red' }
    default { 'Yellow' }
}

Write-KeyValue "Run ID" $meta.databaseId
Write-KeyValue "Workflow" $meta.workflowName
Write-KeyValue "Status" $meta.status
Write-KeyValue "Conclusion" $meta.conclusion $conclusionColor
Write-KeyValue "Event" $meta.event
Write-KeyValue "Branch" $meta.headBranch
Write-KeyValue "Created" $meta.createdAt
Write-KeyValue "Updated" $meta.updatedAt

if ($meta.createdAt -and $meta.updatedAt) {
    $duration = ([DateTime]::Parse($meta.updatedAt) - [DateTime]::Parse($meta.createdAt))
    Write-KeyValue "Duration" ("{0:mm\:ss}" -f $duration)
}

# -- Fetch logs (once) --
Write-Information "$([char]27)[90m`nFetching logs...$([char]27)[0m"
$logLines = gh run view $RunId --repo $Repo --log 2>&1

# -- Parse step names --
Write-Section "Job Steps"
$steps = $logLines | ForEach-Object {
    if ($_ -match '^(\S+)\s+(.+?)\s+\d{4}-\d{2}-\d{2}T') {
        [PSCustomObject]@{ Job = $matches[1]; Step = $matches[2] }
    }
} | Select-Object -Property Job, Step -Unique

$steps | Group-Object Job | ForEach-Object {
    Write-Information "  $([char]27)[33m[$($_.Name)]$([char]27)[0m"
    $_.Group | ForEach-Object {
        Write-Detail "    $($_.Step)" DarkGray
    }
}

# -- Model info --
Write-Section "Model"
$modelLine = $logLines | Where-Object { $_ -match '"model":\s*"([^"]+)"' } | Select-Object -First 1
if ($modelLine -and $modelLine -match '"model":\s*"([^"]+)"') {
    Write-KeyValue "Model" $matches[1]
}
else {
    Write-Detail "(not found)" DarkGray
}

# -- Safe-output tools available --
Write-Section "Safe-Output Tools Available"
$configLine = $logLines | Where-Object { $_ -match 'Final processed config:' } | Select-Object -First 1
if ($configLine -and $configLine -match 'Final processed config:\s*(\{.+)') {
    try {
        $config = $matches[1] | ConvertFrom-Json
        $config.PSObject.Properties | ForEach-Object {
            $max = if ($_.Value.max) { "max=$($_.Value.max)" } else { "unlimited" }
            $extra = ""
            if ($_.Value.workflows) { $extra = " workflows=[$($_.Value.workflows -join ', ')]" }
            Write-KeyValue $_.Name "$max$extra"
        }
    }
    catch {
        Write-Detail $matches[1] DarkGray
    }
}
else {
    Write-Detail "(config not found in logs)" DarkGray
}

# -- Safe-input calls --
Write-Section "Safe-Input Calls"
$siCalls = $logLines | Where-Object { $_ -match '[\*\u2713]\s*safeinputs-(\S+)' } | ForEach-Object {
    if ($_ -match '[\*\u2713]\s*safeinputs-(\S+)') { $matches[1] }
} | Select-Object -Unique
if ($siCalls) {
    $siCalls | ForEach-Object { Write-Detail "[ok] $_" Green }
}
else {
    Write-Detail "(none)" DarkGray
}

# -- Safe-output tool calls by agent --
Write-Section "Safe-Output Tool Calls"
$soCalls = $logLines | Where-Object { $_ -match '[\*\u2713]\s*safeoutputs-(\S+)' } | ForEach-Object {
    if ($_ -match '[\*\u2713]\s*safeoutputs-(\S+)') { $matches[1] }
} | Select-Object -Unique
if ($soCalls) {
    $soCalls | ForEach-Object { Write-Detail "[ok] $_" Green }
}
else {
    Write-Detail "(none)" DarkGray
}

# -- Agent output ingestion --
Write-Section "Agent Output Ingestion"
$ingestLines = $logLines | Where-Object { $_ -match '^\S+\s+Ingest agent output' }

# Output content length
$contentLen = $ingestLines | Where-Object { $_ -match 'output content length:\s*(\d+)' } | ForEach-Object {
    if ($_ -match 'output content length:\s*(\d+)') { $matches[1] }
} | Select-Object -First 1
if ($contentLen) { Write-KeyValue "Content length" "$contentLen chars" }

# Output types
$outputTypes = $ingestLines | Where-Object { $_ -match 'output_types:\s*(.+)' } | ForEach-Object {
    if ($_ -match 'output_types:\s*(.+)$') { $matches[1].Trim() }
} | Select-Object -First 1
if ($outputTypes) { Write-KeyValue "Output types" $outputTypes }

# Valid items parsed
$validItems = $ingestLines | Where-Object { $_ -match 'parsed (\d+) valid output' } | ForEach-Object {
    if ($_ -match 'parsed (\d+) valid output') { $matches[1] }
} | Select-Object -First 1
if ($validItems) { Write-KeyValue "Valid items" $validItems }

# First 500 chars preview
$preview = $ingestLines | Where-Object { $_ -match 'First 500 chars of output:' } | ForEach-Object {
    if ($_ -match 'First 500 chars of output:\s*(.+)$') { $matches[1].Trim() }
} | Select-Object -First 1
if ($preview) {
    Write-Information ""
    Write-Detail "Preview:" Yellow
    $maxLen = if ($Full) { $preview.Length } else { [Math]::Min(500, $preview.Length) }
    Write-Detail $preview.Substring(0, $maxLen) DarkGray
}

if (-not $contentLen -and -not $outputTypes) {
    Write-Detail "(no ingestion data found)" DarkGray
}

# -- Threat detection --
Write-Section "Threat Detection"
$threatLine = $logLines | Where-Object { $_ -match 'The agent output contains' } | Select-Object -First 1
if ($threatLine -and $threatLine -match 'The agent output contains (.+)$') {
    $verdict = $matches[1].Trim()
    $tColor = if ($verdict -match 'No secrets|legitimate|no.*injection|no.*suspicious') { 'Green' } else { 'Yellow' }
    Write-Detail $verdict $tColor
}
else {
    Write-Detail "(not found)" DarkGray
}

# -- Missing tool/data --
Write-Section "Missing Tool / Missing Data"
$missingLines = $logLines | Where-Object {
    $_ -match '(Record Missing Tool|Missing tool|missing_tool|missing_data)' -and
    $_ -notmatch 'Setup Scripts' -and $_ -notmatch 'Copied' -and $_ -notmatch 'Skipping'
}
$missingCount = ($missingLines | Where-Object { $_ -match 'Max count:' }).Count
if ($missingCount -gt 0) {
    $maxCountLine = $missingLines | Where-Object { $_ -match 'Max count:\s*(.+)' } | ForEach-Object {
        if ($_ -match 'Max count:\s*(.+)$') { $matches[1].Trim() }
    } | Select-Object -First 1
    Write-Detail "Missing tool handler ran (max count: $maxCountLine)" Yellow
}
else {
    Write-Detail "(none)" Green
}

# -- Noop message --
Write-Section "Noop Message"
$noopLines = $logLines | Where-Object { $_ -match 'Handle No-Op Message' }
$noopMsg = $noopLines | Where-Object { $_ -match 'No-op message:\s*$' -or $_ -match 'No-op message:\s*(.+)' } | ForEach-Object {
    if ($_ -match 'No-op message:\s*(.+)$') { $matches[1].Trim() }
    elseif ($_ -match 'No-op message:\s*$') { "(empty)" }
} | Select-Object -First 1

$noopSkip = $noopLines | Where-Object { $_ -match 'No no-op message found' }
if ($noopMsg -and $noopMsg -ne "(empty)") {
    Write-Detail $noopMsg Yellow
}
elseif ($noopSkip) {
    Write-Detail "No noop (agent called a real tool)" Green
}
else {
    Write-Detail "(no noop handling found)" DarkGray
}

# -- Failure handling --
Write-Section "Failure Handling"
$failLines = $logLines | Where-Object { $_ -match 'Handle Agent Failure' }
$agentConclusion = $failLines | Where-Object { $_ -match 'Agent conclusion:\s*(\S+)' } | ForEach-Object {
    if ($_ -match 'Agent conclusion:\s*(\S+)') { $matches[1] }
} | Select-Object -First 1

$skipReason = $failLines | Where-Object { $_ -match 'skipping failure handling' } | Select-Object -First 1
$outputLen = $failLines | Where-Object { $_ -match 'output content length:\s*(\d+)' } | ForEach-Object {
    if ($_ -match 'output content length:\s*(\d+)') { $matches[1] }
} | Select-Object -First 1

if ($agentConclusion) {
    $acColor = if ($agentConclusion -eq 'success') { 'Green' } else { 'Red' }
    Write-KeyValue "Agent conclusion" $agentConclusion $acColor
}
if ($outputLen) { Write-KeyValue "Output length" "$outputLen chars" }
if ($skipReason) { Write-Detail "Skipped failure handling (agent succeeded)" Green }

if (-not $agentConclusion -and -not $skipReason) {
    Write-Detail "(no failure handling data found)" DarkGray
}

# -- Token usage --
Write-Section "Token Usage"
$tokenLine = $logLines | Where-Object { $_ -match '\d+\.?\d*k\s+in,\s+\d+' } | Select-Object -First 1
if ($tokenLine -and $tokenLine -match '(\S+\s+\d+\.?\d*k\s+in,\s+\d+.+)$') {
    Write-Detail $matches[1].Trim()
}
else {
    Write-Detail "(not found)" DarkGray
}

# -- Premium requests --
$premiumLine = $logLines | Where-Object { $_ -match 'Premium request' } | Select-Object -First 1
if ($premiumLine -and $premiumLine -match '(Est\.\s+\d+\s+Premium.*)$') {
    Write-Detail $matches[1].Trim()
}

Write-Information ""
