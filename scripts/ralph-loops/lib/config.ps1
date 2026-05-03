# lib/config.ps1 — Shared config resolution for ralph-loops scripts.
# Version: 1.5.0
# Dot-source from any ralph script:  . "$PSScriptRoot/lib/config.ps1"
#
# Exports:
#   Resolve-RalphModel    -Name <alias|tier|modelKey>  → @{ Id; Multiplier; Label; Effort }
#   Resolve-RalphEffectiveModel -RequestedModel -Provider → @{ Id; Multiplier; Label; Effort }
#   Resolve-RalphAgent    -Role <roleName>             → @{ Agent; Tier; Skills; Description; Category; ModelId; ModelMultiplier; ModelLabel; ModelEffort }
#   Parse-RalphAgentSpec  -Spec <role[@model]>         → Resolved agent object with optional model override
#   Resolve-RalphProvider -Name <providerName>         → @{ Command; Subcommand; Flags; ModelTemplate; DefaultModel; ... }
#   Resolve-RalphProviderModel -ModelId -Provider      → provider-specific model string
#   Build-RalphCommand    -ModelId -Agent -Prompt [-Yolo] [-Provider] → string[] argument array
#   Get-RalphModelNames                                → string[] of all valid model names
#   Get-RalphAgentRoles                                → string[] of all valid agent roles
#   Get-RalphDevAgentRoles                             → string[] of dev-category agent roles
#   Get-RalphReviewAgentRoles                          → string[] of review-category agent roles
#   Get-RalphDefaultDevAgent                           → string — the default dev agent role name
#   Get-RalphProviderNames                             → string[] of all valid provider names
#   Get-RalphDefaultProvider                           → string — the default provider name
#   Get-RalphDefaultModelTier                          → string — the global default tier name from models.json

# --- Load config (eager — fail fast on bad JSON or missing files) ---

$script:_RalphConfigDir = (Resolve-Path (Join-Path $PSScriptRoot '..' 'config')).Path

$_modelsFile = Join-Path $script:_RalphConfigDir 'models.json'
$_agentsFile = Join-Path $script:_RalphConfigDir 'agents.json'
$_providersFile = Join-Path $script:_RalphConfigDir 'providers.json'
if (-not (Test-Path $_modelsFile)) { throw "models.json not found at $_modelsFile" }
if (-not (Test-Path $_agentsFile)) { throw "agents.json not found at $_agentsFile" }
if (-not (Test-Path $_providersFile)) { throw "providers.json not found at $_providersFile" }

$script:_RalphModels = Get-Content $_modelsFile -Raw | ConvertFrom-Json
$script:_RalphAgents = Get-Content $_agentsFile -Raw | ConvertFrom-Json
$script:_RalphProviders = Get-Content $_providersFile -Raw | ConvertFrom-Json

# --- Validate config on load ---

& {
    $m = $script:_RalphModels
    $a = $script:_RalphAgents
    $errors = @()

    # Alias targets must exist in models
    foreach ($prop in $m.aliases.PSObject.Properties) {
        if (-not $m.models.PSObject.Properties[$prop.Value]) {
            $errors += "Alias '$($prop.Name)' targets non-existent model '$($prop.Value)'"
        }
    }

    # Tier models must exist in models
    foreach ($prop in $m.tiers.PSObject.Properties) {
        if (-not $m.models.PSObject.Properties[$prop.Value.model]) {
            $errors += "Tier '$($prop.Name)' targets non-existent model '$($prop.Value.model)'"
        }
    }

    # Default tier must exist
    if ($m.default -and -not $m.tiers.PSObject.Properties[$m.default]) {
        $errors += "Default tier '$($m.default)' not found in tiers"
    }

    # No namespace collisions between aliases, tiers, and model keys
    $seen = @{}
    foreach ($prop in $m.aliases.PSObject.Properties) {
        $seen[$prop.Name] = 'aliases'
    }
    foreach ($prop in $m.tiers.PSObject.Properties) {
        if ($seen.ContainsKey($prop.Name)) {
            $errors += "Name '$($prop.Name)' appears in both '$($seen[$prop.Name])' and 'tiers'"
        }
        $seen[$prop.Name] = 'tiers'
    }
    foreach ($prop in $m.models.PSObject.Properties) {
        if ($seen.ContainsKey($prop.Name)) {
            $errors += "Name '$($prop.Name)' appears in both '$($seen[$prop.Name])' and 'models'"
        }
    }

    # Agent tiers must resolve and categories must be valid
    $validCategories = @('dev', 'review')
    foreach ($prop in $a.roles.PSObject.Properties) {
        $tier = $prop.Value.tier
        if (-not $m.tiers.PSObject.Properties[$tier]) {
            $errors += "Agent role '$($prop.Name)' references non-existent tier '$tier'"
        }
        $cat = $prop.Value.category
        if (-not $cat -or $cat -notin $validCategories) {
            $errors += "Agent role '$($prop.Name)' has invalid or missing category '$cat' (valid: $($validCategories -join ', '))"
        }
    }

    # Default dev agent must reference a valid dev role
    $defaultDev = $a.defaults.devAgent
    if (-not $defaultDev) {
        $errors += "agents.json missing defaults.devAgent"
    }
    elseif (-not $a.roles.PSObject.Properties[$defaultDev]) {
        $errors += "defaults.devAgent '$defaultDev' is not a valid role"
    }
    elseif ($a.roles.$defaultDev.category -ne 'dev') {
        $errors += "defaults.devAgent '$defaultDev' must be a 'dev' category role"
    }

    # Provider validation
    $p = $script:_RalphProviders
    $providerNames = @($p.providers.PSObject.Properties.Name)
    if ($p.default -and $p.default -notin $providerNames) {
        $errors += "Default provider '$($p.default)' not found in providers"
    }
    $allModelNames = @($m.aliases.PSObject.Properties.Name) + @($m.tiers.PSObject.Properties.Name) + @($m.models.PSObject.Properties.Name)
    foreach ($prov in $providerNames) {
        $pc = $p.providers.$prov
        if (-not $pc.command) { $errors += "Provider '$prov' missing 'command'" }
        if (-not $pc.modelTemplate) { $errors += "Provider '$prov' missing 'modelTemplate'" }
        if ($pc.defaultModel) {
            $dm = [string]$pc.defaultModel
            if ($dm -notin $allModelNames) {
                $errors += "Provider '$prov' defaultModel '$dm' is not a valid model, alias, or tier"
            }
        }
    }

    # Agent roles must have agent mappings for each provider
    foreach ($prop in $a.roles.PSObject.Properties) {
        $agentField = $prop.Value.agent
        if ($agentField -is [string]) {
            # Legacy string format — accept but warn-free (copilot-only)
        }
        elseif ($agentField.PSObject -and $agentField.PSObject.Properties) {
            foreach ($prov in $providerNames) {
                if (-not $agentField.PSObject.Properties[$prov]) {
                    $errors += "Agent role '$($prop.Name)' missing agent mapping for provider '$prov'"
                }
            }
        }
        else {
            $errors += "Agent role '$($prop.Name)' has invalid 'agent' field (must be string or provider map)"
        }
    }

    if ($errors.Count -gt 0) {
        throw "Ralph config validation failed:`n  - $($errors -join "`n  - ")"
    }
}

# --- Public functions ---

function Resolve-RalphModel {
    param([Parameter(Mandatory)][string]$Name)

    $m = $script:_RalphModels
    $modelKey = $null

    # Resolution order: alias → tier ��� direct model key
    if ($m.aliases.PSObject.Properties[$Name]) {
        $modelKey = $m.aliases.$Name
    }
    elseif ($m.tiers.PSObject.Properties[$Name]) {
        $modelKey = $m.tiers.$Name.model
    }
    elseif ($m.models.PSObject.Properties[$Name]) {
        $modelKey = $Name
    }
    else {
        throw "Unknown model name '$Name'. Valid: $((Get-RalphModelNames) -join ', ')"
    }

    $model = $m.models.$modelKey
    $mult = [double]$model.costMultiplier
    $multStr = if ($mult -eq [math]::Floor($mult)) { [string][int]$mult } else { [string]$mult }

    @{
        Id         = [string]$modelKey
        Multiplier = $mult
        Label      = "${multStr}x $($model.label)"
        Effort     = [string]$model.reasoningEffort
    }
}

function Resolve-RalphEffectiveModel {
    param(
        [string]$RequestedModel,
        [string]$Provider
    )

    $modelName = if ($RequestedModel -and $RequestedModel.Trim()) {
        $RequestedModel.Trim()
    } else {
        $providerName = if ($Provider) { $Provider } else { Get-RalphDefaultProvider }
        $prov = Resolve-RalphProvider -Name $providerName
        if ($prov.DefaultModel) { $prov.DefaultModel }
        else { Get-RalphDefaultModelTier }
    }

    Resolve-RalphModel -Name $modelName
}

function Resolve-RalphAgent {
    param(
        [Parameter(Mandatory)][string]$Role,
        [string]$ModelOverride,
        [string]$Provider
    )

    $a = $script:_RalphAgents
    if (-not $a.roles.PSObject.Properties[$Role]) {
        $validRoles = @($a.roles.PSObject.Properties.Name) -join ', '
        throw "Unknown agent role '$Role'. Valid: $validRoles"
    }

    $providerName = if ($Provider) { $Provider } else { Get-RalphDefaultProvider }

    $roleConfig = $a.roles.$Role
    $model = if ($ModelOverride) {
        Resolve-RalphModel -Name $ModelOverride
    } else {
        # Use provider's defaultModel when set, otherwise fall back to role tier
        $prov = Resolve-RalphProvider -Name $providerName
        $modelName = if ($prov.DefaultModel) { $prov.DefaultModel } else { $roleConfig.tier }
        Resolve-RalphModel -Name $modelName
    }

    # Resolve provider-specific agent name
    $agentField = $roleConfig.agent
    $agentName = if ($agentField -is [string]) {
        # Legacy string format — only valid for copilot
        if ($providerName -ne 'copilot') {
            throw "Agent role '$Role' has no mapping for provider '$providerName' (legacy string format)"
        }
        $agentField
    } else {
        if (-not $agentField.PSObject.Properties[$providerName]) {
            throw "Agent role '$Role' has no mapping for provider '$providerName'"
        }
        [string]$agentField.$providerName
    }

    @{
        Agent           = $agentName
        Description     = [string]$roleConfig.description
        Category        = [string]$roleConfig.category
        Tier            = [string]$roleConfig.tier
        Skills          = @($roleConfig.skills)
        ModelId         = $model.Id
        ModelMultiplier = $model.Multiplier
        ModelLabel      = $model.Label
        ModelEffort     = $model.Effort
    }
}

function Parse-RalphAgentSpec {
    param(
        [Parameter(Mandatory)][string]$Spec,
        [string]$Provider
    )

    $parts = $Spec -split '@', 2
    $role = $parts[0]
    $providerOverride = $null
    $modelOverride = $null

    if ($parts.Count -gt 1) {
        $overridePart = $parts[1]
        # Check for provider:model syntax (split on first ':' only)
        if ($overridePart -match '^([^:]+):(.+)$') {
            $candidateProvider = $Matches[1]
            $validProviders = Get-RalphProviderNames
            if ($candidateProvider -in $validProviders) {
                $providerOverride = $candidateProvider
                $modelOverride = $Matches[2]
            } else {
                throw "Unknown provider '$candidateProvider' in agent spec '$Spec'. Valid: $($validProviders -join ', ')"
            }
        } else {
            $modelOverride = $overridePart
        }
    }

    $effectiveProvider = if ($providerOverride) { $providerOverride } elseif ($Provider) { $Provider } else { $null }
    $resolveArgs = @{ Role = $role }
    if ($modelOverride) { $resolveArgs['ModelOverride'] = $modelOverride }
    if ($effectiveProvider) { $resolveArgs['Provider'] = $effectiveProvider }
    $resolved = Resolve-RalphAgent @resolveArgs

    @{
        OriginalSpec      = $Spec
        Role              = $role
        ProviderOverride  = $providerOverride
        ModelOverride     = $modelOverride
        Agent             = $resolved.Agent
        Description       = $resolved.Description
        Category          = $resolved.Category
        Tier              = $resolved.Tier
        Skills            = $resolved.Skills
        ModelId           = $resolved.ModelId
        ModelMultiplier   = $resolved.ModelMultiplier
        ModelLabel        = $resolved.ModelLabel
        ModelEffort       = $resolved.ModelEffort
    }
}

function Get-RalphModelNames {
    $m = $script:_RalphModels
    $names = @()
    $names += @($m.aliases.PSObject.Properties.Name)
    $names += @($m.tiers.PSObject.Properties.Name)
    $names += @($m.models.PSObject.Properties.Name)
    $names | Sort-Object
}

function Get-RalphDefaultModelTier {
    [string]$script:_RalphModels.default
}

function Get-RalphAgentRoles {
    @($script:_RalphAgents.roles.PSObject.Properties.Name) | Sort-Object
}

function Get-RalphDevAgentRoles {
    @($script:_RalphAgents.roles.PSObject.Properties | Where-Object { $_.Value.category -eq 'dev' } | ForEach-Object { $_.Name }) | Sort-Object
}

function Get-RalphReviewAgentRoles {
    @($script:_RalphAgents.roles.PSObject.Properties | Where-Object { $_.Value.category -eq 'review' } | ForEach-Object { $_.Name }) | Sort-Object
}

function Get-RalphDefaultDevAgent {
    [string]$script:_RalphAgents.defaults.devAgent
}

# --- Provider functions ---

function Get-RalphProviderNames {
    @($script:_RalphProviders.providers.PSObject.Properties.Name) | Sort-Object
}

function Get-RalphDefaultProvider {
    [string]$script:_RalphProviders.default
}

function Resolve-RalphProvider {
    param([Parameter(Mandatory)][string]$Name)

    $p = $script:_RalphProviders
    if (-not $p.providers.PSObject.Properties[$Name]) {
        throw "Unknown provider '$Name'. Valid: $((Get-RalphProviderNames) -join ', ')"
    }
    $pc = $p.providers.$Name
    @{
        Name                    = $Name
        Command                 = [string]$pc.command
        Subcommand              = if ($pc.subcommand) { [string]$pc.subcommand } else { $null }
        Description             = [string]$pc.description
        PromptStyle             = [string]$pc.promptStyle
        DefaultModel            = if ($pc.defaultModel) { [string]$pc.defaultModel } else { $null }
        Flags                   = $pc.flags
        ModelTemplate           = [string]$pc.modelTemplate
        SupportsNativePrReview  = [bool]$pc.supportsNativePrReview
        NativePrReviewerLogin   = if ($pc.nativePrReviewerLogin) { [string]$pc.nativePrReviewerLogin } else { $null }
        Byok                    = if ($pc.byok) { $pc.byok } else { $null }
    }
}

function Resolve-RalphProviderModel {
    param(
        [Parameter(Mandatory)][string]$ModelId,
        [string]$Provider
    )

    $providerName = if ($Provider) { $Provider } else { Get-RalphDefaultProvider }
    $prov = Resolve-RalphProvider -Name $providerName

    # Build model string from template: {modelId} and {provider} are placeholders
    $modelConfig = $script:_RalphModels.models.$ModelId
    $providerField = if ($modelConfig.provider) { [string]$modelConfig.provider } else { 'unknown' }

    $result = $prov.ModelTemplate -replace '\{modelId\}', $ModelId -replace '\{provider\}', $providerField
    $result
}

function Build-RalphCommand {
    param(
        [Parameter(Mandatory)][string]$ModelId,
        [Parameter(Mandatory)][string]$Agent,
        [Parameter(Mandatory)][string]$Prompt,
        [switch]$Yolo,
        [switch]$Continue,
        [string]$Provider
    )

    $providerName = if ($Provider) { $Provider } else { Get-RalphDefaultProvider }
    $prov = Resolve-RalphProvider -Name $providerName
    $providerModelId = Resolve-RalphProviderModel -ModelId $ModelId -Provider $providerName

    $cmdParts = @()
    $cmdParts += $prov.Command
    if ($prov.Subcommand) { $cmdParts += $prov.Subcommand }

    if ($Continue -and $prov.Flags.continue) {
        $cmdParts += $prov.Flags.continue
    }
    if ($Yolo -and $prov.Flags.yolo) {
        $cmdParts += $prov.Flags.yolo
    }
    $cmdParts += $prov.Flags.model
    $cmdParts += $providerModelId
    if ($prov.Flags.agent) {
        $cmdParts += $prov.Flags.agent
        $cmdParts += $Agent
    }
    if ($prov.Flags.autopilot) {
        $cmdParts += $prov.Flags.autopilot
    }

    # Prompt: flag-based or positional
    if ($prov.PromptStyle -eq 'flag' -and $prov.Flags.prompt) {
        $cmdParts += $prov.Flags.prompt
        $cmdParts += $Prompt
    } else {
        # Positional — prompt goes last
        $cmdParts += $Prompt
    }

    $cmdParts
}

# --- BYOK environment management ---

function Set-RalphProviderEnv {
    param([Parameter(Mandatory)][string]$ProviderName)

    # Always save current state first so callers can restore cleanly
    $saved = @{
        COPILOT_PROVIDER_BASE_URL = $env:COPILOT_PROVIDER_BASE_URL
        COPILOT_PROVIDER_API_KEY  = $env:COPILOT_PROVIDER_API_KEY
        COPILOT_PROVIDER_TYPE     = $env:COPILOT_PROVIDER_TYPE
    }

    $prov = Resolve-RalphProvider -Name $ProviderName
    if (-not $prov.Byok) {
        # Non-BYOK provider: clear any existing BYOK vars
        $env:COPILOT_PROVIDER_BASE_URL = $null
        $env:COPILOT_PROVIDER_API_KEY  = $null
        $env:COPILOT_PROVIDER_TYPE     = $null
        return $saved
    }

    $byok = $prov.Byok

    # Resolve API key: env var or auth file
    $apiKey = $null
    if ($byok.authEnvVar) {
        $apiKey = [Environment]::GetEnvironmentVariable([string]$byok.authEnvVar)
        if (-not $apiKey) {
            throw "BYOK env var '$($byok.authEnvVar)' is not set"
        }
    }
    elseif ($byok.authFile) {
        $authPath = [string]$byok.authFile -replace '^~', $HOME
        if (-not (Test-Path $authPath)) {
            throw "BYOK auth file not found: $authPath"
        }
        $auth = Get-Content $authPath -Raw | ConvertFrom-Json
        $authEntry = $auth.([string]$byok.authKey)
        if (-not $authEntry -or -not $authEntry.key) {
            throw "BYOK auth key '$($byok.authKey)' not found in $authPath"
        }
        $apiKey = [string]$authEntry.key
    }
    else {
        throw "BYOK config for '$ProviderName' has neither authEnvVar nor authFile"
    }

    $env:COPILOT_PROVIDER_BASE_URL = [string]$byok.baseUrl
    $env:COPILOT_PROVIDER_API_KEY  = $apiKey
    $env:COPILOT_PROVIDER_TYPE     = [string]$byok.providerType
    $saved
}

function Restore-RalphProviderEnv {
    param([Parameter(Mandatory)][hashtable]$Saved)

    $env:COPILOT_PROVIDER_BASE_URL = $Saved.COPILOT_PROVIDER_BASE_URL
    $env:COPILOT_PROVIDER_API_KEY  = $Saved.COPILOT_PROVIDER_API_KEY
    $env:COPILOT_PROVIDER_TYPE     = $Saved.COPILOT_PROVIDER_TYPE
}
