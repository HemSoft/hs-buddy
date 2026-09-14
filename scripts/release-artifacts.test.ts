import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assembleReleaseArtifacts,
  prepareReleaseArtifact,
  verifyPublishedReleaseArtifacts,
} from './release-artifacts'

const revision = 'a'.repeat(40)
const runId = '12345'
const version = '1.2.3'
const testRoots = new Set<string>()

afterEach(() => {
  for (const root of testRoots) rmSync(root, { recursive: true, force: true })
  testRoots.clear()
})

function createInput(artifactVersion = version) {
  const root = mkdtempSync(join(tmpdir(), 'buddy-release-artifacts-'))
  testRoots.add(root)
  const input = join(root, 'input')
  const output = join(root, 'output')
  const targets = [
    [`Buddy-${artifactVersion}-Setup.exe`, 'win32', 'x64', 'authenticode'],
    [`Buddy-${artifactVersion}-x64.deb`, 'linux', 'x64', 'not-applicable'],
    [`Buddy-${artifactVersion}-x64.dmg`, 'darwin', 'x64', 'apple-notarized'],
    [`Buddy-${artifactVersion}-arm64.dmg`, 'darwin', 'arm64', 'apple-notarized'],
  ] as const
  for (const [name, platform, arch, signing] of targets) {
    const source = join(root, name)
    writeFileSync(source, `${platform}/${arch}\n`)
    prepareReleaseArtifact({
      file: source,
      output: input,
      platform,
      arch,
      sourceRevision: revision,
      ciRunId: runId,
      signing,
    })
  }
  return { root, input, output }
}

function createPublishedArtifacts() {
  const paths = createInput()
  assembleReleaseArtifacts({
    input: paths.input,
    output: paths.output,
    sourceRevision: revision,
    ciRunId: runId,
    version,
  })
  return paths
}

describe('release artifact assembly', () => {
  it('assembles the complete signed target set and deterministic checksums', () => {
    const { input, output } = createInput()
    const first = assembleReleaseArtifacts({
      input,
      output,
      sourceRevision: revision,
      ciRunId: runId,
      version,
    })
    const firstChecksums = readFileSync(join(output, 'SHA256SUMS'), 'utf8')
    const second = assembleReleaseArtifacts({
      input,
      output,
      sourceRevision: revision,
      ciRunId: runId,
      version,
    })

    expect(first).toHaveLength(4)
    expect(second).toEqual(first)
    expect(readFileSync(join(output, 'SHA256SUMS'), 'utf8')).toBe(firstChecksums)
    expect(
      verifyPublishedReleaseArtifacts({
        input: output,
        sourceRevision: revision,
        ciRunId: runId,
        version,
      })
    ).toEqual(first)
    expect(firstChecksums.trim().split('\n')).toHaveLength(4)
    for (const item of first) {
      const packageBytes = readFileSync(join(output, item.fileName))
      const digest = createHash('sha256').update(packageBytes).digest('hex')
      expect(firstChecksums).toContain(`${digest}  ${item.fileName}\n`)
    }
    expect(JSON.parse(readFileSync(join(output, 'release-provenance.json'), 'utf8'))).toMatchObject(
      {
        schemaVersion: 1,
        sourceRevision: revision,
        ciRunId: runId,
        version,
      }
    )
  })
})

describe('release artifact validation', () => {
  it('rejects an incomplete target set', () => {
    const { input, output } = createInput()
    rmSync(join(input, 'darwin-arm64.metadata.json'))
    rmSync(join(input, 'Buddy-1.2.3-arm64.dmg'))

    expect(() =>
      assembleReleaseArtifacts({ input, output, sourceRevision: revision, ciRunId: runId, version })
    ).toThrow()
  })

  it('rejects stale source metadata', () => {
    const { input, output } = createInput()
    const path = join(input, 'linux-x64.metadata.json')
    const metadata = JSON.parse(readFileSync(path, 'utf8'))
    metadata.sourceRevision = 'b'.repeat(40)
    writeFileSync(path, JSON.stringify(metadata))

    expect(() =>
      assembleReleaseArtifacts({ input, output, sourceRevision: revision, ciRunId: runId, version })
    ).toThrow('Stale source revision for linux/x64')
  })

  it('rejects missing signing proof', () => {
    const { input, output } = createInput()
    const path = join(input, 'win32-x64.metadata.json')
    const metadata = JSON.parse(readFileSync(path, 'utf8'))
    metadata.signing = 'not-applicable'
    writeFileSync(path, JSON.stringify(metadata))

    expect(() =>
      assembleReleaseArtifacts({ input, output, sourceRevision: revision, ciRunId: runId, version })
    ).toThrow('Signing proof mismatch for win32/x64')
  })

  it('rejects altered package contents', () => {
    const { input, output } = createInput()
    writeFileSync(join(input, 'Buddy-1.2.3-x64.deb'), 'tampered\n')

    expect(() =>
      assembleReleaseArtifacts({ input, output, sourceRevision: revision, ciRunId: runId, version })
    ).toThrow('Package integrity mismatch')
  })

  it('rejects a package named for the wrong architecture', () => {
    const { root } = createInput()
    expect(() =>
      prepareReleaseArtifact({
        file: join(root, 'Buddy-1.2.3-arm64.dmg'),
        output: join(root, 'mismatched'),
        platform: 'darwin',
        arch: 'x64',
        sourceRevision: revision,
        ciRunId: runId,
        signing: 'apple-notarized',
      })
    ).toThrow('Unexpected package filename for darwin/x64')
  })
})

describe('published release validation', () => {
  it('rejects an altered published package', () => {
    const { output } = createPublishedArtifacts()
    writeFileSync(join(output, 'Buddy-1.2.3-x64.deb'), 'tampered\n')

    expect(() =>
      verifyPublishedReleaseArtifacts({
        input: output,
        sourceRevision: revision,
        ciRunId: runId,
        version,
      })
    ).toThrow('Package integrity mismatch')
  })

  it('rejects altered release provenance', () => {
    const { output } = createPublishedArtifacts()
    const path = join(output, 'release-provenance.json')
    const provenance = JSON.parse(readFileSync(path, 'utf8'))
    provenance.sourceRevision = 'b'.repeat(40)
    writeFileSync(path, JSON.stringify(provenance))

    expect(() =>
      verifyPublishedReleaseArtifacts({
        input: output,
        sourceRevision: revision,
        ciRunId: runId,
        version,
      })
    ).toThrow('Release provenance does not match the qualified build')
  })

  it('rejects an altered checksum manifest', () => {
    const { output } = createPublishedArtifacts()
    const path = join(output, 'SHA256SUMS')
    const manifest = readFileSync(path, 'utf8')
    writeFileSync(path, `${manifest[0] === '0' ? '1' : '0'}${manifest.slice(1)}`)

    expect(() =>
      verifyPublishedReleaseArtifacts({
        input: output,
        sourceRevision: revision,
        ciRunId: runId,
        version,
      })
    ).toThrow('Checksum manifest does not match release provenance')
  })
})

describe('release version validation', () => {
  it.each(['1.2.3', '1.2.3-alpha.1', '1.2.3+build.5', '1.2.3-alpha-1+build.5'])(
    'accepts valid SemVer %s',
    validVersion => {
      const { input, output } = createInput(validVersion)
      expect(
        assembleReleaseArtifacts({
          input,
          output,
          sourceRevision: revision,
          ciRunId: runId,
          version: validVersion,
        })
      ).toHaveLength(4)
    }
  )

  it.each(['1.2.3-01', '1.2.3+.', '01.2.3'])('rejects invalid SemVer %s', invalidVersion => {
    const { input, output } = createInput()
    expect(() =>
      assembleReleaseArtifacts({
        input,
        output,
        sourceRevision: revision,
        ciRunId: runId,
        version: invalidVersion,
      })
    ).toThrow(`Invalid release version: ${invalidVersion}`)
  })
})
