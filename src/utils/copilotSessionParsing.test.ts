import { describe, it, expect } from 'vitest'
import {
  str,
  num,
  parseModelMetadata,
  extractInitFromValue,
  extractSessionInitFallback,
  resolveFolderOrWorkspaceName,
  extractTitle,
  resolveMetricValue,
  resolveTokenCounts,
  extractResultDataFallback,
  parseKeyPath,
  regexExtract,
  parseScanChunk,
  type SessionParseState,
  processSessionLine,
  validateSessionPath,
} from './copilotSessionParsing'

describe('str', () => {
  it('returns string values as-is', () => {
    expect(str('hello')).toBe('hello')
  })

  it('returns default for non-string', () => {
    expect(str(42)).toBe('')
    expect(str(null)).toBe('')
    expect(str(undefined)).toBe('')
  })

  it('uses custom default', () => {
    expect(str(undefined, 'fallback')).toBe('fallback')
  })
})

describe('num', () => {
  it('returns number values as-is', () => {
    expect(num(42)).toBe(42)
    expect(num(0)).toBe(0)
  })

  it('returns default for non-number', () => {
    expect(num('hello')).toBe(0)
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
  })

  it('uses custom default', () => {
    expect(num(undefined, 5)).toBe(5)
  })
})

describe('parseModelMetadata', () => {
  it('extracts all fields from a complete object', () => {
    const result = parseModelMetadata({
      id: 'gpt-4',
      name: 'GPT-4',
      family: 'gpt',
      vendor: 'openai',
      multiplier: '2x',
      multiplierNumeric: 2,
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
    })
    expect(result).toEqual({
      id: 'gpt-4',
      name: 'GPT-4',
      family: 'gpt',
      vendor: 'openai',
      multiplier: '2x',
      multiplierNumeric: 2,
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
    })
  })

  it('uses defaults for missing fields', () => {
    const result = parseModelMetadata({})
    expect(result).toEqual({
      id: '',
      name: '',
      family: '',
      vendor: '',
      multiplier: '1x',
      multiplierNumeric: 1,
      maxInputTokens: 0,
      maxOutputTokens: 0,
    })
  })
})

describe('extractInitFromValue', () => {
  it('extracts session init with model metadata', () => {
    const result = extractInitFromValue({
      sessionId: 'abc-123',
      creationDate: 1700000000,
      inputState: {
        selectedModel: {
          metadata: { id: 'gpt-4', name: 'GPT-4', family: 'gpt', vendor: 'openai' },
        },
      },
    })
    expect(result.sessionId).toBe('abc-123')
    expect(result.creationDate).toBe(1700000000)
    expect(result.model?.id).toBe('gpt-4')
  })

  it('handles missing model metadata', () => {
    const result = extractInitFromValue({
      sessionId: 'abc-123',
      creationDate: 1700000000,
    })
    expect(result.model).toBeNull()
  })

  it('handles missing inputState', () => {
    const result = extractInitFromValue({})
    expect(result.sessionId).toBe('')
    expect(result.creationDate).toBe(0)
    expect(result.model).toBeNull()
  })

  it('handles selectedModel without metadata', () => {
    const result = extractInitFromValue({
      sessionId: 'x',
      creationDate: 1,
      inputState: { selectedModel: { id: 'gpt-4' } },
    })
    expect(result.model).toBeNull()
  })
})

describe('extractSessionInitFallback', () => {
  it('extracts sessionId and creationDate via regex', () => {
    const line = '{"kind":0,"v":{"sessionId":"s-123","creationDate":1700000000}}'
    const result = extractSessionInitFallback(line)
    expect(result.sessionId).toBe('s-123')
    expect(result.creationDate).toBe(1700000000)
    expect(result.model).toBeNull()
  })

  it('returns defaults for lines without matching data', () => {
    const result = extractSessionInitFallback('{"kind":0,"v":{}}')
    expect(result.sessionId).toBe('')
    expect(result.creationDate).toBe(0)
  })
})

describe('resolveFolderOrWorkspaceName', () => {
  it('resolves a folder name from a file URI', () => {
    const result = resolveFolderOrWorkspaceName({
      folder: 'file:///home/user/projects/my-app',
    })
    expect(result).toBe('my-app')
  })

  it('resolves a workspace name and strips extension', () => {
    const result = resolveFolderOrWorkspaceName({
      workspace: 'file:///home/user/my-project.code-workspace',
    })
    expect(result).toBe('my-project')
  })

  it('prefers folder over workspace', () => {
    const result = resolveFolderOrWorkspaceName({
      folder: 'file:///home/user/folder-name',
      workspace: 'file:///home/user/workspace.code-workspace',
    })
    expect(result).toBe('folder-name')
  })

  it('handles encoded URIs', () => {
    const result = resolveFolderOrWorkspaceName({
      folder: 'file:///home/user/my%20project',
    })
    expect(result).toBe('my project')
  })

  it('returns null when neither folder nor workspace present', () => {
    expect(resolveFolderOrWorkspaceName({})).toBeNull()
  })

  it('returns null for empty strings', () => {
    expect(resolveFolderOrWorkspaceName({ folder: '', workspace: '' })).toBeNull()
  })

  it('handles Windows-style paths', () => {
    const result = resolveFolderOrWorkspaceName({
      folder: 'file:///C%3A/Users/dev/project',
    })
    expect(result).toBe('project')
  })

  it('falls back to decoded path when baseName is empty for folder', () => {
    const result = resolveFolderOrWorkspaceName({ folder: 'file:///' })
    expect(result).toBe('')
  })

  it('falls back to decoded path when baseName is empty for workspace', () => {
    const result = resolveFolderOrWorkspaceName({ workspace: 'file:///.code-workspace' })
    expect(typeof result).toBe('string')
  })
})

describe('extractTitle', () => {
  it('extracts title from JSONL line', () => {
    const line = '{"kind":1,"k":["customTitle"],"v":"My Chat Title"}'
    expect(extractTitle(line)).toBe('My Chat Title')
  })

  it('unescapes quotes and backslashes', () => {
    const line = '{"kind":1,"k":["customTitle"],"v":"Title \\"quoted\\" and \\\\slashed"}'
    expect(extractTitle(line)).toBe('Title "quoted" and \\slashed')
  })

  it('returns null for lines without a v-string', () => {
    expect(extractTitle('{"kind":1}')).toBeNull()
  })
})

describe('resolveMetricValue', () => {
  it('prefers primary', () => {
    expect(resolveMetricValue(10, 20)).toBe(10)
  })

  it('falls back to fallback', () => {
    expect(resolveMetricValue(undefined, 20)).toBe(20)
  })

  it('returns 0 when both undefined', () => {
    expect(resolveMetricValue(undefined, undefined)).toBe(0)
  })
})

describe('resolveTokenCounts', () => {
  it('extracts from metadata first', () => {
    const result = resolveTokenCounts(
      { promptTokens: 100, outputTokens: 200 },
      { promptTokens: 50, outputTokens: 60, firstProgress: 500, totalElapsed: 3000 }
    )
    expect(result.promptTokens).toBe(100)
    expect(result.outputTokens).toBe(200)
    expect(result.firstProgressMs).toBe(500)
    expect(result.totalElapsedMs).toBe(3000)
  })

  it('falls back to timings when metadata missing', () => {
    const result = resolveTokenCounts(undefined, { promptTokens: 50, outputTokens: 60 })
    expect(result.promptTokens).toBe(50)
    expect(result.outputTokens).toBe(60)
  })

  it('handles both undefined', () => {
    const result = resolveTokenCounts(undefined, undefined)
    expect(result).toEqual({
      promptTokens: 0,
      outputTokens: 0,
      firstProgressMs: 0,
      totalElapsedMs: 0,
    })
  })
})

describe('extractResultDataFallback', () => {
  it('extracts token counts from raw line', () => {
    const line = '{"promptTokens":100,"outputTokens":200}'
    const result = extractResultDataFallback(line)
    expect(result).toEqual({
      prompt: '',
      promptTokens: 100,
      outputTokens: 200,
      firstProgressMs: 0,
      totalElapsedMs: 0,
      toolCallCount: 0,
      toolNames: [],
    })
  })

  it('returns null when tokens not found', () => {
    expect(extractResultDataFallback('{}')).toBeNull()
    expect(extractResultDataFallback('{"promptTokens":100}')).toBeNull()
  })
})

describe('parseKeyPath', () => {
  it('parses quoted key array', () => {
    expect(parseKeyPath('{"k":["customTitle"]}')).toEqual(['customTitle'])
  })

  it('parses multi-segment path', () => {
    expect(parseKeyPath('{"k":["requests","0","result"]}')).toEqual(['requests', '0', 'result'])
  })

  it('returns empty array for lines without k', () => {
    expect(parseKeyPath('{"kind":0}')).toEqual([])
  })
})

describe('regexExtract', () => {
  it('returns captured group on match', () => {
    expect(regexExtract('hello world 42', /(\d+)/, 'none')).toBe('42')
  })

  it('returns fallback on no match', () => {
    expect(regexExtract('no numbers here', /(\d+)/, 'fallback')).toBe('fallback')
  })

  it('returns first capture group only', () => {
    expect(regexExtract('a=1,b=2', /(\w+)=(\d+)/, '')).toBe('a')
  })

  it('handles global-flag regex safely without stateful lastIndex', () => {
    const gPattern = /(\d+)/g
    expect(regexExtract('abc 42 def', gPattern, 'none')).toBe('42')
    // Second call with same regex must still match (no leftover lastIndex)
    expect(regexExtract('abc 42 def', gPattern, 'none')).toBe('42')
  })
})

describe('parseScanChunk', () => {
  it('returns fallback for non-kind-0 chunks', () => {
    const result = parseScanChunk('{"kind":1,"k":["customTitle"]}')
    expect(result).toEqual({
      title: '',
      firstPrompt: '',
      agent: '',
      createdAt: 0,
      requestCount: 0,
    })
  })

  it('returns fallback for empty string', () => {
    const result = parseScanChunk('')
    expect(result).toEqual({
      title: '',
      firstPrompt: '',
      agent: '',
      createdAt: 0,
      requestCount: 0,
    })
  })

  it('extracts title from kind-0 chunk', () => {
    const chunk = '{"kind":0,"v":{"customTitle":"My Session","creationDate":1700000000}}'
    const result = parseScanChunk(chunk)
    expect(result.title).toBe('My Session')
  })

  it('extracts agent/responder', () => {
    const chunk = '{"kind":0,"v":{"responderUsername":"copilot","creationDate":0}}'
    const result = parseScanChunk(chunk)
    expect(result.agent).toBe('copilot')
  })

  it('extracts creationDate', () => {
    const chunk = '{"kind":0,"v":{"creationDate":1700000000}}'
    const result = parseScanChunk(chunk)
    expect(result.createdAt).toBe(1700000000)
  })

  it('extracts and truncates firstPrompt to 200 chars', () => {
    const longPrompt = 'x'.repeat(300)
    const chunk = `{"kind":0,"v":{"message":{"text":"${longPrompt}"},"creationDate":0}}`
    const result = parseScanChunk(chunk)
    expect(result.firstPrompt.length).toBe(200)
  })

  it('counts requestId occurrences', () => {
    const chunk =
      '{"kind":0,"v":{"creationDate":0,"requests":[{"requestId":"a"},{"requestId":"b"},{"requestId":"c"}]}}'
    const result = parseScanChunk(chunk)
    expect(result.requestCount).toBe(3)
  })

  it('handles escaped quotes in title', () => {
    const chunk = '{"kind":0,"v":{"customTitle":"say \\"hello\\"","creationDate":0}}'
    const result = parseScanChunk(chunk)
    expect(result.title).toBe('say "hello"')
  })

  it('handles escaped backslashes in title', () => {
    const chunk = '{"kind":0,"v":{"customTitle":"path\\\\to\\\\file","creationDate":0}}'
    const result = parseScanChunk(chunk)
    expect(result.title).toBe('path\\to\\file')
  })

  it('returns zero requestCount when none present', () => {
    const chunk = '{"kind":0,"v":{"creationDate":0}}'
    const result = parseScanChunk(chunk)
    expect(result.requestCount).toBe(0)
  })

  it('returns empty firstPrompt when no message field', () => {
    const chunk = '{"kind":0,"v":{"creationDate":0}}'
    const result = parseScanChunk(chunk)
    expect(result.firstPrompt).toBe('')
  })

  it('handles truncated JSON (chunk cut mid-field)', () => {
    const chunk = '{"kind":0,"v":{"customTitle":"partial","creationDa'
    const result = parseScanChunk(chunk)
    expect(result.title).toBe('partial')
    expect(result.createdAt).toBe(0)
  })
})

// ─── Session line processing tests ──────────────────────

function makeState(): SessionParseState {
  return { init: null, title: '', resultsByIndex: new Map(), prompts: new Map() }
}

describe('processSessionLine', () => {
  // ─── kind=0 (init) via handleInitLine / collectPrompts ──────

  it('processes kind=0 (init) lines', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: { sessionId: 'sess1', creationDate: 1000, customTitle: 'Title1' },
    })
    processSessionLine(0, [], line, state)
    expect(state.init?.sessionId).toBe('sess1')
    expect(state.title).toBe('Title1')
  })

  it('processes kind=0 without title (title stays empty)', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: { sessionId: 'sess-no-title', creationDate: 500 },
    })
    processSessionLine(0, [], line, state)
    expect(state.init?.sessionId).toBe('sess-no-title')
    expect(state.title).toBe('')
  })

  it('kind=0 sets init to null when v is missing', () => {
    const state = makeState()
    processSessionLine(0, [], JSON.stringify({}), state)
    expect(state.init).toBeNull()
    expect(state.title).toBe('')
  })

  it('kind=0 falls back on invalid JSON', () => {
    const state = makeState()
    processSessionLine(0, [], 'invalid{"sessionId":"fallback-id","creationDate":99999}', state)
    expect(state.init?.sessionId).toBe('fallback-id')
    expect(state.init?.creationDate).toBe(99999)
  })

  it('kind=0 collects prompts from requests array', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: {
        sessionId: 'sid',
        creationDate: 1,
        requests: [{ message: { text: 'Hello' } }, { message: { text: 'World' } }],
      },
    })
    processSessionLine(0, [], line, state)
    expect(state.prompts.get(0)).toBe('Hello')
    expect(state.prompts.get(1)).toBe('World')
  })

  it('kind=0 skips request entries without message.text', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: {
        sessionId: 'sid',
        creationDate: 1,
        requests: [{}, { message: {} }, { message: { text: 'only' } }],
      },
    })
    processSessionLine(0, [], line, state)
    expect(state.prompts.size).toBe(1)
    expect(state.prompts.get(2)).toBe('only')
  })

  it('kind=0 overwrites existing prompt indices', () => {
    const state = makeState()
    state.prompts.set(0, 'old')
    const line = JSON.stringify({
      v: { sessionId: 'sid', creationDate: 1, requests: [{ message: { text: 'new' } }] },
    })
    processSessionLine(0, [], line, state)
    expect(state.prompts.get(0)).toBe('new')
  })

  // ─── kind=1 (update) title changes ──────────────────────────

  it('processes kind=1 (update) title changes', () => {
    const state = makeState()
    const line = JSON.stringify({ v: 'New Title' })
    processSessionLine(1, ['customTitle'], line, state)
    expect(state.title).toBe('New Title')
  })

  it('processes kind=1 title update that fails extraction (title unchanged)', () => {
    const state = makeState()
    state.title = 'Original'
    const line = JSON.stringify({ v: 42 })
    processSessionLine(1, ['customTitle'], line, state)
    expect(state.title).toBe('Original')
  })

  it('ignores kind=1 updates with wrong keyPath length for title', () => {
    const state = makeState()
    state.title = 'keep'
    processSessionLine(1, ['a', 'customTitle'], JSON.stringify({ v: 'ignored' }), state)
    expect(state.title).toBe('keep')
  })

  // ─── kind=1 (update) result data via extractResultData ──────

  it('processes kind=1 (update) result data', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: {
        metadata: { promptTokens: 10, outputTokens: 5, toolCallRounds: [] },
        timings: {},
      },
    })
    processSessionLine(1, ['requests', '0', 'result'], line, state)
    expect(state.resultsByIndex.size).toBe(1)
    expect(state.resultsByIndex.get(0)?.promptTokens).toBe(10)
  })

  it('kind=1 result extracts full token and timing data', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: {
        metadata: { promptTokens: 100, outputTokens: 50, toolCallRounds: [] },
        timings: { firstProgress: 200, totalElapsed: 1000 },
      },
    })
    processSessionLine(1, ['requests', '0', 'result'], line, state)
    const result = state.resultsByIndex.get(0)
    expect(result).toEqual({
      prompt: '',
      promptTokens: 100,
      outputTokens: 50,
      firstProgressMs: 200,
      totalElapsedMs: 1000,
      toolCallCount: 0,
      toolNames: [],
    })
  })

  it('kind=1 result falls back to regex on invalid JSON', () => {
    const state = makeState()
    const line = '{"broken: true, "promptTokens":42,"outputTokens":10}'
    processSessionLine(1, ['requests', '0', 'result'], line, state)
    const result = state.resultsByIndex.get(0)
    expect(result).toEqual({
      prompt: '',
      promptTokens: 42,
      outputTokens: 10,
      firstProgressMs: 0,
      totalElapsedMs: 0,
      toolCallCount: 0,
      toolNames: [],
    })
  })

  it('ignores kind=1 result update with non-numeric index', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: {
        metadata: { promptTokens: 1, outputTokens: 1, toolCallRounds: [] },
        timings: {},
      },
    })
    processSessionLine(1, ['requests', 'abc', 'result'], line, state)
    expect(state.resultsByIndex.size).toBe(0)
  })

  it('ignores kind=1 result update with null extractResultData', () => {
    const state = makeState()
    processSessionLine(1, ['requests', '0', 'result'], 'garbage', state)
    expect(state.resultsByIndex.size).toBe(0)
  })

  it('kind=1 result returns null when v is missing', () => {
    const state = makeState()
    processSessionLine(1, ['requests', '0', 'result'], JSON.stringify({}), state)
    expect(state.resultsByIndex.size).toBe(0)
  })

  // ─── kind=2 (snapshot) via handleRequestsSnapshot / collectRequestPrompts ──

  it('processes kind=2 (snapshot) for requests', () => {
    const state = makeState()
    const line = JSON.stringify({ v: [{ message: { text: 'snap' } }] })
    processSessionLine(2, ['requests'], line, state)
    expect(state.prompts.get(0)).toBe('snap')
  })

  it('kind=2 does not overwrite already-set prompt indices', () => {
    const state = makeState()
    state.prompts.set(0, 'keep')
    const line = JSON.stringify({ v: [{ message: { text: 'replace' } }] })
    processSessionLine(2, ['requests'], line, state)
    expect(state.prompts.get(0)).toBe('keep')
  })

  it('kind=2 skips null/undefined entries in requests array', () => {
    const state = makeState()
    const line = JSON.stringify({ v: [null, null, { message: { text: 'ok' } }] })
    processSessionLine(2, ['requests'], line, state)
    expect(state.prompts.size).toBe(1)
    expect(state.prompts.get(2)).toBe('ok')
  })

  it('kind=2 skips non-string text values in requests', () => {
    const state = makeState()
    const line = JSON.stringify({
      v: [{ message: { text: {} } }, { message: { text: 42 } }, { message: { text: 'valid' } }],
    })
    processSessionLine(2, ['requests'], line, state)
    expect(state.prompts.size).toBe(1)
    expect(state.prompts.get(2)).toBe('valid')
  })

  it('kind=2 ignores non-array v', () => {
    const state = makeState()
    processSessionLine(2, ['requests'], JSON.stringify({ v: 'not-array' }), state)
    expect(state.prompts.size).toBe(0)
  })

  it('kind=2 ignores unparseable lines', () => {
    const state = makeState()
    processSessionLine(2, ['requests'], 'broken{json', state)
    expect(state.prompts.size).toBe(0)
  })

  it('ignores kind=2 when keyPath is not requests', () => {
    const state = makeState()
    processSessionLine(2, ['other'], '{}', state)
    expect(state.prompts.size).toBe(0)
  })

  // ─── Other kinds ────────────────────────────────────────────

  it('ignores unknown kind values', () => {
    const state = makeState()
    processSessionLine(99, [], '{}', state)
    expect(state.init).toBeNull()
  })
})

describe('validateSessionPath', () => {
  const identity = (p: string) => p

  it('returns normalized path for valid .jsonl inside storage', () => {
    expect(validateSessionPath('/storage/ws/file.jsonl', '/storage', identity, '/')).toBe(
      '/storage/ws/file.jsonl'
    )
  })

  it('rejects paths outside storage root', () => {
    expect(validateSessionPath('/other/file.jsonl', '/storage', identity, '/')).toBeNull()
  })

  it('rejects non-.jsonl files', () => {
    expect(validateSessionPath('/storage/file.txt', '/storage', identity, '/')).toBeNull()
  })

  it('rejects empty storage path', () => {
    expect(validateSessionPath('/any/file.jsonl', '', identity, '/')).toBeNull()
  })

  it('prevents prefix attacks (e.g., /storage-evil)', () => {
    expect(validateSessionPath('/storage-evil/file.jsonl', '/storage', identity, '/')).toBeNull()
  })

  it('accepts exact storage path that is also a .jsonl', () => {
    expect(validateSessionPath('/storage.jsonl', '/storage.jsonl', identity, '/')).toBe(
      '/storage.jsonl'
    )
  })

  it('works with Windows-style separators', () => {
    expect(validateSessionPath('C:\\storage\\ws\\f.jsonl', 'C:\\storage', identity, '\\')).toBe(
      'C:\\storage\\ws\\f.jsonl'
    )
  })
})
