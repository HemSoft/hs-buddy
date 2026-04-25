import { describe, expect, it } from 'vitest'
import { extractToolCallInfo } from './toolCallParsing'

describe('extractToolCallInfo', () => {
  it('returns zero count and empty names for empty metadata', () => {
    expect(extractToolCallInfo({})).toEqual({ toolCallCount: 0, toolNames: [] })
  })

  it('returns zero count when toolCallRounds is missing', () => {
    expect(extractToolCallInfo({ other: 'data' })).toEqual({ toolCallCount: 0, toolNames: [] })
  })

  it('returns zero count when toolCallRounds is empty', () => {
    expect(extractToolCallInfo({ toolCallRounds: [] })).toEqual({
      toolCallCount: 0,
      toolNames: [],
    })
  })

  it('counts tool calls across rounds', () => {
    const metadata = {
      toolCallRounds: [
        { toolCalls: [{ name: 'readFile' }, { name: 'writeFile' }] },
        { toolCalls: [{ name: 'exec' }] },
      ],
    }
    const result = extractToolCallInfo(metadata)
    expect(result.toolCallCount).toBe(3)
    expect(result.toolNames).toEqual(['readFile', 'writeFile', 'exec'])
  })

  it('deduplicates tool names', () => {
    const metadata = {
      toolCallRounds: [
        { toolCalls: [{ name: 'readFile' }, { name: 'readFile' }] },
        { toolCalls: [{ name: 'readFile' }] },
      ],
    }
    const result = extractToolCallInfo(metadata)
    expect(result.toolCallCount).toBe(3)
    expect(result.toolNames).toEqual(['readFile'])
  })

  it('handles rounds with missing toolCalls', () => {
    const metadata = {
      toolCallRounds: [{ other: 'data' }, { toolCalls: [{ name: 'exec' }] }],
    }
    const result = extractToolCallInfo(metadata)
    expect(result.toolCallCount).toBe(1)
    expect(result.toolNames).toEqual(['exec'])
  })

  it('counts tool calls without names', () => {
    const metadata = {
      toolCallRounds: [{ toolCalls: [{ id: '1' }, { name: 'readFile' }] }],
    }
    const result = extractToolCallInfo(metadata)
    expect(result.toolCallCount).toBe(2)
    expect(result.toolNames).toEqual(['readFile'])
  })

  it('handles empty toolCalls arrays', () => {
    const metadata = {
      toolCallRounds: [{ toolCalls: [] }],
    }
    expect(extractToolCallInfo(metadata)).toEqual({ toolCallCount: 0, toolNames: [] })
  })
})
