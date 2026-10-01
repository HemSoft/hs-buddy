import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkFileExists, listPRIssueComments } from './pr-mutations'

const transport = vi.hoisted(() => ({
  client: vi.fn(),
  paginate: vi.fn(),
  getContent: vi.fn(),
  listComments: vi.fn(),
}))
vi.mock('./shared', async importOriginal => ({
  ...(await importOriginal<typeof import('./shared')>()),
  getOctokitForOwner: transport.client,
}))
const config = { accounts: [] }
const owner = 'fixture-owner'
const repo = 'fixture-repository'
const path = '.github/CODEOWNERS'

beforeEach(() => {
  vi.resetAllMocks()
  transport.client.mockResolvedValue({
    paginate: transport.paginate,
    repos: { getContent: transport.getContent },
    issues: { listComments: transport.listComments },
  })
})

describe('public file existence lookup', () => {
  it('returns true and sends the exact repository path on success', async () => {
    transport.getContent.mockResolvedValue({ data: { sha: 'fixture-sha' } })
    expect(await checkFileExists(config, owner, repo, path)).toBe(true)
    expect(transport.client).toHaveBeenCalledWith(config, owner)
    expect(transport.getContent).toHaveBeenCalledExactlyOnceWith({ owner, repo, path })
  })

  it('returns false only for a 404', async () => {
    transport.getContent.mockRejectedValue({ status: 404 })
    expect(await checkFileExists(config, owner, repo, path)).toBe(false)
    expect(transport.getContent).toHaveBeenCalledExactlyOnceWith({ owner, repo, path })
  })

  it.each([403, 500, undefined])('rethrows the original error with status %s', async status => {
    const error = Object.assign(new Error('Fixture failure'), { status })
    transport.getContent.mockRejectedValue(error)
    await expect(checkFileExists(config, owner, repo, path)).rejects.toBe(error)
    expect(transport.getContent).toHaveBeenCalledTimes(1)
  })
})

describe('public PR issue comment mapping', () => {
  it.each([
    {
      name: 'user and body',
      user: { login: 'fixture-user' },
      body: 'A useful comment',
      expectedUser: { login: 'fixture-user' },
      expectedBody: 'A useful comment',
    },
    {
      name: 'absent user with body',
      user: null,
      body: 'A bot comment',
      expectedUser: null,
      expectedBody: 'A bot comment',
    },
    {
      name: 'user with empty body',
      user: { login: 'fixture-user' },
      body: '',
      expectedUser: { login: 'fixture-user' },
      expectedBody: '',
    },
    {
      name: 'missing user and body',
      user: undefined,
      body: undefined,
      expectedUser: null,
      expectedBody: '',
    },
    { name: 'null body', user: null, body: null, expectedUser: null, expectedBody: '' },
  ])('preserves fields for $name', async ({ user, body, expectedUser, expectedBody }) => {
    const dates = { created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T13:00:00Z' }
    transport.paginate.mockResolvedValue([{ id: 123, user, body, ...dates }])
    expect(await listPRIssueComments(config, owner, repo, 42)).toEqual([
      { id: 123, user: expectedUser, body: expectedBody, ...dates },
    ])
    expect(transport.paginate).toHaveBeenCalledExactlyOnceWith(transport.listComments, {
      owner,
      repo,
      issue_number: 42,
      per_page: 100,
    })
  })

  it('returns an empty list for no comments', async () => {
    transport.paginate.mockResolvedValue([])
    expect(await listPRIssueComments(config, owner, repo, 42)).toEqual([])
  })
})
