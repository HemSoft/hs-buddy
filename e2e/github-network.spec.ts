import { test, expect, waitForAppReady } from './fixtures'

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'electron-cdp', 'Browser network fixture contract')
  await waitForAppReady(page)
})

test('renders deterministic repositories and serves REST and GraphQL through the real client', async ({
  page,
}) => {
  await page.locator('.activity-bar [aria-label="GitHub"]').click()
  await expect(page.getByText('test-org', { exact: true }).first()).toBeVisible()
  await page
    .locator('.sidebar-item')
    .filter({ has: page.getByText('test-org', { exact: true }) })
    .locator('.sidebar-item-chevron')
    .click()
  await expect(page.getByText('fixture-repository', { exact: true }).first()).toBeVisible()
  const graphqlResponse = page.waitForResponse('https://api.github.com/graphql')
  const result = await page.evaluate(async () => {
    const { GitHubClient } = await import('../src/api/github/client')
    const client = new GitHubClient({ accounts: [{ username: 'test-user', org: 'test-org' }] })
    return { repos: await client.fetchOrgRepos('test-org'), prs: await client.fetchMyPRs() }
  })
  expect(result.repos.repos).toEqual([
    expect.objectContaining({
      name: 'fixture-repository',
      fullName: 'test-org/fixture-repository',
    }),
  ])
  expect(result.repos.authenticatedAs).toBe('test-user')
  expect(result.prs).toEqual([])
  expect((await graphqlResponse).status()).toBe(200)
})

for (const failure of ['401', 'network'] as const) {
  test(`reports intentional ${failure} failure and recovers`, async ({ page }) => {
    const endpoint = 'https://api.github.com/orgs/test-org/repos*'
    await page.route(endpoint, route =>
      failure === '401'
        ? route.fulfill({ status: 401, json: { message: 'Intentional E2E unauthorized response' } })
        : route.abort('internetdisconnected')
    )
    const error = await page.evaluate(async () => {
      const { GitHubClient } = await import('../src/api/github/client')
      const client = new GitHubClient({ accounts: [{ username: 'test-user', org: 'test-org' }] })
      try {
        await client.fetchOrgRepos('test-org')
        return null
      } catch (error: unknown) {
        const failure = error as Error & { cause: { status: number; message: string } }
        return {
          message: failure.message,
          status: failure.cause.status,
          cause: failure.cause.message,
        }
      }
    })
    expect(error?.message).toContain("Could not fetch repos for 'test-org'")
    expect(error?.status).toBe(failure === '401' ? 401 : 500)
    expect(error?.cause).toBe(
      failure === '401' ? 'Intentional E2E unauthorized response' : 'Failed to fetch'
    )
    await page.unroute(endpoint)
    const repos = await page.evaluate(async () => {
      const { GitHubClient } = await import('../src/api/github/client')
      return new GitHubClient({
        accounts: [{ username: 'test-user', org: 'test-org' }],
      }).fetchOrgRepos('test-org')
    })
    expect(repos.repos[0]?.name).toBe('fixture-repository')
    await expect(page.locator('.activity-bar')).toBeVisible()
  })
}
