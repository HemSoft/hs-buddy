import type { BrowserContext, Request } from '@playwright/test'

const avatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const organization = { login: 'test-org', name: 'Test Organization', avatar_url: avatar }
const user = { login: 'test-user', name: 'Test User', avatar_url: avatar }
const repository = {
  id: 1,
  name: 'fixture-repository',
  full_name: 'test-org/fixture-repository',
  owner: organization,
  description: 'Deterministic browser E2E repository',
  html_url: 'https://github.com/test-org/fixture-repository',
  private: false,
  archived: false,
  fork: false,
  language: 'TypeScript',
  stargazers_count: 0,
  forks_count: 0,
  open_issues_count: 0,
  default_branch: 'main',
  pushed_at: '2020-01-01T00:00:00Z',
  updated_at: '2020-01-01T00:00:00Z',
}

function isViewerPRs(request: Request): boolean {
  try {
    const body = request.postDataJSON() as { query?: unknown } | null
    return typeof body?.query === 'string' && /^\s*query ViewerPRs\(/.test(body.query)
  } catch (_: unknown) {
    return false
  }
}

function diagnosticUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}`
}

function githubResponse(request: Request): unknown {
  const url = new URL(request.url())
  if (url.origin !== 'https://api.github.com') return undefined
  if (request.method() === 'POST' && url.pathname === '/graphql') {
    // Only the application's empty-search fallback is part of this fixture.
    if (isViewerPRs(request)) {
      return {
        data: {
          viewer: {
            pullRequests: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      }
    }
    return undefined
  }
  if (request.method() !== 'GET') return undefined
  const responses: Record<string, unknown> = {
    '/orgs/test-org': organization,
    '/users/test-org': organization,
    '/users/test-user': user,
    '/user': user,
    '/orgs/test-org/repos': [repository],
    '/orgs/test-org/members': [],
    '/orgs/test-org/teams': [],
  }
  if (url.pathname === '/search/issues' && url.searchParams.get('q')?.includes('org:test-org')) {
    return { total_count: 0, incomplete_results: false, items: [] }
  }
  return responses[url.pathname]
}

function shellResponse(request: Request): unknown {
  const url = new URL(request.url())
  if (
    request.method() === 'GET' &&
    url.origin === 'https://api.open-meteo.com' &&
    url.pathname === '/v1/forecast'
  ) {
    return {
      current: { temperature_2m: 72, relative_humidity_2m: 45, weather_code: 1, wind_speed_10m: 8 },
      daily: {
        time: ['2026-01-01', '2026-01-02', '2026-01-03'],
        temperature_2m_max: [75, 78, 80],
        temperature_2m_min: [55, 58, 60],
        weather_code: [1, 2, 3],
      },
    }
  }
  return githubResponse(request)
}

/** Only Vite may reach a server. Unknown REST, GraphQL and other external URLs fail closed. */
export async function installGitHubNetwork(context: BrowserContext, baseURL: string) {
  const appOrigin = new URL(baseURL).origin
  const unexpected: string[] = []
  await context.route('**/*', async route => {
    const request = route.request()
    if (new URL(request.url()).origin === appOrigin) {
      await route.continue()
      return
    }
    const json = shellResponse(request)
    if (json !== undefined) {
      await route.fulfill({ json })
      return
    }
    unexpected.push(`${request.method()} ${diagnosticUrl(request.url())}`)
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url())
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
    if (url.origin === appOrigin) {
      socket.connectToServer()
      return
    }
    unexpected.push(`WebSocket ${diagnosticUrl(socket.url())}`)
    socket.close()
  })
  return unexpected
}
