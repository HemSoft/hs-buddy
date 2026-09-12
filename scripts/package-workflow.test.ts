import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n')
const builderConfig = readFileSync('electron-builder.json5', 'utf8')
const smokeRunner = readFileSync('scripts/package-smoke.ts', 'utf8')
const mainProcess = readFileSync('electron/main.ts', 'utf8')
const runtimeQualification = readFileSync('electron/packageQualification.ts', 'utf8')

const qualifiedTargets = [
  {
    name: 'Windows x64',
    runner: 'windows-2025',
    builderPlatform: 'win',
    target: 'nsis',
    platform: 'win32',
    arch: 'x64',
  },
  {
    name: 'Linux x64',
    runner: 'ubuntu-24.04',
    builderPlatform: 'linux',
    target: 'AppImage',
    platform: 'linux',
    arch: 'x64',
  },
  {
    name: 'macOS Intel',
    runner: 'macos-15-intel',
    builderPlatform: 'mac',
    target: 'dmg',
    platform: 'darwin',
    arch: 'x64',
  },
  {
    name: 'macOS Apple silicon',
    runner: 'macos-15',
    builderPlatform: 'mac',
    target: 'dmg',
    platform: 'darwin',
    arch: 'arm64',
  },
] as const

describe('desktop package qualification workflow', () => {
  it.each(qualifiedTargets)('builds and starts $name packages on a native runner', target => {
    const matrixEntry = [
      `- name: ${target.name}`,
      `runner: ${target.runner}`,
      `builder-platform: ${target.builderPlatform}`,
      `target: ${target.target}`,
      `platform: ${target.platform}`,
      `arch: ${target.arch}`,
    ]

    for (const setting of matrixEntry) expect(workflow).toContain(setting)
    expect(workflow).toContain(
      'bunx electron-builder --${{ matrix.builder-platform }} ${{ matrix.target }} --${{ matrix.arch }} --publish never -c.npmRebuild=false'
    )
    expect(workflow).toContain('bun run package:smoke -- ${{ matrix.platform }} ${{ matrix.arch }}')
  })

  it('qualifies packages before CI can complete', () => {
    expect(workflow).toMatch(/ci-complete:[\s\S]*needs:[\s\S]*package-smoke/)
    expect(workflow).toContain('if-no-files-found: warn')
    expect(workflow).toContain('release/package-smoke*.log')
  })

  it('keeps the advertised builder targets aligned with the matrix', () => {
    for (const value of ['nsis', 'AppImage', 'dmg', 'arm64', 'x64']) {
      expect(builderConfig).toContain(`"${value}"`)
    }
  })

  it('checks the renderer and native dependencies from the packaged runtime', () => {
    expect(mainProcess).toContain('document.getElementById("root")?.childElementCount > 0')
    expect(mainProcess).toContain('qualifyPackageDependencies(')
    for (const dependency of ['node-pty', 'koffi']) {
      expect(runtimeQualification).toContain(`'${dependency}'`)
      expect(smokeRunner).toContain(`'${dependency}'`)
    }
    expect(runtimeQualification).toContain('@github/copilot-${platform}-${arch}')
    expect(smokeRunner).toContain('copilot-${expectedPlatform}-${expectedArch}')
  })
})
