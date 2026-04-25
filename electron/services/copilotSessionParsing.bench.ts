// @vitest-environment node
import { bench, describe, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getSessionDetail } from './copilotSessionService'

// ─── Fixture generation ───────────────────────────────────
// Creates realistic JSONL files matching VS Code Copilot chatSession format.
// The regex-extraction hot path in copilotSessionService operates on these lines.

function generateJSONLFixture(requestCount: number): string {
  const lines: string[] = []

  // kind=0: session init (the large line that extractScanInfo reads 32KB from)
  const requests = Array.from({ length: requestCount }, (_, i) => ({
    message: {
      text: `Prompt ${i}: Explain the architecture of the system and suggest improvements for ${i}`,
    },
  }))

  lines.push(
    JSON.stringify({
      kind: 0,
      v: {
        sessionId: 'bench-session-' + requestCount,
        creationDate: Date.now() - requestCount * 60000,
        customTitle: 'Benchmark Session with ' + requestCount + ' requests',
        requests,
        inputState: {
          selectedModel: {
            metadata: {
              id: 'claude-opus-4.6',
              name: 'Claude Opus 4.6',
              family: 'claude',
              vendor: 'anthropic',
              multiplier: '50x',
              multiplierNumeric: 50,
              maxInputTokens: 200000,
              maxOutputTokens: 32000,
            },
          },
        },
      },
    })
  )

  // kind=1 result lines (the lines extractResultData processes)
  for (let i = 0; i < requestCount; i++) {
    lines.push(
      JSON.stringify({
        kind: 1,
        k: ['requests', String(i), 'result'],
        v: {
          metadata: {
            promptTokens: 1000 + ((i * 137) % 5000),
            outputTokens: 200 + ((i * 89) % 2000),
            toolCallRounds:
              i % 3 === 0
                ? [
                    { toolCalls: [{ name: 'read_file' }, { name: 'grep_search' }] },
                    { toolCalls: [{ name: 'replace_string_in_file' }] },
                  ]
                : [],
          },
          timings: {
            firstProgress: 100 + ((i * 41) % 500),
            totalElapsed: 5000 + ((i * 271) % 20000),
            promptTokens: 1000 + ((i * 137) % 5000),
            outputTokens: 200 + ((i * 89) % 2000),
          },
        },
      })
    )
  }

  // kind=2 snapshot lines (periodic request array snapshots)
  if (requestCount > 10) {
    const snapshot = Array.from({ length: requestCount }, (_, i) => ({
      message: {
        text: `Prompt ${i}: What is the meaning of the refactored module in context ${i}?`,
      },
    }))
    lines.push(
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: snapshot,
      })
    )
  }

  // kind=1 title update
  lines.push(
    JSON.stringify({
      kind: 1,
      k: ['customTitle'],
      v: 'Updated: Benchmark Session ' + requestCount,
    })
  )

  return lines.join('\n')
}

// ─── Temp file management ─────────────────────────────────

const tmpDir = path.join(os.tmpdir(), 'buddy-bench-jsonl')
const fixtures: Record<string, string> = {}

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const count of [10, 100, 500]) {
    const filePath = path.join(tmpDir, `session-${count}.jsonl`)
    fs.writeFileSync(filePath, generateJSONLFixture(count))
    fixtures[String(count)] = filePath
  }
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Benchmarks ───────────────────────────────────────────

describe('getSessionDetail (streaming JSONL parse)', () => {
  bench('10 requests', async () => {
    await getSessionDetail(fixtures['10'])
  })

  bench('100 requests', async () => {
    await getSessionDetail(fixtures['100'])
  })

  bench('500 requests', async () => {
    await getSessionDetail(fixtures['500'])
  })
})

describe('regex extraction (hot path)', () => {
  // Benchmark the regex patterns used in extractScanInfo/extractResultData
  // by running them directly on realistic line content.

  const initLine = JSON.stringify({
    kind: 0,
    v: {
      sessionId: 'regex-bench',
      creationDate: Date.now(),
      responderUsername: 'copilot',
      customTitle: 'A moderately long session title for benchmarking regex extraction performance',
      requests: [{ message: { text: 'Help me refactor the authentication module' } }],
      inputState: { selectedModel: { metadata: { id: 'claude-opus-4.6' } } },
    },
  })

  const resultLine = JSON.stringify({
    kind: 1,
    k: ['requests', '0', 'result'],
    v: {
      metadata: {
        promptTokens: 4500,
        outputTokens: 1200,
        toolCallRounds: [
          {
            toolCalls: [
              { name: 'read_file' },
              { name: 'grep_search' },
              { name: 'semantic_search' },
            ],
          },
        ],
      },
      timings: { firstProgress: 250, totalElapsed: 12000 },
    },
  })

  const titleRe = /"customTitle":"((?:[^"\\]|\\.)*)"/
  const agentRe = /"responderUsername":"((?:[^"\\]|\\.)*)"/
  const dateRe = /"creationDate":(\d+)/
  const promptRe = /"message":\{"text":"((?:[^"\\]|\\.)*)"/
  const reqIdRe = /"requestId"/g

  bench('extractScanInfo regexes (title, agent, date, prompt)', () => {
    titleRe.exec(initLine)
    agentRe.exec(initLine)
    dateRe.exec(initLine)
    promptRe.exec(initLine)
    void initLine.match(reqIdRe)
  })

  bench('extractResultData JSON.parse', () => {
    const parsed = JSON.parse(resultLine)
    const meta = parsed.v.metadata ?? {}
    void (meta.promptTokens ?? 0)
    void (meta.outputTokens ?? 0)
    let toolCallCount = 0
    for (const round of meta.toolCallRounds ?? []) {
      toolCallCount += (round.toolCalls ?? []).length
    }
    void toolCallCount
  })

  const promptTokensRe = /"promptTokens":(\d+)/
  const outputTokensRe = /"outputTokens":(\d+)/

  bench('extractResultData regex fallback', () => {
    promptTokensRe.exec(resultLine)
    outputTokensRe.exec(resultLine)
  })

  const kindRe = new RegExp('^\\{"kind":(\\d+)')
  const keyRe = new RegExp('"k":\\[([^\\]]*)\\]')

  bench('kind detection regex', () => {
    kindRe.exec(resultLine)
    kindRe.exec(initLine)
  })

  bench('key path extraction regex', () => {
    keyRe.exec(resultLine)
    keyRe.exec(initLine)
  })
})
