import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createPRDetailViewId, type PRDetailSection } from '../src/utils/prDetailView'
import type { PullRequest } from '../src/types/pullRequest'
import { expect, test, waitForAppReady } from './fixtures'

const evidenceDirectory = process.env.BUDDY_UI_EVIDENCE_DIR

test.use({
  viewport: { width: 1440, height: 900 },
  video: evidenceDirectory ? 'on' : 'off',
})

const pr: PullRequest = {
  source: 'GitHub',
  repository: 'fixture-repository',
  org: 'test-org',
  id: 42,
  title: 'Verify assistant context for encoded PR routes',
  author: 'test-user',
  url: 'https://github.com/test-org/fixture-repository/pull/42',
  state: 'open',
  approvalCount: 0,
  assigneeCount: 0,
  iApproved: false,
  created: null,
  date: null,
}

test('assistant badge follows encoded PR routes and section changes', async ({ page }) => {
  // This journey tests route identity, not live PR content or paid inference.
  await page.route('https://api.github.com/repos/test-org/fixture-repository/**', route =>
    route.fulfill({ status: 404, json: { message: 'Isolated context fixture' } })
  )
  await page.route('https://api.github.com/graphql', route =>
    route.fulfill({ json: { data: { repository: { pullRequest: null } } } })
  )
  await waitForAppReady(page)
  await page.getByRole('button', { name: /Toggle Copilot Assistant/ }).click()
  await expect(page.locator('.assistant-panel')).toBeVisible()

  const sections: Array<PRDetailSection | null> = [null, 'checks', 'files-changed']
  for (const section of sections) {
    const viewId = createPRDetailViewId(pr, section)
    await page.evaluate(id => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: id } }))
    }, viewId)
    await expect(page.locator('.pr-detail-title-text')).toHaveText(pr.title)
    await expect(page.getByText('Loading feature…', { exact: true })).toHaveCount(0)
    const badge = page.locator('.assistant-context-badge')
    await expect(badge).toHaveText('Pull Request #42 in test-org/fixture-repository')
    await expect(badge).toHaveAttribute('title', 'Pull Request #42 in test-org/fixture-repository')
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0)
    if (evidenceDirectory) {
      mkdirSync(evidenceDirectory, { recursive: true })
      await page.screenshot({
        path: path.join(evidenceDirectory, `assistant-pr-${section ?? 'default'}.png`),
      })
    }
  }
})
