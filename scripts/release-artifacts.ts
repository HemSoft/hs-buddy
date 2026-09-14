import { createHash } from 'node:crypto'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const schemaVersion = 1
const numericIdentifierPattern = /^(0|[1-9][0-9]*)$/
const identifierPattern = /^[0-9A-Za-z-]+$/

const releaseTargets = [
  { platform: 'win32', arch: 'x64', extension: '.exe', signing: 'authenticode' },
  { platform: 'linux', arch: 'x64', extension: '.deb', signing: 'not-applicable' },
  { platform: 'darwin', arch: 'x64', extension: '.dmg', signing: 'apple-notarized' },
  { platform: 'darwin', arch: 'arm64', extension: '.dmg', signing: 'apple-notarized' },
] as const

type ReleaseTarget = (typeof releaseTargets)[number]
type Platform = ReleaseTarget['platform']
type Architecture = ReleaseTarget['arch']
type SigningResult = ReleaseTarget['signing']

export interface ReleaseArtifactMetadata {
  schemaVersion: number
  platform: Platform
  arch: Architecture
  fileName: string
  sha256: string
  size: number
  sourceRevision: string
  ciRunId: string
  signing: SigningResult
}

interface PrepareOptions {
  file: string
  output: string
  platform: string
  arch: string
  sourceRevision: string
  ciRunId: string
  signing: string
}

interface ValidationOptions {
  input: string
  sourceRevision: string
  ciRunId: string
  version: string
}

interface AssembleOptions extends ValidationOptions {
  output: string
}

function fail(message: string): never {
  throw new Error(message)
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function targetFor(platform: string, arch: string): ReleaseTarget {
  return (
    releaseTargets.find(target => target.platform === platform && target.arch === arch) ??
    fail(`Unsupported release target: ${platform}/${arch}`)
  )
}

function assertSha(value: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) fail(`Invalid source revision: ${value}`)
}

function assertRunId(value: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) fail(`Invalid CI run ID: ${value}`)
}

function hasValidIdentifiers(value: string, rejectNumericLeadingZeros: boolean): boolean {
  return value.split('.').every(identifier => {
    if (!identifierPattern.test(identifier)) return false
    return !(
      rejectNumericLeadingZeros &&
      /^[0-9]+$/.test(identifier) &&
      !numericIdentifierPattern.test(identifier)
    )
  })
}

function isValidSemver(value: string): boolean {
  const buildParts = value.split('+')
  if (buildParts.length > 2) return false
  const [versionAndPrerelease, build] = buildParts
  if (build !== undefined && !hasValidIdentifiers(build, false)) return false

  const prereleaseSeparator = versionAndPrerelease.indexOf('-')
  const core =
    prereleaseSeparator === -1
      ? versionAndPrerelease
      : versionAndPrerelease.slice(0, prereleaseSeparator)
  const prerelease =
    prereleaseSeparator === -1 ? undefined : versionAndPrerelease.slice(prereleaseSeparator + 1)
  if (prerelease !== undefined && !hasValidIdentifiers(prerelease, true)) return false

  const coreIdentifiers = core.split('.')
  return (
    coreIdentifiers.length === 3 &&
    coreIdentifiers.every(identifier => numericIdentifierPattern.test(identifier))
  )
}

function assertPackageName(fileName: string, version: string, target: ReleaseTarget): void {
  if (basename(fileName) !== fileName || fileName.includes('..')) {
    fail(`Unsafe package filename: ${fileName}`)
  }
  const expected =
    target.platform === 'win32'
      ? `Buddy-${version}-Setup${target.extension}`
      : `Buddy-${version}-${target.arch}${target.extension}`
  if (fileName !== expected || extname(fileName) !== target.extension) {
    fail(`Unexpected package filename for ${target.platform}/${target.arch}: ${fileName}`)
  }
}

function normalizeMetadata(parsed: unknown, source: string): ReleaseArtifactMetadata {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`Invalid release metadata: ${source}`)
  }
  const record = parsed as Record<string, unknown>
  const metadata: ReleaseArtifactMetadata = {
    schemaVersion: Number(record.schemaVersion),
    platform: String(record.platform) as Platform,
    arch: String(record.arch) as Architecture,
    fileName: String(record.fileName),
    sha256: String(record.sha256),
    size: Number(record.size),
    sourceRevision: String(record.sourceRevision),
    ciRunId: String(record.ciRunId),
    signing: String(record.signing) as SigningResult,
  }
  if (metadata.schemaVersion !== schemaVersion) fail(`Unsupported metadata schema: ${source}`)
  if (!/^[0-9a-f]{64}$/.test(metadata.sha256)) fail(`Invalid artifact digest: ${source}`)
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0) {
    fail(`Invalid artifact size: ${source}`)
  }
  return metadata
}

function parseMetadata(path: string): ReleaseArtifactMetadata {
  return normalizeMetadata(JSON.parse(readFileSync(path, 'utf8')), path)
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) fail(`Release input cannot contain symlinks: ${path}`)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

export function prepareReleaseArtifact(options: PrepareOptions): ReleaseArtifactMetadata {
  assertSha(options.sourceRevision)
  assertRunId(options.ciRunId)
  const target = targetFor(options.platform, options.arch)
  if (options.signing !== target.signing) {
    fail(`Signing proof mismatch for ${target.platform}/${target.arch}`)
  }

  const source = resolve(options.file)
  if (lstatSync(source).isSymbolicLink() || !statSync(source).isFile()) {
    fail(`Release package must be a regular file: ${source}`)
  }
  const fileName = basename(source)
  const versionMatch = /^Buddy-(.+?)-(?:Setup|x64|arm64)\.(?:exe|deb|dmg)$/.exec(fileName)
  if (!versionMatch) fail(`Unexpected package filename: ${fileName}`)
  assertPackageName(fileName, versionMatch[1], target)

  const output = resolve(options.output)
  mkdirSync(output, { recursive: true })
  const destination = join(output, fileName)
  copyFileSync(source, destination)
  const metadata: ReleaseArtifactMetadata = {
    schemaVersion,
    platform: target.platform,
    arch: target.arch,
    fileName,
    sha256: sha256(destination),
    size: statSync(destination).size,
    sourceRevision: options.sourceRevision,
    ciRunId: options.ciRunId,
    signing: target.signing,
  }
  writeFileSync(
    join(output, `${target.platform}-${target.arch}.metadata.json`),
    `${JSON.stringify(metadata, null, 2)}\n`
  )
  return metadata
}

function validateMetadataArtifact(
  item: ReleaseArtifactMetadata,
  files: string[],
  options: ValidationOptions,
  seenTargets: Set<string>,
  seenNames: Set<string>
): string {
  const target = targetFor(item.platform, item.arch)
  const key = `${item.platform}/${item.arch}`
  if (seenTargets.has(key)) fail(`Duplicate release target: ${key}`)
  if (seenNames.has(item.fileName)) fail(`Duplicate package filename: ${item.fileName}`)
  if (item.signing !== target.signing) fail(`Signing proof mismatch for ${key}`)
  if (item.sourceRevision !== options.sourceRevision) fail(`Stale source revision for ${key}`)
  if (item.ciRunId !== options.ciRunId) fail(`Stale CI run ID for ${key}`)
  assertPackageName(item.fileName, options.version, target)

  const matches = files.filter(path => basename(path) === item.fileName)
  if (matches.length !== 1)
    fail(`Expected one package named ${item.fileName}, found ${matches.length}`)
  const packagePath = matches[0]
  if (sha256(packagePath) !== item.sha256 || statSync(packagePath).size !== item.size) {
    fail(`Package integrity mismatch: ${item.fileName}`)
  }
  seenTargets.add(key)
  seenNames.add(item.fileName)
  return packagePath
}

function collectPackagePaths(
  metadata: ReleaseArtifactMetadata[],
  files: string[],
  options: ValidationOptions
): Set<string> {
  const seenTargets = new Set<string>()
  const seenNames = new Set<string>()
  const packagePaths = new Set(
    metadata.map(item => validateMetadataArtifact(item, files, options, seenTargets, seenNames))
  )
  const expectedTargets = new Set(releaseTargets.map(target => `${target.platform}/${target.arch}`))
  if (
    seenTargets.size !== expectedTargets.size ||
    [...expectedTargets].some(key => !seenTargets.has(key))
  ) {
    fail('Release target set is incomplete')
  }
  return packagePaths
}

function rejectUnexpectedFiles(
  files: string[],
  metadataPaths: string[],
  packagePaths: Set<string>
): void {
  const allowedFiles = new Set([...metadataPaths, ...packagePaths])
  const unexpected = files.filter(path => !allowedFiles.has(path))
  if (unexpected.length > 0) {
    fail(`Unexpected release input: ${unexpected.map(path => basename(path)).join(', ')}`)
  }
}

function assertValidationOptions(options: ValidationOptions): void {
  assertSha(options.sourceRevision)
  assertRunId(options.ciRunId)
  if (!isValidSemver(options.version)) fail(`Invalid release version: ${options.version}`)
}

export function assembleReleaseArtifacts(options: AssembleOptions): ReleaseArtifactMetadata[] {
  assertValidationOptions(options)

  const input = resolve(options.input)
  const files = listFiles(input)
  const metadataPaths = files.filter(path => path.endsWith('.metadata.json'))
  if (metadataPaths.length !== releaseTargets.length) {
    fail(`Expected ${releaseTargets.length} metadata files, found ${metadataPaths.length}`)
  }

  const metadata = metadataPaths.map(parseMetadata)
  const packagePaths = collectPackagePaths(metadata, files, options)
  rejectUnexpectedFiles(files, metadataPaths, packagePaths)

  const output = resolve(options.output)
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const ordered = [...metadata].sort((left, right) => left.fileName.localeCompare(right.fileName))
  for (const item of ordered) {
    const source = [...packagePaths].find(path => basename(path) === item.fileName)!
    copyFileSync(source, join(output, item.fileName))
  }
  writeFileSync(
    join(output, 'SHA256SUMS'),
    ordered.map(item => `${item.sha256}  ${item.fileName}`).join('\n') + '\n'
  )
  writeFileSync(
    join(output, 'release-provenance.json'),
    `${JSON.stringify(
      {
        schemaVersion,
        sourceRevision: options.sourceRevision,
        ciRunId: options.ciRunId,
        version: options.version,
        artifacts: ordered,
      },
      null,
      2
    )}\n`
  )
  return ordered
}

function readProvenance(
  provenancePath: string,
  options: ValidationOptions
): ReleaseArtifactMetadata[] {
  const parsed: unknown = JSON.parse(readFileSync(provenancePath, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`Invalid release provenance: ${provenancePath}`)
  }
  const provenance = parsed as Record<string, unknown>
  if (
    Number(provenance.schemaVersion) !== schemaVersion ||
    String(provenance.sourceRevision) !== options.sourceRevision ||
    String(provenance.ciRunId) !== options.ciRunId ||
    String(provenance.version) !== options.version ||
    !Array.isArray(provenance.artifacts)
  ) {
    fail(`Release provenance does not match the qualified build: ${provenancePath}`)
  }
  return provenance.artifacts.map((item, index) =>
    normalizeMetadata(item, `${provenancePath}#artifacts[${index}]`)
  )
}

export function verifyPublishedReleaseArtifacts(
  options: ValidationOptions
): ReleaseArtifactMetadata[] {
  assertValidationOptions(options)
  const input = resolve(options.input)
  const files = listFiles(input)
  const provenancePath = join(input, 'release-provenance.json')
  const checksumPath = join(input, 'SHA256SUMS')
  const metadata = readProvenance(provenancePath, options)
  if (metadata.length !== releaseTargets.length) {
    fail(`Expected ${releaseTargets.length} provenance artifacts, found ${metadata.length}`)
  }
  const packagePaths = collectPackagePaths(metadata, files, options)
  rejectUnexpectedFiles(files, [provenancePath, checksumPath], packagePaths)
  const ordered = [...metadata].sort((left, right) => left.fileName.localeCompare(right.fileName))
  const expectedChecksums =
    ordered.map(item => `${item.sha256}  ${item.fileName}`).join('\n') + '\n'
  if (readFileSync(checksumPath, 'utf8') !== expectedChecksums) {
    fail(`Checksum manifest does not match release provenance: ${checksumPath}`)
  }
  return ordered
}

function parseArguments(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || value === undefined)
      fail(`Invalid argument list near ${key ?? 'end'}`)
    parsed[key.slice(2)] = value
  }
  return parsed
}

function required(arguments_: Record<string, string>, key: string): string {
  return arguments_[key] ?? fail(`Missing --${key}`)
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArguments(rest)
  if (command === 'prepare') {
    prepareReleaseArtifact({
      file: required(args, 'file'),
      output: required(args, 'output'),
      platform: required(args, 'platform'),
      arch: required(args, 'arch'),
      sourceRevision: required(args, 'source-revision'),
      ciRunId: required(args, 'ci-run-id'),
      signing: required(args, 'signing'),
    })
    return
  }
  if (command === 'assemble') {
    assembleReleaseArtifacts({
      input: required(args, 'input'),
      output: required(args, 'output'),
      sourceRevision: required(args, 'source-revision'),
      ciRunId: required(args, 'ci-run-id'),
      version: required(args, 'version'),
    })
    return
  }
  if (command === 'verify') {
    verifyPublishedReleaseArtifacts({
      input: required(args, 'input'),
      sourceRevision: required(args, 'source-revision'),
      ciRunId: required(args, 'ci-run-id'),
      version: required(args, 'version'),
    })
    return
  }
  fail('Usage: release-artifacts.ts <prepare|assemble|verify> [options]')
}

if (import.meta.main) main()
