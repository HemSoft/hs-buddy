import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexUsage, getCodexAuthPath, parseCodexUsage } from './codexUsageService'

const NOW = new Date('2030-01-01T00:00:00.000Z')
const WEEK_RESET = Math.floor((NOW.getTime() + 4 * 24 * 60 * 60 * 1000) / 1000)
const SESSION_RESET = Math.floor((NOW.getTime() + 2 * 60 * 60 * 1000) / 1000)

function usagePayload(includeSession = true) {
  return JSON.stringify({
    plan_type: 'plus',
    rate_limit: {
      primary_window: {
        used_percent: 28,
        reset_at: WEEK_RESET,
        limit_window_seconds: 604_800,
      },
      ...(includeSession
        ? {
            secondary_window: {
              used_percent: 12,
              reset_at: SESSION_RESET,
              limit_window_seconds: 18_000,
            },
          }
        : {}),
    },
  })
}

describe('parseCodexUsage', () => {
  it('identifies and orders allowance windows by duration', () => {
    const result = parseCodexUsage(usagePayload(), NOW)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.planType).toBe('plus')
    expect(result.data.windows.map(window => window.kind)).toEqual(['weekly', 'five-hour'])
    expect(result.data.windows[0]).toMatchObject({
      label: 'Weekly allowance',
      usedPercent: 28,
      remainingPercent: 72,
      durationSeconds: 604_800,
    })
    expect(result.data.windows[0].periodStart).toBe(
      new Date(WEEK_RESET * 1000 - 604_800 * 1000).toISOString()
    )
  })

  it('supports a weekly-only response', () => {
    const result = parseCodexUsage(usagePayload(false), NOW)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.windows).toHaveLength(1)
    expect(result.data.windows[0].kind).toBe('weekly')
  })

  it('fails clearly when no valid windows are present', () => {
    expect(parseCodexUsage('{"rate_limit":{}}', NOW)).toEqual({
      success: false,
      error: 'No Codex allowance windows are available for this account.',
    })
    expect(parseCodexUsage('not json', NOW)).toEqual({
      success: false,
      error: 'Could not parse the Codex usage response.',
    })
    expect(parseCodexUsage('null', NOW)).toEqual({
      success: false,
      error: 'Could not parse the Codex usage response.',
    })
  })

  it('labels unfamiliar durations honestly and clamps invalid percentages', () => {
    const result = parseCodexUsage(
      JSON.stringify({
        rate_limit: {
          primary_window: {
            used_percent: 120,
            reset_at: WEEK_RESET,
            limit_window_seconds: 10_800,
          },
        },
      }),
      NOW
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.windows[0]).toMatchObject({
      kind: 'other',
      label: '3-hour allowance',
      usedPercent: 100,
      remainingPercent: 0,
    })
  })

  it('ignores malformed windows when another valid window exists', () => {
    const raw = JSON.parse(usagePayload())
    raw.rate_limit.primary_window.used_percent = 'not-a-number'
    const result = parseCodexUsage(JSON.stringify(raw), NOW)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.windows.map(window => window.kind)).toEqual(['five-hour'])
  })
})

describe('Codex usage projections', () => {
  it('preserves projections above the usable allowance boundary', () => {
    const result = parseCodexUsage(
      JSON.stringify({
        rate_limit: {
          primary_window: {
            used_percent: 70,
            reset_at: Math.floor((NOW.getTime() + 302_400 * 1000) / 1000),
            limit_window_seconds: 604_800,
          },
        },
      }),
      NOW
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.windows[0].projectedPercent).toBe(140)
  })
})

describe('fetchCodexUsage', () => {
  let directory: string
  let authPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hs-buddy-codex-'))
    authPath = join(directory, 'auth.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('uses the local Codex CLI credentials without returning them', async () => {
    await writeFile(
      authPath,
      JSON.stringify({ tokens: { access_token: 'secret-access', account_id: 'account-123' } })
    )
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer secret-access',
        'ChatGPT-Account-Id': 'account-123',
      })
      return new Response(usagePayload(), { status: 200 })
    }) as typeof fetch

    const result = await fetchCodexUsage({ authPath, fetchImpl, now: NOW })

    expect(result.success).toBe(true)
    expect(JSON.stringify(result)).not.toContain('secret-access')
  })

  it('gives actionable missing and expired login errors', async () => {
    const missing = await fetchCodexUsage({ authPath, fetchImpl: vi.fn() as typeof fetch })
    expect(missing).toEqual({
      success: false,
      error: "No Codex ChatGPT login found. Run 'codex' and sign in with ChatGPT.",
    })

    await writeFile(authPath, JSON.stringify({ tokens: { access_token: 'expired' } }))
    const expired = await fetchCodexUsage({
      authPath,
      fetchImpl: vi.fn(async () => new Response('', { status: 401 })) as typeof fetch,
    })
    expect(expired).toEqual({
      success: false,
      error: "Codex ChatGPT login expired. Run 'codex' and sign in again.",
    })
  })
})

describe('fetchCodexUsage failure handling', () => {
  let directory: string
  let authPath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hs-buddy-codex-'))
    authPath = join(directory, 'auth.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each(['{}', '{"tokens":{}}', 'not json'])(
    'treats invalid local auth as a missing Codex login: %s',
    async authPayload => {
      await writeFile(authPath, authPayload)
      const result = await fetchCodexUsage({ authPath, fetchImpl: vi.fn() as typeof fetch })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toContain("Run 'codex'")
    }
  )

  it('supports camelCase credentials and reports upstream failures safely', async () => {
    await writeFile(
      authPath,
      JSON.stringify({ tokens: { accessToken: 'camel-secret', accountId: 'camel-account' } })
    )
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 })) as typeof fetch

    const result = await fetchCodexUsage({ authPath, fetchImpl })

    expect(result).toEqual({ success: false, error: 'ChatGPT usage returned HTTP 503.' })
  })

  it('turns network errors into user-facing failures', async () => {
    await writeFile(authPath, JSON.stringify({ tokens: { access_token: 'secret' } }))
    const result = await fetchCodexUsage({
      authPath,
      fetchImpl: vi.fn(async () => {
        throw new Error('network unavailable')
      }) as typeof fetch,
    })

    expect(result).toEqual({
      success: false,
      error: 'Could not load Codex usage: network unavailable',
    })
  })

  it('honors CODEX_HOME for the default auth path', () => {
    const previous = process.env.CODEX_HOME
    process.env.CODEX_HOME = directory
    try {
      expect(getCodexAuthPath()).toBe(authPath)
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previous
    }
  })
})
