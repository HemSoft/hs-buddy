[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseDirectory,

  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory
)

$ErrorActionPreference = 'Stop'

$installer = (Get-ChildItem $ReleaseDirectory -Recurse -File -Filter '*Setup.exe' | Select-Object -First 1).FullName
if (-not $installer) {
  throw 'NSIS installer was not found'
}

& $installer /S "/D=$InstallDirectory"
if ($LASTEXITCODE -ne 0) {
  throw "NSIS exited with $LASTEXITCODE"
}

$executable = (Get-ChildItem $InstallDirectory -Recurse -Filter 'Buddy.exe' | Select-Object -First 1).FullName
if (-not $executable) {
  throw 'Installed Buddy.exe was not found'
}

"BUDDY_PACKAGE_EXECUTABLE=$executable" | Out-File -FilePath $env:GITHUB_ENV -Append
