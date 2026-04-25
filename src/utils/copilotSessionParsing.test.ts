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
