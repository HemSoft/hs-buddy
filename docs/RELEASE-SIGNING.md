# Release signing and publication

The `Release` workflow runs only after `ci-complete` succeeds for a push to
`main`. It builds four packages from that exact commit in parallel, verifies
each installed application, assembles a checksum and provenance manifest, and
keeps the GitHub release private as a draft until every uploaded asset matches
the local package byte for byte.

## Signing policy

| Target                  | Required proof before upload                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Windows x64 NSIS        | `Get-AuthenticodeSignature` reports `Valid` for the installer                                           |
| macOS Intel DMG         | The app passes strict `codesign` and Gatekeeper checks, and `stapler` validates the notarization ticket |
| macOS Apple-silicon DMG | The app passes strict `codesign` and Gatekeeper checks, and `stapler` validates the notarization ticket |
| Ubuntu x64 DEB          | Package installation and startup pass; the release checksum manifest protects the download              |

The workflow sets Electron Builder's `forceCodeSigning` option for Windows and
macOS and enables its macOS notarization support. See the
[Electron Builder signing guide](https://www.electron.build/code-signing.html)
and [Apple notarization workflow](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Verify a download

Download `SHA256SUMS` and the installer for your platform into the same folder,
then run the matching command before opening the installer.

### Windows PowerShell

```powershell
$installers = @(Get-ChildItem .\Buddy-*-Setup.exe)
if ($installers.Count -ne 1) { throw 'Keep exactly one Buddy installer in this folder' }
$installer = $installers[0]
$expected = (Select-String .\SHA256SUMS -Pattern ([regex]::Escape($installer.Name) + '$')).Line.Split()[0]
(Get-FileHash $installer -Algorithm SHA256).Hash -eq $expected
```

The command must return `True`.

### Ubuntu

```bash
grep -E '  Buddy-[^ ]+-x64\.deb$' SHA256SUMS | sha256sum --check
```

### macOS

```bash
arch=$(sysctl -n hw.optional.arm64 2>/dev/null | grep -q '^1$' && echo arm64 || echo x64)
grep -E "  Buddy-[^ ]+-$arch\\.dmg$" SHA256SUMS | shasum -a 256 --check
```

Linux and macOS print `OK` for an unchanged package. A missing checksum entry or
any other result is a verification failure; do not open the installer.

To verify the macOS code signature and stapled notarization ticket without
assuming a volume name, mount the DMG at an explicit temporary path:

```bash
set -- Buddy-*.dmg
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo 'Keep exactly one Buddy DMG in this folder' >&2
  exit 1
fi
mount=$(mktemp -d)
hdiutil attach "$1" -nobrowse -readonly -mountpoint "$mount"
codesign --verify --deep --strict --verbose=2 "$mount/Buddy.app"
spctl --assess --type execute --verbose=2 "$mount/Buddy.app"
hdiutil detach "$mount"
xcrun stapler validate "$1"
```

## Protected credentials

A maintainer must create a `release-signing` GitHub environment, restrict it to
`main`, and add a required reviewer before enabling publication. Follow
[GitHub's environment security guide](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
for the environment and these environment secrets:

| Secret                        | Content                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `WINDOWS_CSC_LINK`            | Base64-encoded or private download URL for the Windows PFX certificate              |
| `WINDOWS_CSC_KEY_PASSWORD`    | Password for the Windows certificate                                                |
| `MACOS_CSC_LINK`              | Base64-encoded or private download URL for the Developer ID Application certificate |
| `MACOS_CSC_KEY_PASSWORD`      | Password for the macOS certificate                                                  |
| `APPLE_ID`                    | Apple developer account used for notarization                                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for the Apple account                                         |
| `APPLE_TEAM_ID`               | Apple Developer team identifier                                                     |

Do not add these values as repository secrets. The package jobs are the only
jobs attached to `release-signing`; dependency lifecycle scripts are disabled
there, and the publishing job receives only its short-lived `GITHUB_TOKEN`.
Missing credentials fail before packaging and leave no public release.

## Rotation and recovery

`HemSoft` owns certificate and password rotation.

1. Replace one environment secret at a time and keep the prior certificate
   available until a release made with the replacement passes verification.
2. Revoke a compromised certificate with its issuing authority, replace the
   matching environment secrets, and inspect releases created since the last
   known-good run.
3. Rerun the failed `Release` workflow. Its ownership marker permits cleanup of
   only the draft and annotated tag created by that workflow run. It never moves
   or deletes an unrelated tag.
4. If a release is already public, stop and investigate. The workflow refuses
   to overwrite it.

Never paste certificate material, passwords, or secret values into workflow
inputs, logs, issues, or pull requests.

## Publication evidence

Each release contains four installers, `SHA256SUMS`, and
`release-provenance.json`. The provenance file records the source commit, CI run
ID, target, package size, digest, and signing proof. The workflow downloads each
draft asset again, compares it with the verified local file, and runs
`sha256sum --check SHA256SUMS` before publication.

The package matrix allows 40 minutes per target and runs all targets in
parallel. Its upper bound is 160 hosted runner-minutes plus the short
qualification and publication jobs. Record the first successful run's actual
wall time and billed runner time in the pull request that provisions the
`release-signing` environment.
