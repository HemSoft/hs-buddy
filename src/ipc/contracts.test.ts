import { describe, it, expect } from 'vitest'
import {
  IPC_INVOKE,
  IPC_SEND,
  IPC_PUSH,
  ALL_INVOKE_CHANNELS,
  ALL_SEND_CHANNELS,
  ALL_PUSH_CHANNELS,
  ALL_CHANNELS,
  CONFIG_UI_KEYS,
  CONFIG_UI_CHANNELS,
  type IpcInvokeChannel,
  type IpcSendChannel,
  type IpcPushChannel,
  type ConfigGetChannel,
  type ConfigSetChannel,
} from './contracts'

// ─── Type-level assertions ────────────────────────────────────────────────
// These fail at compile time if the types drift.

type Expect<T extends true> = T
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

// Verify IPC_INVOKE values are the IpcInvokeChannel union
type _AssertInvokeValues = Expect<
  Equal<(typeof IPC_INVOKE)[keyof typeof IPC_INVOKE], IpcInvokeChannel>
>

// Verify IPC_SEND values are the IpcSendChannel union
type _AssertSendValues = Expect<Equal<(typeof IPC_SEND)[keyof typeof IPC_SEND], IpcSendChannel>>

// Verify IPC_PUSH values are the IpcPushChannel union
type _AssertPushValues = Expect<Equal<(typeof IPC_PUSH)[keyof typeof IPC_PUSH], IpcPushChannel>>

// Verify config channel types derive correctly from CONFIG_UI_KEYS
type _AssertConfigGet = Expect<
  Equal<ConfigGetChannel, `config:get-${(typeof CONFIG_UI_KEYS)[number]}`>
>
type _AssertConfigSet = Expect<
  Equal<ConfigSetChannel, `config:set-${(typeof CONFIG_UI_KEYS)[number]}`>
>

// Suppress unused variable warnings for type assertions
void (0 as unknown as _AssertInvokeValues)
void (0 as unknown as _AssertSendValues)
void (0 as unknown as _AssertPushValues)
void (0 as unknown as _AssertConfigGet)
void (0 as unknown as _AssertConfigSet)

// ─── Runtime contract tests ───────────────────────────────────────────────

describe('IPC Contract Registry', () => {
  describe('channel uniqueness', () => {
    it('has no duplicate invoke channels', () => {
      const unique = new Set(ALL_INVOKE_CHANNELS)
      expect(unique.size).toBe(ALL_INVOKE_CHANNELS.length)
    })

    it('has no duplicate send channels', () => {
      const unique = new Set(ALL_SEND_CHANNELS)
      expect(unique.size).toBe(ALL_SEND_CHANNELS.length)
    })

    it('has no duplicate push channels', () => {
      const unique = new Set(ALL_PUSH_CHANNELS)
      expect(unique.size).toBe(ALL_PUSH_CHANNELS.length)
    })

    it('has no channel name collisions across transport types', () => {
      const all = [
        ...ALL_INVOKE_CHANNELS,
        ...ALL_SEND_CHANNELS,
        ...ALL_PUSH_CHANNELS,
        ...CONFIG_UI_CHANNELS,
      ]
      const unique = new Set(all)
      expect(unique.size).toBe(all.length)
    })
  })

  describe('channel naming conventions', () => {
    it('invoke channels use domain:action format', () => {
      for (const channel of ALL_INVOKE_CHANNELS) {
        expect(channel).toMatch(/^[\w-]+:[\w-]+$/)
      }
    })

    it('send channels use either domain:action or kebab-case format', () => {
      for (const channel of ALL_SEND_CHANNELS) {
        expect(channel).toMatch(/^[\w-]+(:[a-z][\w-]*)?$/)
      }
    })

    it('push channels use either domain:action or kebab-case format', () => {
      for (const channel of ALL_PUSH_CHANNELS) {
        expect(channel).toMatch(/^[\w-]+(:[a-z][\w-]*)?$/)
      }
    })
  })

  describe('config UI channels', () => {
    it('generates get and set pairs for each UI key', () => {
      expect(CONFIG_UI_CHANNELS.length).toBe(CONFIG_UI_KEYS.length * 2)
    })

    it('all config UI get channels follow config:get-{key} pattern', () => {
      const getChannels = CONFIG_UI_CHANNELS.filter(ch => ch.startsWith('config:get-'))
      expect(getChannels.length).toBe(CONFIG_UI_KEYS.length)
      for (const key of CONFIG_UI_KEYS) {
        expect(getChannels).toContain(`config:get-${key}`)
      }
    })

    it('all config UI set channels follow config:set-{key} pattern', () => {
      const setChannels = CONFIG_UI_CHANNELS.filter(ch => ch.startsWith('config:set-'))
      expect(setChannels.length).toBe(CONFIG_UI_KEYS.length)
      for (const key of CONFIG_UI_KEYS) {
        expect(setChannels).toContain(`config:set-${key}`)
      }
    })
  })

  describe('expected channel counts', () => {
    it('has the expected number of invoke channels', () => {
      // If this fails, a channel was added or removed without updating contracts.
      // Update the contract AND this count when adding new IPC handlers.
      expect(ALL_INVOKE_CHANNELS.length).toBe(93)
    })

    it('has the expected number of send channels', () => {
      expect(ALL_SEND_CHANNELS.length).toBe(6)
    })

    it('has the expected number of push channels', () => {
      expect(ALL_PUSH_CHANNELS.length).toBe(9)
    })

    it('total channel count is sum of all categories plus config UI channels', () => {
      expect(ALL_CHANNELS.length).toBe(
        ALL_INVOKE_CHANNELS.length +
          ALL_SEND_CHANNELS.length +
          ALL_PUSH_CHANNELS.length +
          CONFIG_UI_CHANNELS.length
      )
    })
  })

  describe('domain coverage', () => {
    it('github domain has all expected channels', () => {
      const githubChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('github:'))
      expect(githubChannels).toContain('github:get-cli-token')
      expect(githubChannels).toContain('github:get-active-account')
      expect(githubChannels).toContain('github:get-copilot-usage')
      expect(githubChannels).toContain('github:get-copilot-quota')
      expect(githubChannels).toContain('github:get-copilot-budget')
      expect(githubChannels).toContain('github:get-copilot-member-usage')
      expect(githubChannels).toContain('github:get-user-premium-requests')
      expect(githubChannels).toContain('github:switch-account')
      expect(githubChannels).toContain('github:collect-copilot-snapshots')
      expect(githubChannels.length).toBe(9)
    })

    it('terminal domain has all expected invoke channels', () => {
      const terminalInvoke = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('terminal:'))
      expect(terminalInvoke).toContain('terminal:spawn')
      expect(terminalInvoke).toContain('terminal:attach')
      expect(terminalInvoke).toContain('terminal:kill')
      expect(terminalInvoke).toContain('terminal:resolve-repo-path')
      expect(terminalInvoke.length).toBe(4)
    })

    it('terminal domain has all expected send channels', () => {
      const terminalSend = ALL_SEND_CHANNELS.filter(ch => ch.startsWith('terminal:'))
      expect(terminalSend).toContain('terminal:write')
      expect(terminalSend).toContain('terminal:resize')
      expect(terminalSend.length).toBe(2)
    })

    it('terminal domain has all expected push channels', () => {
      const terminalPush = ALL_PUSH_CHANNELS.filter(ch => ch.startsWith('terminal:'))
      expect(terminalPush).toContain('terminal:data')
      expect(terminalPush).toContain('terminal:exit')
      expect(terminalPush).toContain('terminal:cwd-changed')
      expect(terminalPush.length).toBe(3)
    })

    it('copilot domain has all expected channels', () => {
      const copilotChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('copilot:'))
      expect(copilotChannels).toContain('copilot:execute')
      expect(copilotChannels).toContain('copilot:cancel')
      expect(copilotChannels).toContain('copilot:active-count')
      expect(copilotChannels).toContain('copilot:list-models')
      expect(copilotChannels).toContain('copilot:chat-send')
      expect(copilotChannels).toContain('copilot:chat-abort')
      expect(copilotChannels).toContain('copilot:quick-prompt')
      expect(copilotChannels.length).toBe(7)
    })

    it('ralph domain has all expected invoke channels', () => {
      const ralphInvoke = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('ralph:'))
      expect(ralphInvoke).toContain('ralph:launch')
      expect(ralphInvoke).toContain('ralph:stop')
      expect(ralphInvoke).toContain('ralph:list')
      expect(ralphInvoke).toContain('ralph:get-status')
      expect(ralphInvoke).toContain('ralph:get-config')
      expect(ralphInvoke).toContain('ralph:get-scripts-path')
      expect(ralphInvoke).toContain('ralph:list-templates')
      expect(ralphInvoke).toContain('ralph:select-directory')
      expect(ralphInvoke.length).toBe(8)
    })

    it('ralph domain has status-update push channel', () => {
      const ralphPush = ALL_PUSH_CHANNELS.filter(ch => ch.startsWith('ralph:'))
      expect(ralphPush).toContain('ralph:status-update')
      expect(ralphPush.length).toBe(1)
    })

    it('config domain has all expected non-UI invoke channels', () => {
      const configChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('config:'))
      expect(configChannels).toContain('config:get-assistant-open')
      expect(configChannels).toContain('config:set-assistant-open')
      expect(configChannels).toContain('config:get-terminal-open')
      expect(configChannels).toContain('config:set-terminal-open')
      expect(configChannels).toContain('config:get-config')
      expect(configChannels).toContain('config:get-store-path')
      expect(configChannels).toContain('config:reset')
      expect(configChannels).toContain('config:pick-audio-file')
      expect(configChannels).toContain('config:play-notification-sound')
    })

    it('tempo domain has all expected channels', () => {
      const tempoChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('tempo:'))
      expect(tempoChannels.length).toBe(10)
    })

    it('todoist domain has all expected channels', () => {
      const todoistChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('todoist:'))
      expect(todoistChannels.length).toBe(8)
    })

    it('crew domain has all expected channels', () => {
      const crewChannels = ALL_INVOKE_CHANNELS.filter(ch => ch.startsWith('crew:'))
      expect(crewChannels.length).toBe(10)
    })
  })

  describe('contract immutability', () => {
    it('IPC_INVOKE object is frozen (as const)', () => {
      // Verify the const assertion gives us literal types, not widened strings
      const sample: 'github:get-cli-token' = IPC_INVOKE.GITHUB_GET_CLI_TOKEN
      expect(sample).toBe('github:get-cli-token')
    })

    it('IPC_SEND object is frozen (as const)', () => {
      const sample: 'terminal:write' = IPC_SEND.TERMINAL_WRITE
      expect(sample).toBe('terminal:write')
    })

    it('IPC_PUSH object is frozen (as const)', () => {
      const sample: 'ralph:status-update' = IPC_PUSH.RALPH_STATUS_UPDATE
      expect(sample).toBe('ralph:status-update')
    })
  })
})
