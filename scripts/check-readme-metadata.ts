import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const CI_BADGE =
  '[![CI](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml?query=branch%3Amain)'

interface DocumentationSources {
  readme: string
  contributing: string
  vision: string
  schema: string
  featureCount: number
}

interface PackageMetadata {
  engines?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface RequiredVersions {
  electron: string
  react: string
  typescript: string
  vite: string
  convex: string
  copilot: string
  node: string
}

type VersionResult = { versions: RequiredVersions; errors: [] } | { errors: string[] }

function version(
  metadata: PackageMetadata,
  section: 'dependencies' | 'devDependencies',
  dependency: string
): string | undefined {
  return metadata[section]?.[dependency]?.match(/\d+\.\d+\.\d+/)?.[0]
}

function major(value: string | undefined): string | undefined {
  return value?.match(/\d+/)?.[0]
}

function readRequiredVersions(packageJson: string): VersionResult {
  let metadata: PackageMetadata
  try {
    metadata = JSON.parse(packageJson) as PackageMetadata
  } catch (_: unknown) {
    return { errors: ['package.json must contain valid JSON.'] }
  }

  const candidates = {
    electron: version(metadata, 'devDependencies', 'electron'),
    react: version(metadata, 'dependencies', 'react'),
    typescript: version(metadata, 'devDependencies', 'typescript'),
    vite: version(metadata, 'devDependencies', 'vite'),
    convex: version(metadata, 'dependencies', 'convex'),
    copilot: version(metadata, 'dependencies', '@github/copilot-sdk'),
    node: major(metadata.engines?.node),
  }
  const errors = Object.entries(candidates)
    .filter(([, declaredVersion]) => declaredVersion === undefined)
    .map(([dependency]) => `package.json must declare a versioned ${dependency} requirement.`)
  if (errors.length > 0) return { errors }
  return { versions: candidates as RequiredVersions, errors: [] }
}

function requireClaim(errors: string[], source: string, claim: string, message: string): void {
  if (!source.includes(claim)) errors.push(message)
}

function startsWithDefineTable(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false
  if (ts.isIdentifier(node.expression)) return node.expression.text === 'defineTable'
  if (ts.isPropertyAccessExpression(node.expression)) {
    return startsWithDefineTable(node.expression.expression)
  }
  return false
}

function isDefineTableProperty(node: ts.Node): boolean {
  return ts.isPropertyAssignment(node) && startsWithDefineTable(node.initializer)
}

function countSchemaTables(schema: string): number {
  const source = ts.createSourceFile('schema.ts', schema, ts.ScriptTarget.Latest, false)
  let count = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineSchema' &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      count = node.arguments[0].properties.filter(isDefineTableProperty).length
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return count
}

function validateReadme(readme: string, versions: RequiredVersions, schemaCount: number): string[] {
  const errors: string[] = []
  for (const [name, value, color] of [
    ['Electron', major(versions.electron), '47848F'],
    ['React', major(versions.react), '61DAFB'],
    ['TypeScript', major(versions.typescript), 'blue'],
    ['Vite', major(versions.vite), '646CFF'],
  ]) {
    requireClaim(
      errors,
      readme,
      `[![${name}](https://img.shields.io/badge/${name}-${value}-${color}.svg)]`,
      `README.md ${name} badge must declare ${name} ${value}.`
    )
    requireClaim(
      errors,
      readme,
      `**${name} ${value}**`,
      `README.md Tech Stack must declare ${name} ${value}.`
    )
  }
  const documentedSchemaCounts = [...readme.matchAll(/\b(\d+) schema tables\b/g)].map(
    match => match[1]
  )
  if (
    documentedSchemaCounts.length !== 2 ||
    documentedSchemaCounts.some(count => count !== String(schemaCount))
  ) {
    errors.push(`README.md must declare ${schemaCount} schema tables in both maintained claims.`)
  }
  return errors
}

function validateVision(
  vision: string,
  versions: RequiredVersions,
  schemaCount: number,
  featureCount: number
): string[] {
  const errors: string[] = []
  const electron = major(versions.electron)
  const react = major(versions.react)
  const typescript = major(versions.typescript)
  const vite = major(versions.vite)
  const claims: Array<[string, string]> = [
    [
      `| Desktop    | Electron ${electron} `,
      'docs/VISION.md Desktop stack version must match package.json.',
    ],
    [
      `Electron ${electron} + React ${react} + Vite ${vite}`,
      'docs/VISION.md architecture versions must match package.json.',
    ],
    [
      `React ${react}, TypeScript ${typescript}, Vite ${vite}`,
      'docs/VISION.md UI stack versions must match package.json.',
    ],
    [`Convex ${versions.convex}`, `docs/VISION.md must declare Convex ${versions.convex}.`],
    [
      `\`@github/copilot-sdk\` ${versions.copilot}`,
      `docs/VISION.md must declare @github/copilot-sdk ${versions.copilot}.`,
    ],
    [
      `Data Model (${schemaCount} Convex Schema Tables + System Storage)`,
      `docs/VISION.md must declare ${schemaCount} Convex schema tables plus system storage.`,
    ],
    [
      `**BDD**: ${featureCount} tracked Gherkin feature specs`,
      `docs/VISION.md must declare ${featureCount} tracked Gherkin feature specs.`,
    ],
  ]
  for (const [claim, message] of claims) requireClaim(errors, vision, claim, message)
  return errors
}

export function validateDocumentationMetadata(
  sources: DocumentationSources,
  packageJson: string
): string[] {
  const errors = sources.readme.includes(CI_BADGE)
    ? []
    : ['README.md must include the main-branch status badge for .github/workflows/ci.yml.']
  const result = readRequiredVersions(packageJson)
  if (!('versions' in result)) return [...errors, ...result.errors]

  const schemaCount = countSchemaTables(sources.schema)
  errors.push(...validateReadme(sources.readme, result.versions, schemaCount))
  errors.push(...validateVision(sources.vision, result.versions, schemaCount, sources.featureCount))
  requireClaim(
    errors,
    sources.contributing,
    `Node.js](https://nodejs.org/) ${result.versions.node}+`,
    `CONTRIBUTING.md prerequisites must require Node.js ${result.versions.node}+.`
  )
  requireClaim(
    errors,
    sources.readme,
    `**Node.js ${result.versions.node}+**`,
    `README.md prerequisites must require Node.js ${result.versions.node}+.`
  )
  return errors
}

export function runReadmeMetadataCheck(root = process.cwd()): void {
  const sources: DocumentationSources = {
    readme: readFileSync(resolve(root, 'README.md'), 'utf8'),
    contributing: readFileSync(resolve(root, 'CONTRIBUTING.md'), 'utf8'),
    vision: readFileSync(resolve(root, 'docs/VISION.md'), 'utf8'),
    schema: readFileSync(resolve(root, 'convex/schema.ts'), 'utf8'),
    featureCount: readdirSync(resolve(root, 'src/features')).filter(file =>
      file.endsWith('.feature')
    ).length,
  }
  const packageJson = readFileSync(resolve(root, 'package.json'), 'utf8')
  const errors = validateDocumentationMetadata(sources, packageJson)

  if (errors.length > 0) {
    console.error('Documentation metadata check failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log('Documentation metadata check passed.')
}

if (import.meta.main) runReadmeMetadataCheck()
