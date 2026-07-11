import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import type { TerminalTab } from '../../../../shared/types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { buildWorktreeAgentRows } from './worktree-agent-rows'
import { selectSleepingAgentSessionRecordsForWorktree } from './worktree-agent-row-selectors'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = makePaneKey('tab-1', LEAF_ID)

function makeSleepingRecord(
  overrides: Partial<SleepingAgentSessionRecord> = {}
): SleepingAgentSessionRecord {
  return {
    paneKey: PANE_KEY,
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    agent: 'codex',
    providerSession: { key: 'session_id', id: 'codex-session-1' },
    prompt: 'hello',
    state: 'done',
    capturedAt: 30,
    updatedAt: 20,
    interrupted: true,
    terminalTitle: 'Codex',
    origin: 'terminal-close',
    ...overrides
  }
}

function makeTab(id: string): TerminalTab {
  return {
    id,
    worktreeId: 'wt-1',
    ptyId: null,
    title: 'Codex',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function makeLiveEntry(): AgentStatusEntry {
  return {
    paneKey: PANE_KEY,
    state: 'working',
    prompt: 'live task',
    updatedAt: 40,
    stateStartedAt: 40,
    stateHistory: [],
    agentType: 'codex',
    worktreeId: 'wt-1'
  }
}

describe('buildWorktreeAgentRows sleeping history', () => {
  it('renders terminal-close sleeping records as muted idle history without a live tab', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [],
      entries: [],
      retained: [],
      sleeping: [makeSleepingRecord()],
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      paneKey: PANE_KEY,
      rowSource: 'sleeping',
      state: 'idle',
      agentType: 'codex',
      startedAt: 20
    })
    expect(rows[0]?.entry).toMatchObject({
      paneKey: PANE_KEY,
      prompt: 'hello',
      interrupted: true,
      providerSession: { key: 'session_id', id: 'codex-session-1' }
    })
    expect(rows[0]?.tab.id).toBe('tab-1')
  })

  it('lets a live row win over a duplicate terminal-close sleeping record', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [makeLiveEntry()],
      retained: [],
      sleeping: [makeSleepingRecord()],
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.rowSource).toBe('live')
    expect(rows[0]?.entry.prompt).toBe('live task')
  })

  it('renders an automatic resume claim after the sleeping record is cleared', () => {
    const providerSession = { key: 'session_id' as const, id: 'codex-session-1' }

    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('resumed-tab')],
      entries: [],
      retained: [],
      sleeping: [],
      automaticAgentResumeClaimsByTabId: {
        'resumed-tab': {
          worktreeId: 'wt-1',
          launchAgent: 'codex',
          providerSession,
          prompt: 'hello',
          terminalTitle: 'Codex',
          capturedAt: 30,
          updatedAt: 20
        }
      },
      pendingStartupByTabId: {
        'resumed-tab': {
          command: 'codex resume codex-session-1',
          launchAgent: 'codex',
          resumeProviderSession: providerSession,
          showSessionRestoredBanner: true
        }
      },
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      paneKey: 'resuming:resumed-tab',
      rowSource: 'resuming',
      state: 'idle',
      agentType: 'codex',
      startedAt: 20
    })
    expect(rows[0]?.entry).toMatchObject({
      paneKey: 'resuming:resumed-tab',
      prompt: 'hello',
      providerSession
    })
    expect(rows[0]?.tab.id).toBe('resumed-tab')
  })

  it('lets a live row win over an automatic resume claim for the same tab', () => {
    const providerSession = { key: 'session_id' as const, id: 'codex-session-1' }
    const liveEntry = {
      ...makeLiveEntry(),
      paneKey: makePaneKey('resumed-tab', LEAF_ID),
      tabId: 'resumed-tab',
      providerSession
    }

    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('resumed-tab')],
      entries: [liveEntry],
      retained: [],
      automaticAgentResumeClaimsByTabId: {
        'resumed-tab': {
          worktreeId: 'wt-1',
          launchAgent: 'codex',
          providerSession,
          prompt: 'hello'
        }
      },
      now: 1_000
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.rowSource).toBe('live')
    expect(rows[0]?.paneKey).toBe(liveEntry.paneKey)
  })
})

describe('selectSleepingAgentSessionRecordsForWorktree', () => {
  it('selects only terminal-close history for the requested worktree', () => {
    const terminalClose = makeSleepingRecord()
    const worktreeSleep = makeSleepingRecord({
      paneKey: makePaneKey('tab-2', LEAF_ID),
      tabId: 'tab-2',
      origin: 'worktree-sleep'
    })
    const otherWorktree = makeSleepingRecord({
      paneKey: makePaneKey('tab-3', LEAF_ID),
      tabId: 'tab-3',
      worktreeId: 'wt-2'
    })

    const selected = selectSleepingAgentSessionRecordsForWorktree(
      {
        tabsByWorktree: {},
        agentStatusByPaneKey: {},
        migrationUnsupportedByPtyId: {},
        retainedAgentsByPaneKey: {},
        sleepingAgentSessionsByPaneKey: {
          [terminalClose.paneKey]: terminalClose,
          [worktreeSleep.paneKey]: worktreeSleep,
          [otherWorktree.paneKey]: otherWorktree
        }
      },
      'wt-1'
    )

    expect(selected).toEqual([terminalClose])
  })
})
