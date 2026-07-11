import { describe, expect, it } from 'vitest'
import { parseWorkspaceSession } from './workspace-session-schema'

describe('parseWorkspaceSession terminal-close sleeping agents', () => {
  it('preserves terminal-close origin across hydration', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sleepingAgentSessionsByPaneKey: {
        'tab1:pane-1': {
          paneKey: 'tab1:pane-1',
          tabId: 'tab1',
          worktreeId: 'wt',
          agent: 'codex',
          providerSession: { key: 'session_id', id: 'codex-session' },
          prompt: 'continue',
          state: 'done',
          capturedAt: 10,
          updatedAt: 9,
          interrupted: true,
          origin: 'terminal-close'
        }
      }
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sleepingAgentSessionsByPaneKey?.['tab1:pane-1']?.origin).toBe(
        'terminal-close'
      )
    }
  })
})
