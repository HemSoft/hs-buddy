import { describe, expect, it, vi } from 'vitest'
import { hasRequiredGate, openPullNumbers, reconcilePull } from './ai-review-controller'
import { allPages, githubApi, readSnapshot, type GitHubApi } from './ai-review-github'
import { CODEX_ACTOR_ID, MERGE_APP_ID, type Pull } from './ai-review-policy'

const repo = 'HemSoft/hs-buddy'
const head = 'a'.repeat(40)
const bot = { id: CODEX_ACTOR_ID, login: 'chatgpt-codex-connector[bot]' }
const options = { apply: true, enabled: true }
interface Call {
  path: string
  method: string
  body: Record<string, unknown>
}

function fixture() {
  const pull: Pull = {
    number: 1,
    node_id: 'PR_1',
    state: 'open',
    draft: false,
    commits: 1,
    head: { sha: head, repo: { full_name: repo } },
    base: { ref: 'main' },
    labels: [{ name: 'automerge' }],
    auto_merge: null,
  }
  return {
    pull,
    calls: [] as Call[],
    onArm: () => {},
    graphError: false,
    failDisable: false,
    failEnable: false,
    failPending: false,
    loseEnableResponse: false,
    enforced: true,
    appId: MERGE_APP_ID,
    threadPages: false,
    shared: false,
    comments: [
      {
        id: 7,
        user: bot,
        created_at: '2026-09-06T16:55:01Z',
        updated_at: '2026-09-06T16:55:01Z',
        body: `Codex Review: Didn't find any major issues.\n**Reviewed commit:** \`${head}\``,
      },
    ],
  }
}

function fakeApi(data: ReturnType<typeof fixture>): GitHubApi {
  return {
    async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
      const values = (body ?? {}) as Record<string, unknown>
      data.calls.push({ path, method, body: values })
      const answer = route(data, path, method, values)
      return structuredClone(answer) as T
    },
  }
}

function route(
  data: ReturnType<typeof fixture>,
  path: string,
  method: string,
  body: Record<string, unknown>
): unknown {
  if (path === '/graphql') return graph(data, body)
  if (method === 'POST') return createCheck(data)
  if (method === 'PATCH') return {}
  if (path.endsWith('/pulls/1')) return data.pull
  if (path.includes('/comments?')) return commentsPage(data, path)
  if (path.includes('/commits?')) return [{ sha: data.pull.head.sha }]
  if (path.includes('/pulls?'))
    return data.shared ? [data.pull, { ...data.pull, number: 2 }] : [data.pull]
  if (path.includes('/rules/')) return rules(data.enforced)
  return []
}

function createCheck(data: ReturnType<typeof fixture>) {
  if (data.failPending) throw new Error('Checks API unavailable')
  return { id: 11, app: { id: data.appId } }
}

function commentsPage(data: ReturnType<typeof fixture>, path: string) {
  return path.endsWith('page=1') ? data.comments : []
}

function rules(enforced: boolean) {
  return enforced
    ? [
        {
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: [
              { context: 'ai-review-accepted', integration_id: MERGE_APP_ID },
            ],
          },
        },
        { parameters: { required_review_thread_resolution: true } },
      ]
    : []
}

function graph(data: ReturnType<typeof fixture>, body: Record<string, unknown>): unknown {
  const query = String(body.query)
  if (query.includes('enablePullRequestAutoMerge')) {
    if (data.failEnable) return { errors: [{ message: 'expected head changed' }] }
    data.pull.auto_merge = { merge_method: 'squash' }
    data.onArm()
    if (data.loseEnableResponse) throw new Error('Enable response lost')
    return { data: { enablePullRequestAutoMerge: { pullRequest: { id: 'PR_1' } } } }
  }
  if (query.includes('disablePullRequestAutoMerge')) {
    if (data.failDisable) throw new Error('disable unavailable')
    data.pull.auto_merge = null
    return { data: { disablePullRequestAutoMerge: { pullRequest: { id: 'PR_1' } } } }
  }
  if (data.graphError) return { errors: [{ message: 'denied' }] }
  const variables = body.variables as { cursor: string | null }
  const more = data.threadPages && !variables.cursor
  return {
    data: {
      repository: {
        pullRequest: {
          headRefOid: data.pull.head.sha,
          reviewDecision: null,
          reviewThreads: {
            nodes: [{ isResolved: !data.threadPages || more }],
            pageInfo: { hasNextPage: more, endCursor: more ? 'next' : null },
          },
        },
      },
    },
  }
}

function writes(data: ReturnType<typeof fixture>): Call[] {
  return data.calls.filter(
    call =>
      call.method === 'PATCH' ||
      (call.method === 'POST' && call.path !== '/graphql') ||
      String(call.body.query).startsWith('mutation')
  )
}

describe('GitHub review controller', () => {
  it('holds the check pending while enrolling the expected SHA, then publishes success', async () => {
    const data = fixture()
    await reconcilePull(fakeApi(data), repo, 1, options)
    const mutations = writes(data)
    expect(mutations[0].body).toMatchObject({ head_sha: head, status: 'in_progress' })
    expect(mutations[1].body.variables).toEqual({
      input: { pullRequestId: 'PR_1', expectedHeadOid: head, mergeMethod: 'SQUASH' },
    })
    expect(mutations.at(-1)?.body).toMatchObject({ conclusion: 'success' })
  })

  it('dry-run reads the same policy without writing', async () => {
    const data = fixture()
    expect(await reconcilePull(fakeApi(data), repo, 1, { ...options, apply: false })).toContain(
      'eligible=true'
    )
    expect(writes(data)).toEqual([])
  })

  it('ignores closed PRs and lists open PR numbers', async () => {
    const data = fixture()
    data.pull.state = 'closed'
    expect(await reconcilePull(fakeApi(data), repo, 1, options)).toContain('closed')
    expect(writes(data)).toEqual([])
    data.pull.state = 'open'
    expect(await openPullNumbers(fakeApi(data), repo)).toEqual([1])
    expect(data.calls.at(-1)?.path).toBe(
      `/repos/${repo}/pulls?state=open&base=main&per_page=100&page=1`
    )
  })

  it.each(['disabled', 'unlabelled', 'missing rules', 'hold', 'shared head', 'second-page thread'])(
    'does not enroll when %s',
    async kind => {
      const data = fixture()
      if (kind === 'unlabelled') data.pull.labels = []
      if (kind === 'missing rules') data.enforced = false
      if (kind === 'hold') data.pull.labels.push({ name: 'automerge:hold' })
      if (kind === 'shared head') data.shared = true
      if (kind === 'second-page thread') data.threadPages = true
      await reconcilePull(fakeApi(data), repo, 1, { ...options, enabled: kind !== 'disabled' })
      expect(data.pull.auto_merge).toBeNull()
      const expected = ['hold', 'shared head', 'second-page thread'].includes(kind)
        ? 'failure'
        : 'success'
      expect(writes(data).at(-1)?.body.conclusion).toBe(expected)
    }
  )
})

describe('enrollment withdrawal', () => {
  it('keeps the gate failed when GitHub refuses enrollment', async () => {
    const data = fixture()
    data.failEnable = true
    await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow('GitHub refused')
    expect(data.pull.auto_merge).toBeNull()
    expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
  })

  it('replaces an existing merge-method request with squash under the pending check', async () => {
    const data = fixture()
    data.pull.auto_merge = { merge_method: 'merge' }
    await reconcilePull(fakeApi(data), repo, 1, options)
    const mutations = writes(data)
    expect(String(mutations[1].body.query)).toContain('disablePullRequestAutoMerge')
    expect(String(mutations[2].body.query)).toContain('enablePullRequestAutoMerge')
    expect(data.pull.auto_merge?.merge_method).toBe('squash')
  })
  it('withdraws previously armed native auto-merge when opted out', async () => {
    const data = fixture()
    data.pull.auto_merge = { merge_method: 'squash' }
    data.pull.labels = []
    await reconcilePull(fakeApi(data), repo, 1, options)
    expect(data.pull.auto_merge).toBeNull()
    expect(
      writes(data).some(call => String(call.body.query).includes('disablePullRequestAutoMerge'))
    ).toBe(true)
  })

  it('withdraws acceptance when a new commit arrives after enrollment', async () => {
    const data = fixture()
    data.onArm = () => {
      data.pull.head.sha = 'b'.repeat(40)
    }
    await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow(
      'changed before acceptance'
    )
    expect(data.pull.auto_merge).toBeNull()
    expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
  })

  it('publishes failure after a GraphQL error, even when auto-merge withdrawal also fails', async () => {
    const data = fixture()
    data.pull.auto_merge = { merge_method: 'squash' }
    data.graphError = true
    data.failDisable = true
    await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow(
      'disable unavailable'
    )
    expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
  })

  it('rejects a check from the wrong GitHub App', async () => {
    const data = fixture()
    data.appId = 9
    await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow(
      'configured GitHub App'
    )
    expect(data.pull.auto_merge).toBeNull()
  })

  it('requires the named App-bound check, strict updates, and thread resolution', async () => {
    const request = vi.fn().mockResolvedValue([
      {
        parameters: {
          required_status_checks: [{ context: 'ai-review-accepted', integration_id: 9 }],
        },
      },
    ])
    expect(await hasRequiredGate({ request }, repo)).toBe(false)
  })
})

describe('complete review evidence', () => {
  it.each([2, 3, 4])('withholds acceptance when evidence changes at snapshot %i', async phase => {
    const data = fixture()
    const source = fakeApi(data)
    let reads = 0
    const api: GitHubApi = {
      async request<T>(path: string, method?: string, body?: unknown) {
        if (path.endsWith('/pulls/1') && ++reads === phase) {
          if (phase === 2) data.pull.head.sha = 'b'.repeat(40)
          else data.comments[0].body = 'Review running'
        }
        return source.request<T>(path, method, body)
      },
    }
    await expect(reconcilePull(api, repo, 1, options)).rejects.toThrow('changed')
    expect(data.pull.auto_merge).toBeNull()
    expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
  })
  it('collects every comments page and every thread page', async () => {
    const data = fixture()
    data.comments = Array.from({ length: 100 }, (_, id) => ({ ...data.comments[0], id }))
    data.threadPages = true
    const result = await readSnapshot(fakeApi(data), repo, 1)
    expect(result.comments).toHaveLength(100)
    expect(result.unresolvedThreads).toBe(1)
    expect(data.calls.some(call => call.path.includes('/comments?per_page=100&page=2'))).toBe(true)
  })

  it('rejects malformed or unbounded REST pagination', async () => {
    await expect(allPages({ request: vi.fn().mockResolvedValue({}) }, '/list')).rejects.toThrow(
      'collection'
    )
    await expect(
      allPages({ request: vi.fn().mockResolvedValue(Array(100).fill(0)) }, '/list')
    ).rejects.toThrow('pagination limit')
  })
})

describe('pending-check failure recovery', () => {
  it.each(['API failure', 'wrong App'])(
    'withdraws existing enrollment after %s before evidence is read',
    async failure => {
      const data = fixture()
      data.pull.auto_merge = { merge_method: 'squash' }
      data.pull.labels.push({ name: 'automerge:hold' })
      data.failPending = failure === 'API failure'
      if (failure === 'wrong App') data.appId = 9
      await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow()
      expect(data.pull.auto_merge).toBeNull()
      expect(
        writes(data).some(call => String(call.body.query).includes('disablePullRequestAutoMerge'))
      ).toBe(true)
      expect(writes(data).some(call => call.body.conclusion === 'success')).toBe(false)
      if (failure === 'wrong App') expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
    }
  )
})

describe('concurrent enrollment changes', () => {
  it('withdraws enrollment that became active after the initial PR read', async () => {
    const data = fixture()
    data.pull.labels = []
    const source = fakeApi(data)
    let reads = 0
    const api: GitHubApi = {
      async request<T>(path: string, method?: string, body?: unknown) {
        if (path.endsWith('/pulls/1') && ++reads === 2)
          data.pull.auto_merge = { merge_method: 'squash' }
        return source.request<T>(path, method, body)
      },
    }
    await reconcilePull(api, repo, 1, options)
    expect(data.pull.auto_merge).toBeNull()
    expect(
      writes(data).some(call => String(call.body.query).includes('disablePullRequestAutoMerge'))
    ).toBe(true)
  })

  it('withdraws a successful enable whose response was lost', async () => {
    const data = fixture()
    data.loseEnableResponse = true
    await expect(reconcilePull(fakeApi(data), repo, 1, options)).rejects.toThrow('response lost')
    expect(data.pull.auto_merge).toBeNull()
    expect(writes(data).at(-1)?.body.conclusion).toBe('failure')
  })
})

describe('restricted GitHub transport', () => {
  it('sends credentials only to GitHub, rejects redirects, and reports errors without response bodies', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('{"ok":true}'))
    vi.stubGlobal('fetch', mock)
    try {
      const api = githubApi('synthetic-token')
      expect(await api.request('/test', 'POST', { value: 1 })).toEqual({ ok: true })
      expect(mock).toHaveBeenCalledWith(
        'https://api.github.com/test',
        expect.objectContaining({ redirect: 'error', body: '{"value":1}' })
      )
      await expect(api.request('https://example.com')).rejects.toThrow('relative')
      mock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      expect(await api.request('/empty')).toBeUndefined()
      mock.mockResolvedValueOnce(new Response('secret detail', { status: 403 }))
      await expect(api.request('/denied')).rejects.toThrow('HTTP 403')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
