import { describe, expect, it } from 'vitest'
import {
  normalizeCopilotEnterpriseUsersSnapshot,
  parseCopilotEnterpriseUsersContent,
} from './copilotEnterpriseUsers'

describe('normalizeCopilotEnterpriseUsersSnapshot', () => {
  it('normalizes CodexBar Copilot metrics into one row per enterprise user', () => {
    const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
      {
        GeneratedAtUtc: '2026-06-02T02:30:20.000Z',
        Enterprise: 'bertelsmann',
        Organization: 'Relias-Engineering',
        Year: 2026,
        Month: 6,
        Days: [1, 2],
        Users: [
          {
            User: 'no-usage-user',
            Success: true,
            Responses: [
              {
                Day: 1,
                Response: { usageItems: [] },
              },
            ],
          },
          {
            User: 'active-user',
            Success: true,
            Responses: [
              {
                Day: 1,
                Response: {
                  usageItems: [
                    {
                      model: 'Claude Opus 4.8',
                      grossQuantity: 10,
                      grossAmount: 0.1,
                      netAmount: 0,
                    },
                    {
                      model: 'Code Review model',
                      grossQuantity: 4,
                      grossAmount: 0.04,
                      netAmount: 0,
                    },
                  ],
                },
              },
              {
                Day: 2,
                Response: {
                  usageItems: [
                    {
                      model: 'Claude Opus 4.8',
                      grossQuantity: 5,
                      grossAmount: 0.05,
                      netAmount: 0,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        sourceFile: 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json',
        fileLastWriteTime: '2026-06-02T02:30:20.000Z',
      }
    )

    expect(snapshot.organization).toBe('Relias-Engineering')
    expect(snapshot.totalUsers).toBe(2)
    expect(snapshot.activeUsers).toBe(1)
    expect(snapshot.users.map(user => user.login)).toEqual(['active-user', 'no-usage-user'])
    expect(snapshot.users[0]).toMatchObject({
      grossQuantity: 19,
      grossAmount: 0.19,
      modelCount: 2,
      topModel: 'Claude Opus 4.8',
      topModelQuantity: 15,
    })
    expect(snapshot.users[0].sourceJson).toContain('"User": "active-user"')
    expect(snapshot.users[0].sourceJson).toContain('"Responses"')
    expect(snapshot.users[1]).toMatchObject({
      login: 'no-usage-user',
      grossQuantity: 0,
      topModel: null,
    })
  })

  it('uses file mtime when the metrics payload has no generated timestamp', () => {
    const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
      { Users: [] },
      {
        sourceFile: 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json',
        fileLastWriteTime: '2026-06-02T03:00:00.000Z',
      }
    )

    expect(snapshot.generatedAt).toBe('2026-06-02T03:00:00.000Z')
  })

  it('normalizes direct aggregate totals when usage items are absent', () => {
    const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
      {
        users: [
          {
            login: 'direct-user',
            grossQuantity: 42,
            grossAmount: 0.42,
            netAmount: 0.1,
            topModel: 'Claude Sonnet 4.5',
          },
        ],
      },
      {
        sourceFile: 'D:\\\\github\\\\HemSoft\\\\codexbar\\\\data\\\\copilot-metrics.json',
        fileLastWriteTime: '2026-06-02T03:00:00.000Z',
      }
    )

    expect(snapshot.users[0]).toMatchObject({
      login: 'direct-user',
      grossQuantity: 42,
      grossAmount: 0.42,
      netAmount: 0.1,
      modelCount: 1,
      topModel: 'Claude Sonnet 4.5',
      topModelQuantity: 42,
    })
  })

  it('ignores malformed usage entries and supports alternate usage key casing', () => {
    const snapshot = normalizeCopilotEnterpriseUsersSnapshot(
      {
        members: [
          {
            memberLogin: 'mixed-user',
            success: false,
            error_message: 'partial data',
            data: {
              Items: [
                null,
                'ignored',
                {
                  Model: 'Claude Opus 4.8',
                  GrossQuantity: 12,
                  GrossAmount: 0.12,
                  NetAmount: 0.03,
                },
                {
                  model: 'Zero Usage Model',
                  gross_quantity: 0,
                  gross_amount: 0,
                  net_amount: 0,
                },
              ],
            },
          },
        ],
      },
      {
        sourceFile: 'D:\\\\github\\\\HemSoft\\\\codexbar\\\\data\\\\copilot-metrics.json',
        fileLastWriteTime: '2026-06-02T03:00:00.000Z',
      }
    )

    expect(snapshot.users[0]).toMatchObject({
      login: 'mixed-user',
      grossQuantity: 12,
      grossAmount: 0.12,
      netAmount: 0.03,
      modelCount: 1,
      topModel: 'Claude Opus 4.8',
      topModelQuantity: 12,
      success: false,
      errorMessage: 'partial data',
    })
  })

  it('parses metrics content with a UTF-8 BOM', () => {
    expect(parseCopilotEnterpriseUsersContent('\uFEFF{"GeneratedAtUtc":"now","Users":[]}')).toEqual(
      {
        GeneratedAtUtc: 'now',
        Users: [],
      }
    )
  })
})
