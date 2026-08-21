import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAspireBootstrapError } from './checkAspireBootstrap'

describe('Aspire bootstrap preflight', () => {
  it('passes when the generated SDK and AppHost dependencies exist', () => {
    expect(getAspireBootstrapError('C:/repo', () => true)).toBeUndefined()
  })

  it('reports every missing prerequisite with the one-time setup command', () => {
    const error = getAspireBootstrapError('C:/repo', () => false)

    expect(error).toContain('ERROR: Aspire AppHost is not bootstrapped.')
    expect(error).toContain('aspire-apphost/.aspire/modules/aspire.mts')
    expect(error).toContain('aspire-apphost/node_modules/vscode-jsonrpc/package.json')
    expect(error).toContain('bun run setup')
    expect(error).toContain('Warm typechecks only perform this fast preflight.')
  })

  it('reports only the prerequisite that is missing', () => {
    const appHostDependency = resolve(
      'C:/repo',
      'aspire-apphost/node_modules/vscode-jsonrpc/package.json'
    )
    const error = getAspireBootstrapError('C:/repo', path => path !== appHostDependency)

    expect(error).not.toContain('generated Aspire TypeScript SDK')
    expect(error).toContain('Aspire AppHost dependencies')
  })
})
