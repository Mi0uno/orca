import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../types'
import { createTestStore, makeTab } from './store-test-helpers'

describe('terminal-close agent session retention', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps an interrupted resumable agent as terminal-close history when its pane closes', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        'wt-1': [makeTab({ id: 'tab-1', worktreeId: 'wt-1', title: 'Codex' })]
      }
    } as Partial<AppState>)

    store.getState().setAgentStatus(
      'tab-1:leaf-1',
      {
        state: 'done',
        prompt: 'hello',
        agentType: 'codex',
        interrupted: true,
        lastAssistantMessage: 'Interrupted by user'
      },
      'Codex',
      { updatedAt: 20, stateStartedAt: 10 },
      { tabId: 'tab-1', worktreeId: 'wt-1' },
      { providerSession: { key: 'session_id', id: 'codex-session-1' } }
    )

    store.getState().retainClosedAgentSession('tab-1:leaf-1')

    const state = store.getState()
    expect(state.agentStatusByPaneKey['tab-1:leaf-1']).toBeUndefined()
    expect(state.retentionSuppressedPaneKeys['tab-1:leaf-1']).toBeUndefined()
    expect(state.sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toMatchObject({
      paneKey: 'tab-1:leaf-1',
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      agent: 'codex',
      prompt: 'hello',
      interrupted: true,
      origin: 'terminal-close',
      providerSession: { key: 'session_id', id: 'codex-session-1' }
    })
  })

  it('does not leave a non-resumable done agent behind when its pane closes', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        'wt-1': [makeTab({ id: 'tab-1', worktreeId: 'wt-1' })]
      }
    } as Partial<AppState>)
    store
      .getState()
      .setAgentStatus(
        'tab-1:leaf-1',
        { state: 'done', prompt: 'finished', agentType: 'codex' },
        'Codex',
        { updatedAt: 20, stateStartedAt: 10 },
        { tabId: 'tab-1', worktreeId: 'wt-1' }
      )

    store.getState().retainClosedAgentSession('tab-1:leaf-1')

    const state = store.getState()
    expect(state.agentStatusByPaneKey['tab-1:leaf-1']).toBeUndefined()
    expect(state.sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toBeUndefined()
    expect(state.retentionSuppressedPaneKeys['tab-1:leaf-1']).toBe(true)
  })

  it('keeps a launched agent tab as retained history even before provider session exists', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        'wt-1': [
          makeTab({
            id: 'tab-1',
            worktreeId: 'wt-1',
            title: 'Terminal 1',
            launchAgent: 'codex'
          })
        ]
      }
    } as Partial<AppState>)

    store.getState().closeTab('tab-1')

    const state = store.getState()
    expect(state.tabsByWorktree['wt-1']).toEqual([])
    expect(state.sleepingAgentSessionsByPaneKey['launching:tab-1']).toBeUndefined()
    expect(state.retainedAgentsByPaneKey['launching:tab-1']).toMatchObject({
      worktreeId: 'wt-1',
      agentType: 'codex',
      tab: {
        id: 'tab-1',
        launchAgent: 'codex'
      },
      entry: {
        paneKey: 'launching:tab-1',
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        agentType: 'codex',
        prompt: 'Codex',
        terminalTitle: 'Terminal 1'
      }
    })
  })

  it('skips launched agent history when terminal close is a permanent agent close', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        'wt-1': [
          makeTab({
            id: 'tab-1',
            worktreeId: 'wt-1',
            title: 'Terminal 1',
            launchAgent: 'codex'
          })
        ]
      }
    } as Partial<AppState>)

    store.getState().closeTab('tab-1', { retainAgentHistory: false })

    const state = store.getState()
    expect(state.tabsByWorktree['wt-1']).toEqual([])
    expect(state.retainedAgentsByPaneKey['launching:tab-1']).toBeUndefined()
    expect(state.sleepingAgentSessionsByPaneKey['launching:tab-1']).toBeUndefined()
  })

  it('captures tab-close history before the tab leaves its worktree', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        'wt-1': [makeTab({ id: 'tab-1', worktreeId: 'wt-1', title: 'Claude' })]
      }
    } as Partial<AppState>)
    store
      .getState()
      .setAgentStatus(
        'tab-1:leaf-1',
        { state: 'working', prompt: 'continue', agentType: 'claude' },
        'Claude',
        { updatedAt: 20, stateStartedAt: 10 },
        { tabId: 'tab-1' },
        { providerSession: { key: 'session_id', id: 'claude-session-1' } }
      )

    store.getState().closeTab('tab-1')

    const state = store.getState()
    expect(state.tabsByWorktree['wt-1']).toEqual([])
    expect(state.agentStatusByPaneKey['tab-1:leaf-1']).toBeUndefined()
    expect(state.sleepingAgentSessionsByPaneKey['tab-1:leaf-1']).toMatchObject({
      worktreeId: 'wt-1',
      origin: 'terminal-close',
      providerSession: { key: 'session_id', id: 'claude-session-1' }
    })
    expect(state.recentlyClosedAgentStatusTabIds['tab-1']).toBe(true)
  })
})
