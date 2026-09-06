import { createHash } from 'node:crypto'
import { Linter, type Rule } from 'eslint'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import { parser } from 'typescript-eslint'

interface Position {
  line: number
  column: number
}
interface Location {
  start: Position
  end: Position
}
interface FunctionMetric {
  name: string
  location: Location
  body: Location
  fingerprint: string
  complexity: number
}
export interface FileCoverage {
  fnMap: Record<string, { name: string; loc: Location }>
  f: Record<string, number>
  statementMap: Record<string, Location>
  s: Record<string, number>
  branchMap: Record<string, { loc: Location; locations: Location[] }>
  b: Record<string, number[]>
}
export interface CrapFunction {
  id: string
  name: string
  line: number
  complexity: number
  coverage: number
  coverageKind: 'branches' | 'statements' | 'invocation'
  covered: number
  total: number
  score: number
}

function functionMetric(
  node: Rule.Node,
  context: Rule.RuleContext,
  data: Record<string, unknown>
): FunctionMetric {
  const location = node.loc!
  const body = (node as unknown as { body: { loc: Location } }).body.loc
  const tokens = context.sourceCode.getTokens(node).map(token => [token.type, token.value])
  return {
    name: String(data.name),
    location,
    body,
    fingerprint: createHash('sha256').update(JSON.stringify(tokens)).digest('hex'),
    complexity: Number(data.complexity),
  }
}

function functionsIn(source: string, filename: string): FunctionMetric[] {
  const functions: FunctionMetric[] = []
  const complexity = builtinRules.get('complexity')!
  const collector: Rule.RuleModule = {
    meta: complexity.meta,
    create(context) {
      const capture = Object.create(context) as Rule.RuleContext
      Object.defineProperty(capture, 'report', {
        value(descriptor: Rule.ReportDescriptor) {
          if (!('node' in descriptor) || !descriptor.node || !descriptor.data)
            throw new Error('Unexpected complexity report')
          const node = descriptor.node as Rule.Node
          if (
            ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
              node.type
            )
          ) {
            functions.push(functionMetric(node, context, descriptor.data))
          }
        },
      })
      return complexity.create(capture)
    },
  }
  const messages = new Linter().verify(
    source,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        linterOptions: { noInlineConfig: true },
        plugins: { metric: { rules: { complexity: collector } } },
        rules: { 'metric/complexity': ['error', { max: 0, variant: 'classic' }] },
      },
    ],
    { filename }
  )
  const errors = messages.filter(message => message.severity === 2)
  if (errors.length) throw new Error(errors.map(message => message.message).join('; '))
  return functions.sort((a, b) => compare(a.location.start, b.location.start))
}

function compare(a: Position, b: Position): number {
  return a.line - b.line || a.column - b.column
}
function contains(location: Location, point: Position): boolean {
  return compare(location.start, point) <= 0 && compare(point, location.end) < 0
}
function same(a: Position, b: Position): boolean {
  return compare(a, b) === 0
}

function matchingCoverage(fn: FunctionMetric, coverage: FileCoverage): string | undefined {
  const matches = Object.entries(coverage.fnMap).filter(([, entry]) =>
    same(entry.loc.start, fn.body.start)
  )
  if (matches.length > 1) throw new Error(`Ambiguous coverage for ${fn.name}`)
  return matches[0]?.[0]
}

function ownHits(fn: FunctionMetric, functions: FunctionMetric[], coverage: FileCoverage) {
  const belongs = (point: Position) => {
    const owners = functions.filter(candidate => contains(candidate.location, point))
    return owners.at(-1) === fn
  }
  const branches = Object.entries(coverage.branchMap)
    .filter(([, branch]) => belongs(branch.loc.start))
    .flatMap(([id, branch]) => {
      const hits = coverage.b[id]
      if (!hits || hits.length !== branch.locations.length)
        throw new Error(`Invalid branch hits ${id}`)
      return hits
    })
  if (branches.length) return { hits: branches, kind: 'branches' as const }
  const statements = Object.entries(coverage.statementMap)
    .filter(([, location]) => belongs(location.start))
    .map(([id]) => coverage.s[id])
  return { hits: statements, kind: 'statements' as const }
}

export function crapScore(complexity: number, coverage: number): number {
  if (
    !Number.isInteger(complexity) ||
    complexity < 1 ||
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    coverage > 1
  ) {
    throw new Error('Invalid CRAP inputs')
  }
  return complexity ** 2 * (1 - coverage) ** 3 + complexity
}

export function measureFunctions(
  source: string,
  coverage: FileCoverage | undefined,
  filename = 'source.ts'
): CrapFunction[] {
  const functions = functionsIn(source, filename)
  const duplicates = new Map<string, number>()
  return functions.map(fn => {
    const index = duplicates.get(fn.fingerprint) ?? 0
    duplicates.set(fn.fingerprint, index + 1)
    const id = `${fn.fingerprint}:${index}`
    const coverageId = coverage && matchingCoverage(fn, coverage)
    if (!coverage || coverageId === undefined)
      throw new Error(`Missing matching function coverage: ${fn.name} at ${fn.location.start.line}`)
    const invocation = coverage.f[coverageId]
    const evidence = ownHits(fn, functions, coverage)
    const hits = evidence.hits.length ? evidence.hits : [invocation]
    if ([invocation, ...hits].some(hit => !Number.isFinite(hit) || hit < 0))
      throw new Error(`Invalid coverage hits: ${fn.name}`)
    const covered = invocation > 0 ? hits.filter(hit => hit > 0).length : 0
    const ratio = covered / hits.length
    return {
      id,
      name: fn.name,
      line: fn.location.start.line,
      complexity: fn.complexity,
      coverage: ratio,
      coverageKind: evidence.hits.length ? evidence.kind : 'invocation',
      covered,
      total: hits.length,
      score: crapScore(fn.complexity, ratio),
    }
  })
}
