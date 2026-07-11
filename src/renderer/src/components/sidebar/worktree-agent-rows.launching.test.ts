import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../../shared/types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { buildWorktreeAgentRows } from './worktree-agent-rows'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

function makeTab(id: string, overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id,
    worktreeId: 'wt-1',
    ptyId: null,
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 10,
    ...overrides
  }
}

function makeSingleLayout(): TerminalLayoutSnapshot {
  return {
    root: { type: 'leaf', leafId: LEAF_ID },
    activeLeafId: LEAF_ID,
    expandedLeafId: null
  }
}

function makeLiveEntry(tabId: string): AgentStatusEntry {
  return {
    paneKey: makePaneKey(tabId, LEAF_ID),
    state: 'working',
    prompt: 'existing live prompt',
    updatedAt: 20,
    stateStartedAt: 20,
    stateHistory: [],
    agentType: 'codex',
    worktreeId: 'wt-1',
    tabId
  }
}

describe('buildWorktreeAgentRows launching rows', () => {
  it('renders a launched agent tab before prompt or hook status exists', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-launch', { launchAgent: 'codex' })],
      entries: [],
      retained: [],
      pendingStartupByTabId: {
        'tab-launch': {
          command: 'codex',
          launchAgent: 'codex'
        }
      },
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      paneKey: 'launching:tab-launch',
      rowSource: 'launching',
      state: 'working',
      agentType: 'codex',
      startedAt: 10
    })
    expect(rows[0]?.entry).toMatchObject({
      prompt: 'Starting Codex',
      lastAssistantMessage: 'Starting',
      tabId: 'tab-launch'
    })
  })

  it('keeps the launched agent row visible after startup delivery is consumed', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-launch', { launchAgent: 'codex' })],
      entries: [],
      retained: [],
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      paneKey: 'launching:tab-launch',
      rowSource: 'launching',
      state: 'idle',
      agentType: 'codex'
    })
    expect(rows[0]?.entry).toMatchObject({
      prompt: 'Codex',
      lastAssistantMessage: 'Idle'
    })
  })

  it('uses the stable pane key once the terminal layout exists', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-launch', { launchAgent: 'codex' })],
      entries: [],
      retained: [],
      terminalLayoutsByTabId: {
        'tab-launch': makeSingleLayout()
      },
      now: 1_000
    })

    expect(rows.map((row) => row.paneKey)).toEqual([makePaneKey('tab-launch', LEAF_ID)])
  })

  it('lets a live row win over the launched-tab placeholder', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-launch', { launchAgent: 'codex' })],
      entries: [makeLiveEntry('tab-launch')],
      retained: [],
      terminalLayoutsByTabId: {
        'tab-launch': makeSingleLayout()
      },
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.rowSource).toBe('live')
    expect(rows[0]?.entry.prompt).toBe('existing live prompt')
  })

  it('lets an automatic resume row win over the launched-tab placeholder', () => {
    const providerSession = { key: 'session_id' as const, id: 'codex-session-1' }
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-launch', { launchAgent: 'codex' })],
      entries: [],
      retained: [],
      automaticAgentResumeClaimsByTabId: {
        'tab-launch': {
          worktreeId: 'wt-1',
          launchAgent: 'codex',
          providerSession,
          prompt: 'resume this'
        }
      },
      pendingStartupByTabId: {
        'tab-launch': {
          command: 'codex resume codex-session-1',
          launchAgent: 'codex',
          resumeProviderSession: providerSession
        }
      },
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      paneKey: 'resuming:tab-launch',
      rowSource: 'resuming'
    })
  })
})
