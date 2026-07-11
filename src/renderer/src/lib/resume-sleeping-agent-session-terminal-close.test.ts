import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { useAppStore } from '@/store'
import {
  resumeSleepingAgentSession,
  resumeSleepingAgentSessionsForWorktree
} from './resume-sleeping-agent-session'

const initialAppStoreState = useAppStore.getState()

afterEach(() => {
  vi.unstubAllGlobals()
  useAppStore.setState(initialAppStoreState, true)
})

function makeRecord(
  overrides: Partial<SleepingAgentSessionRecord> = {}
): SleepingAgentSessionRecord {
  return {
    paneKey: 'tab-1:leaf-1',
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    agent: 'codex',
    providerSession: { key: 'session_id', id: 'codex-session-1' },
    prompt: 'hello',
    state: 'done',
    capturedAt: 30,
    updatedAt: 20,
    interrupted: true,
    origin: 'terminal-close',
    ...overrides
  }
}

describe('terminal-close sleeping agent resume', () => {
  it('does not auto-resume terminal-close records during worktree activation', () => {
    const record = makeRecord()
    useAppStore.setState({
      tabsByWorktree: { 'wt-1': [] },
      sleepingAgentSessionsByPaneKey: { [record.paneKey]: record }
    } as never)

    const launched = resumeSleepingAgentSessionsForWorktree('wt-1')

    expect(launched).toBe(0)
    const state = useAppStore.getState()
    expect(state.tabsByWorktree['wt-1']).toEqual([])
    expect(state.sleepingAgentSessionsByPaneKey[record.paneKey]).toBe(record)
  })

  it('explicitly resumes a terminal-close record by pane key and clears it', () => {
    const record = makeRecord()
    useAppStore.setState({
      tabsByWorktree: { 'wt-1': [] },
      sleepingAgentSessionsByPaneKey: { [record.paneKey]: record }
    } as never)

    const launched = resumeSleepingAgentSession(record.paneKey)

    expect(launched).toBe(true)
    const state = useAppStore.getState()
    const resumedTab = state.tabsByWorktree['wt-1']?.[0]
    expect(resumedTab?.launchAgent).toBe('codex')
    expect(state.pendingStartupByTabId[resumedTab!.id]?.command).toContain(
      "'resume' 'codex-session-1'"
    )
    expect(state.pendingStartupByTabId[resumedTab!.id]?.showSessionRestoredBanner).toBe(true)
    expect(state.sleepingAgentSessionsByPaneKey[record.paneKey]).toBeUndefined()
  })
})
