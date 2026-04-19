targetScope = 'resourceGroup'

// ──────────────────────────────────────────────────────────────────────────────
// hs-buddy Desktop App Infrastructure
//
// Defines Azure resources for the Electron desktop application:
// - Storage Account: hosts release artifacts and auto-update feeds
// - CDN: global distribution of update binaries
// - Application Insights: crash reporting and usage telemetry
// ──────────────────────────────────────────────────────────────────────────────

@description('Environment abbreviation')
@allowed(['dev', 'stg', 'prd'])
param environment string

@description('Resource location')
param location string = resourceGroup().location

@description('Base name for resources — lowercase alphanumeric only, no hyphens or special chars (used in storage account naming which requires [a-z0-9])')
@minLength(3)
@maxLength(10)
param baseName string = 'hsbuddy'

@description('Tags applied to all resources')
param tags object = {}

// ─── Variables ────────────────────────────────────────────────────────────────

// Normalize baseName: lowercase + strip hyphens and underscores (baseName param is constrained to lowercase alphanumeric via @description and @maxLength)
var normalizedBaseName = toLower(replace(replace(baseName, '-', ''), '_', ''))
var resourceSuffix = '${normalizedBaseName}${environment}'
// Preserve the full uniqueString suffix for global uniqueness and truncate only the non-unique prefix to fit the 24-char storage account limit
var storageAccountUniqueSuffix = uniqueString(resourceGroup().id)
var storageAccountResourceSuffix = take(resourceSuffix, 24 - 2 - length(storageAccountUniqueSuffix))
var storageAccountName = 'st${storageAccountResourceSuffix}${storageAccountUniqueSuffix}'
// CDN endpoint names must be globally unique (maps to <name>.azureedge.net); max 50 chars
var cdnEndpointName = take('ep-${resourceSuffix}-${uniqueString(resourceGroup().id)}', 50)

// ─── Storage Account (release artifacts & auto-update feed) ──────────────────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource releasesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'releases'
  properties: {
    publicAccess: 'Blob'
  }
}

// ─── CDN (global distribution of update binaries) ────────────────────────────

resource cdnProfile 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: 'cdn-${resourceSuffix}'
  #disable-next-line no-hardcoded-location // CDN profiles must use 'global' — not a real location choice
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_Microsoft'
  }
}

resource cdnEndpoint 'Microsoft.Cdn/profiles/endpoints@2024-02-01' = {
  parent: cdnProfile
  name: cdnEndpointName
  #disable-next-line no-hardcoded-location // CDN endpoints must use 'global' — not a real location choice
  location: 'global'
  tags: tags
  properties: {
    originHostHeader: '${storageAccountName}.blob.${az.environment().suffixes.storage}'
    isHttpAllowed: false
    isHttpsAllowed: true
    origins: [
      {
        name: 'blob-origin'
        properties: {
          hostName: '${storageAccountName}.blob.${az.environment().suffixes.storage}'
          httpsPort: 443
        }
      }
    ]
  }
}

// ─── Application Insights (crash reporting & telemetry) ──────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceSuffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceSuffix}'
  location: location
  tags: tags
  kind: 'other'
  properties: {
    Application_Type: 'other'
    WorkspaceResourceId: logAnalytics.id
    RetentionInDays: 30
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

@description('Storage account name for release uploads')
output storageAccountResourceName string = storageAccount.name

@description('CDN endpoint hostname for update downloads')
output cdnEndpointHostname string = cdnEndpoint.properties.hostName

@description('Application Insights resource ID (retrieve keys via RBAC)')
output appInsightsResourceId string = appInsights.id
