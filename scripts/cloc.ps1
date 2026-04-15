<#
.SYNOPSIS
  Count lines of code excluding generated/vendored/build artifacts.
#>

Set-StrictMode -Version Latest

Push-Location (Split-Path $PSScriptRoot)
try {
    cloc . `
        --exclude-dir=node_modules,dist-electron,release,coverage,test-results,.convex,_generated,logs,History `
        --exclude-ext=lock,map
}
finally {
    Pop-Location
}
