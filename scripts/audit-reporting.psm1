Set-StrictMode -Version Latest

function Get-CoveragePolicy {
    param([Parameter(Mandatory)][string]$Repository)

    $policy = [ordered]@{}
    foreach ($suite in @('Renderer', 'Electron', 'Convex')) {
        $config = if ($suite -eq 'Renderer') { 'vitest.config.ts' } else { "vitest.$($suite.ToLowerInvariant()).config.ts" }
        $source = Get-Content -Raw (Join-Path $Repository $config)
        $blocks = [regex]::Matches($source, 'thresholds\s*:\s*\{([^}]+)\}')
        if ($blocks.Count -ne 1) { throw "Cannot read an unambiguous coverage threshold block in $config" }
        $thresholds = [ordered]@{}
        foreach ($metric in @('statements', 'branches', 'functions', 'lines')) {
            $values = [regex]::Matches($blocks[0].Groups[1].Value, "\b${metric}\s*:\s*(\d+(?:\.\d+)?)\s*(?:,|$)")
            if ($values.Count -ne 1) { throw "Cannot read $metric coverage threshold in $config" }
            $thresholds[$metric] = [double]::Parse($values[0].Groups[1].Value, [cultureinfo]::InvariantCulture)
            if ($thresholds[$metric] -gt 100) { throw "Invalid $metric threshold in $config" }
        }
        $policy[$suite] = [pscustomobject]@{
            Source = $config
            Enforced = $thresholds
            Target = ($thresholds.GetEnumerator() | ForEach-Object { "$($_.Value)% $($_.Key)" }) -join ', '
            AspirationalTarget = if ($suite -eq 'Renderer') { '100% statements, branches, functions, lines; bun run coverage:perfection reports only' } else { $null }
        }
    }
    return [pscustomobject]$policy
}

function New-AuditGate {
    param([string]$Gate, [string]$Target, [string]$Script, [string[]]$Requires = @())
    [pscustomobject]@{
        Gate = $Gate
        Target = $Target
        FilePath = 'bun'
        Arguments = @('run', $Script)
        Command = "bun run $Script"
        Requires = @($Requires)
        External = $false
    }
}

function Get-AuditGatePlan {
    param([Parameter(Mandatory)][object]$Coverage, [Parameter(Mandatory)][string]$Repository)

    New-AuditGate 'TypeScript' '0 errors; restored Aspire SDK required' 'typecheck'
    New-AuditGate 'ESLint' '0 errors, 0 warnings' 'lint'
    New-AuditGate 'Test Coverage' $Coverage.Renderer.Target 'test:coverage'
    New-AuditGate 'CRAP Score' 'Threshold 10; accepted per-function debt cannot increase' 'crap:check'
    New-AuditGate 'Knip' '0 findings' 'knip'
    New-AuditGate 'Prettier' '0 unformatted files' 'format:check'
    New-AuditGate 'Markdown Lint' '0 findings' 'lint:md'
    [pscustomobject]@{
        Gate = 'Build'; Target = 'Fresh production renderer and Electron outputs'
        FilePath = 'node'; Arguments = @((Join-Path $Repository 'node_modules/vite/bin/vite.js'), 'build')
        Command = 'node node_modules/vite/bin/vite.js build'
        Requires = @(); External = $false
    }
    New-AuditGate 'Production CSP' 'Production script policy; no unsafe-eval' 'security:csp' @('Build')
    New-AuditGate 'Bundle Size' 'Within maintained baseline and initial-renderer budgets' 'bundle-size' @('Build')
    New-AuditGate 'e18e' '0 untriaged direct-dependency findings; transitive warnings informational' 'e18e'
    New-AuditGate 'Dep Cruiser' '0 errors; configured warnings and informational diagnostics are nonblocking' 'deps:check'
    New-AuditGate 'Quality Lint' 'No quality-baseline regressions' 'lint:quality'
    [pscustomobject]@{
        Gate = 'Electron Security'; Target = 'Configured Electron security checks'
        FilePath = 'bun'; Arguments = @('scripts/check-electron-security.ts')
        Command = 'bun scripts/check-electron-security.ts'; Requires = @(); External = $false
    }
    New-AuditGate 'React Doctor' 'Zero unsuppressed diagnostics; native score only when supplied by the analyzer' 'react-doctor'
    [pscustomobject]@{
        Gate = 'Scorecard'; Target = '100/100 Gold; external reporting goal'
        FilePath = 'pwsh'; Arguments = @('-NoProfile', '-File', (Join-Path $Repository 'scripts/get-scorecard-report.ps1'), '-Json')
        Command = 'pwsh -NoProfile -File scripts/get-scorecard-report.ps1 -Json'
        Requires = @(); External = $true
    }
}

function New-AuditResult {
    param([object]$Spec, [string]$Status, [string]$Detail, [int]$ExitCode = 0, [double]$Seconds = 0)
    [pscustomobject]@{
        Gate = $Spec.Gate; Target = $Spec.Target; Command = $Spec.Command
        Status = $Status; Detail = $Detail; ExitCode = $ExitCode
        Seconds = [math]::Round($Seconds, 2)
    }
}

function Get-AuditPrerequisite {
    param([object]$Spec, [string]$Repository, [hashtable]$Results)
    if (-not (Get-Command $Spec.FilePath -ErrorAction SilentlyContinue)) { return "Missing executable: $($Spec.FilePath)" }
    if (-not $Spec.External -and -not (Test-Path (Join-Path $Repository 'node_modules'))) {
        return 'Missing checkout-local dependencies; install the frozen lockfile outside read-only audit mode'
    }
    if (-not $Spec.External) {
        # The baseline requires the frozen installation, including composite commands and config plugins.
        # Read its authoritative declarations rather than maintaining a second, incomplete module list.
        try {
            $manifest = Get-Content -Raw (Join-Path $Repository 'package.json') | ConvertFrom-Json -AsHashtable
            $modules = @(foreach ($section in @('dependencies', 'devDependencies')) {
                if ($manifest.ContainsKey($section)) {
                    if ($manifest[$section] -isnot [collections.IDictionary]) { throw "Invalid $section mapping" }
                    $manifest[$section].Keys
                }
            })
        } catch { return "Unreadable dependency declarations: $($_.Exception.Message)" }
        foreach ($module in @($modules | Sort-Object -Unique)) {
            if (-not (Test-Path (Join-Path $Repository "node_modules/$module/package.json"))) {
                return "Missing checkout-local module: $module; restore the declared frozen installation outside audit mode"
            }
        }
    }
    if ($Spec.Gate -eq 'Build' -and -not (Test-Path (Join-Path $Repository 'node_modules/vite/bin/vite.js'))) {
        return 'Missing checkout-local Vite CLI; no package will be installed during audit'
    }
    if ($Spec.Gate -in @('e18e', 'React Doctor', 'CRAP Score') -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
        return 'Missing executable: node'
    }
    if ($Spec.Gate -eq 'CRAP Score' -and -not (Get-Command bunx -ErrorAction SilentlyContinue)) {
        return 'Missing executable: bunx'
    }
    if ($Spec.Gate -eq 'CRAP Score' -and -not (Test-Path (Join-Path $Repository 'node_modules/vitest/vitest.mjs'))) {
        return 'Missing checkout-local Vitest CLI; no package will be installed during audit'
    }
    foreach ($dependency in $Spec.Requires) {
        if (-not $Results.ContainsKey($dependency) -or $Results[$dependency].Status -ne 'PASS') {
            return "Requires successful fresh $dependency evidence from this invocation"
        }
    }
    return $null
}

function Test-FreshAuditBuild {
    param([string]$Repository, [datetime]$StartedAtUtc)
    foreach ($asset in @('dist/index.html', 'dist-electron/main.js')) {
        $path = Join-Path $Repository $asset
        if (-not (Test-Path $path)) { return "Missing fresh build output: $asset" }
        if ((Get-Item $path).LastWriteTimeUtc -lt $StartedAtUtc) { return "Stale build output: $asset" }
    }
    return $null
}

function Get-AuditCommandStatus {
    param([object]$Spec, [int]$ExitCode, [string]$Output)
    if ($ExitCode -eq 127 -or $Output -match '(?i)(command not found|not recognized as.*command|could not find.*executable)') {
        return 'BLOCKED'
    }
    if ($Spec.Gate -eq 'TypeScript' -and $Output -match '(?m)^ERROR: Aspire AppHost is not bootstrapped\.') { return 'BLOCKED' }
    if ($Spec.External -and $ExitCode -ne 0) { return 'BLOCKED' }
    if ($ExitCode -eq 0) { return 'PASS' }
    return 'FAIL'
}

function Get-AuditDetail {
    param([object]$Spec, [string[]]$Output)
    $text = $Output -join "`n"
    if ($Spec.Gate -eq 'Dep Cruiser') {
        $counts = [regex]::Match($text, '(\d+)\s+errors?,\s*(\d+)\s+warnings?')
        if ($counts.Success) { return "$($counts.Groups[1].Value) errors, $($counts.Groups[2].Value) warnings; warnings are nonblocking" }
    }
    $lines = @($Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 5)
    if ($lines.Count -eq 0) { return 'No output' }
    return $lines -join ' | '
}

function Get-AuditCIScope {
    param([string]$Repository, [hashtable]$Results, [object]$Coverage)
    $covered = @{
        'lint' = @('ESLint', 'Knip', 'Prettier', 'Markdown Lint', 'e18e', 'Dep Cruiser', 'Quality Lint', 'Electron Security')
        'typecheck' = @('TypeScript'); 'test' = @('Test Coverage')
        'build' = @('Build', 'Production CSP', 'Bundle Size'); 'react-doctor' = @('React Doctor')
        'crap' = @('CRAP Score'); 'crap-coverage' = @('CRAP Score')
    }
    $excluded = @{
        'benchmarks' = 'Requires controlled hosted benchmark environment and maintained comparison artifacts'
        'memory-policy' = 'Hosted change classification is not packaged memory measurement'
        'mutation' = 'Independent Stryker gate; run bun run test:mutation separately'
        'test-electron' = "Independent Electron coverage suite; enforced $($Coverage.Electron.Target); run bun run test:electron:coverage"
        'test-convex' = "Independent Convex coverage suite; enforced $($Coverage.Convex.Target); run bun run test:convex:coverage"
        'test-ipc-contracts' = 'Independent IPC integration suite; run bun run test:ipc-contracts separately'
        'test-e2e' = 'Requires browser runtime and isolated E2E environment; run bun run test:e2e separately'
        'test-electron-e2e' = 'Requires Electron runtime and display environment; run bun run test:e2e:electron separately'
        'electron-memory-sample' = 'Requires packaged Windows app and three controlled memory samples'
        'test-electron-memory' = 'Requires hosted classification and qualified packaged-memory samples'
        'package-smoke' = 'Requires Windows, Linux and both macOS architectures with installer execution'
        'lighthouse' = 'Requires Chrome and separate E2E-mode build; run bun run lhci separately'
        'ci-feedback' = 'Hosted fast-feedback aggregate; local subset does not satisfy this check'
        'ci-complete' = 'Hosted final qualification aggregate; local baseline is not complete CI qualification'
    }
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { throw 'Missing Bun for read-only CI YAML discovery' }
    # Use the pinned runtime's parser so quoted, inline and underscore-prefixed IDs are included.
    $program = @'
const data = Bun.YAML.parse(await Bun.file(process.argv[1]).text());
if (!data?.jobs || typeof data.jobs !== 'object' || Array.isArray(data.jobs)) throw new Error('Missing CI jobs mapping');
const names = Object.keys(data.jobs);
if (!names.length || !names.every(name => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name))) throw new Error('Invalid CI job IDs');
console.log(JSON.stringify(names));
'@
    $output = @(& bun -e $program (Join-Path $Repository '.github/workflows/ci.yml') 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0) { throw "Cannot discover CI jobs: $($output -join ' ')" }
    $jobs = ($output -join "`n") | ConvertFrom-Json
    foreach ($job in $jobs) {
        if ($covered.ContainsKey($job)) {
            $statuses = @($covered[$job] | ForEach-Object { $Results[$_].Status })
            $status = if ($statuses -contains 'FAIL') { 'FAIL' } elseif ($statuses -contains 'BLOCKED') { 'BLOCKED' } elseif ($statuses -contains 'EXCLUDED') { 'EXCLUDED' } elseif ($statuses -contains 'PLANNED') { 'PLANNED' } else { 'PASS' }
            [pscustomobject]@{ Gate = $job; Status = $status; Detail = "Local equivalents: $($covered[$job] -join ', '); hosted platform matrix still required" }
        } elseif ($excluded.ContainsKey($job)) {
            [pscustomobject]@{ Gate = $job; Status = 'EXCLUDED'; Detail = $excluded[$job] }
        } else {
            [pscustomobject]@{ Gate = $job; Status = 'BLOCKED'; Detail = 'Unmapped CI job; update local scope accounting before claiming a complete baseline' }
        }
    }
    [pscustomobject]@{ Gate = 'npm audit'; Status = 'EXCLUDED'; Detail = 'Independent security workflow; dependency advisory checks require a network service' }
    [pscustomobject]@{ Gate = 'CodeQL'; Status = 'EXCLUDED'; Detail = 'Independent hosted code-scanning workflow; local baseline cannot establish repository rule acceptance' }
}

function New-AuditReport {
    param([string]$Repository, [object]$Coverage, [object[]]$Results, [object[]]$CIGates)
    $actions = @(@($Results) + @($CIGates) | Where-Object { $_.Status -in @('FAIL', 'BLOCKED') })
    $passing = @($Results | Where-Object { $_.Status -eq 'PASS' }).Count
    $executed = @($Results | Where-Object { $_.Status -in @('PASS', 'FAIL') }).Count
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('America/New_York')
    $now = [TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow, $zone)
    $suffix = if ($zone.IsDaylightSavingTime($now)) { 'EDT' } else { 'EST' }
    [pscustomobject]@{
        ReportVersion = 2; Repository = $Repository
        GeneratedAt = $now.ToString('yyyy-MM-dd HH:mm:ss') + " $suffix"
        Scope = 'Local baseline only; not ci-feedback or ci-complete'
        FullQualification = $false
        BaselineScore = "$passing/$executed executed gates passing; $($Results.Count) gates accounted for"
        CoveragePolicy = $Coverage; Gates = @($Results); CIGates = @($CIGates); NextActions = $actions
    }
}

Export-ModuleMember -Function Get-CoveragePolicy, Get-AuditGatePlan, New-AuditResult, Get-AuditPrerequisite, Test-FreshAuditBuild, Get-AuditCommandStatus, Get-AuditDetail, Get-AuditCIScope, New-AuditReport
