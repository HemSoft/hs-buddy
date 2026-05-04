import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('settings', () => {
  test('get returns defaults when no document exists', async () => {
    const t = convexTest(schema, modules)
    const settings = await t.query(api.settings.get)
    expect(settings.key).toBe('default')
    expect(settings.pr.refreshInterval).toBe(15)
    expect(settings.pr.autoRefresh).toBe(true)
    expect(settings.pr.recentlyMergedDays).toBe(7)
  })

  test('updatePR creates settings document on first call', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.settings.updatePR, { refreshInterval: 30 })
    expect(id).toBeTruthy()

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(30)
    expect(settings.pr.autoRefresh).toBe(true)
  })

  test('updatePR merges with existing PR settings', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updatePR, { refreshInterval: 10 })
    await t.mutation(api.settings.updatePR, { autoRefresh: false })

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(10)
    expect(settings.pr.autoRefresh).toBe(false)
  })

  test('updateCopilot creates settings document on first call', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateCopilot, { model: 'gpt-4' })

    const settings = await t.query(api.settings.get)
    expect(settings.copilot?.model).toBe('gpt-4')
  })

  test('updateCopilot merges with existing copilot settings', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateCopilot, { model: 'claude', ghAccount: 'user1' })
    await t.mutation(api.settings.updateCopilot, { premiumModel: 'opus' })

    const settings = await t.query(api.settings.get)
    expect(settings.copilot?.model).toBe('claude')
    expect(settings.copilot?.ghAccount).toBe('user1')
    expect(settings.copilot?.premiumModel).toBe('opus')
  })

  test('reset sets defaults when no existing document', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.reset)

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(15)
    expect(settings.pr.autoRefresh).toBe(true)
  })

  test('reset overwrites existing settings with defaults', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updatePR, { refreshInterval: 99 })
    await t.mutation(api.settings.reset)

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(15)
  })

  test('updateViewMode creates settings on first call', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateViewMode, { pageKey: 'prs', mode: 'list' })

    const settings = await t.query(api.settings.get)
    expect(settings.viewModes?.prs).toBe('list')
  })

  test('updateViewMode merges view modes', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateViewMode, { pageKey: 'prs', mode: 'card' })
    await t.mutation(api.settings.updateViewMode, { pageKey: 'repos', mode: 'list' })

    const settings = await t.query(api.settings.get)
    expect(settings.viewModes?.prs).toBe('card')
    expect(settings.viewModes?.repos).toBe('list')
  })

  test('updateTerminalPanelHeight creates settings on first call', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateTerminalPanelHeight, { height: 300 })

    const settings = await t.query(api.settings.get)
    expect(settings.terminalPanelHeight).toBe(300)
  })

  test('updateTerminalPanelHeight updates existing settings', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateTerminalPanelHeight, { height: 200 })
    await t.mutation(api.settings.updateTerminalPanelHeight, { height: 400 })

    const settings = await t.query(api.settings.get)
    expect(settings.terminalPanelHeight).toBe(400)
  })

  test('updateTerminalTabs persists terminal tab configurations', async () => {
    const t = convexTest(schema, modules)
    const tabs = [{ title: 'Main', cwd: '/home/user', repoSlug: 'org/repo', color: '#ff0000' }]
    await t.mutation(api.settings.updateTerminalTabs, { tabs })

    const settings = await t.query(api.settings.get)
    expect(settings.terminalTabs).toHaveLength(1)
    expect(settings.terminalTabs?.[0].title).toBe('Main')
    expect(settings.terminalTabs?.[0].color).toBe('#ff0000')
  })

  test('updateTerminalTabs replaces all tabs on subsequent calls', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updateTerminalTabs, {
      tabs: [
        { title: 'A', cwd: '/a' },
        { title: 'B', cwd: '/b' },
      ],
    })
    await t.mutation(api.settings.updateTerminalTabs, {
      tabs: [{ title: 'C', cwd: '/c' }],
    })

    const settings = await t.query(api.settings.get)
    expect(settings.terminalTabs).toHaveLength(1)
    expect(settings.terminalTabs?.[0].title).toBe('C')
  })

  test('initFromMigration creates settings if none exist', async () => {
    const t = convexTest(schema, modules)
    const pr = { refreshInterval: 20, autoRefresh: false, recentlyMergedDays: 14 }
    await t.mutation(api.settings.initFromMigration, { pr })

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(20)
    expect(settings.pr.autoRefresh).toBe(false)
    expect(settings.pr.recentlyMergedDays).toBe(14)
  })

  test('initFromMigration is a no-op when settings already exist', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.settings.updatePR, { refreshInterval: 5 })
    await t.mutation(api.settings.initFromMigration, {
      pr: { refreshInterval: 99, autoRefresh: false, recentlyMergedDays: 30 },
    })

    const settings = await t.query(api.settings.get)
    expect(settings.pr.refreshInterval).toBe(5)
  })
})
