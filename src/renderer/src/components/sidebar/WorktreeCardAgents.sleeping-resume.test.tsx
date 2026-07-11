import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'

function makeSleepingAgent(): DashboardAgentRowData {
  return {
    paneKey: 'tab-1:leaf-1',
    tab: { id: 'tab-1' },
    agentType: 'codex',
    rowSource: 'sleeping',
    state: 'idle',
    startedAt: 20,
    entry: {
      paneKey: 'tab-1:leaf-1',
      state: 'done',
      prompt: 'hello',
      updatedAt: 20,
      stateStartedAt: 20,
      stateHistory: [],
      agentType: 'codex',
      interrupted: true,
      providerSession: { key: 'session_id', id: 'codex-session-1' }
    }
  } as unknown as DashboardAgentRowData
}

function makeResumingAgent(): DashboardAgentRowData {
  return {
    paneKey: 'resuming:tab-2',
    tab: { id: 'tab-2' },
    agentType: 'codex',
    rowSource: 'resuming',
    state: 'idle',
    startedAt: 20,
    entry: {
      paneKey: 'resuming:tab-2',
      state: 'working',
      prompt: 'hello',
      updatedAt: 20,
      stateStartedAt: 20,
      stateHistory: [],
      agentType: 'codex',
      providerSession: { key: 'session_id', id: 'codex-session-1' }
    }
  } as unknown as DashboardAgentRowData
}

function makeRetainedLaunchedAgent(): DashboardAgentRowData {
  return {
    paneKey: 'launching:tab-3',
    tab: { id: 'tab-3' },
    agentType: 'codex',
    rowSource: 'retained',
    state: 'done',
    startedAt: 20,
    entry: {
      paneKey: 'launching:tab-3',
      state: 'done',
      prompt: 'Codex',
      updatedAt: 20,
      stateStartedAt: 20,
      stateHistory: [],
      agentType: 'codex',
      worktreeId: 'wt-1',
      tabId: 'tab-3'
    }
  } as unknown as DashboardAgentRowData
}

function makeRetainedResumableAgent(): DashboardAgentRowData {
  return {
    paneKey: 'tab-4:44444444-4444-4444-8444-444444444444',
    tab: { id: 'tab-4', title: 'Codex', customTitle: null },
    agentType: 'codex',
    rowSource: 'retained',
    state: 'done',
    startedAt: 20,
    entry: {
      paneKey: 'tab-4:44444444-4444-4444-8444-444444444444',
      state: 'done',
      prompt: 'implement the sidebar fix',
      updatedAt: 30,
      stateStartedAt: 20,
      stateHistory: [],
      agentType: 'codex',
      worktreeId: 'wt-1',
      tabId: 'tab-4',
      terminalTitle: 'Codex',
      providerSession: { key: 'session_id', id: 'codex-session-4' }
    }
  } as unknown as DashboardAgentRowData
}

let capturedActivation: ((tabId: string, paneKey: string) => void) | null = null
let mockAgents: DashboardAgentRowData[] = []

const storeMocks = vi.hoisted(() => ({
  dismissRetainedAgent: vi.fn(),
  setActiveTab: vi.fn(),
  setActiveTabType: vi.fn()
}))

const activationMocks = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn()
}))

const resumeMocks = vi.hoisted(() => ({
  resumeSleepingAgentSession: vi.fn()
}))

const launchMocks = vi.hoisted(() => ({
  launchAgentInNewTab: vi.fn(),
  launchSleepingAgentSession: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        agentActivityDisplayMode: 'full',
        acknowledgedAgentsByPaneKey: {},
        cacheTimerByKey: {},
        clearSleepingAgentSession: vi.fn(),
        clearAgentTitle: vi.fn(),
        dropAgentStatus: vi.fn(),
        dropAgentStatusByTabPrefix: vi.fn(),
        dismissRetainedAgent: storeMocks.dismissRetainedAgent,
        closeTab: vi.fn(),
        renameAgentTitle: vi.fn(),
        setTabCustomTitle: vi.fn(),
        setActiveTab: storeMocks.setActiveTab,
        setActiveTabType: storeMocks.setActiveTabType,
        agentSendPopoverTargetMode: null,
        agentStatusByPaneKey: {},
        agentCustomTitlesByPaneKey: {},
        agentStatusEpoch: 0,
        tabsByWorktree: {},
        terminalLayoutsByTabId: {},
        ptyIdsByTabId: {},
        runtimePaneTitlesByTabId: {},
        sendPromptToSidebarAgentTarget: vi.fn(),
        settings: {
          promptCacheTimerEnabled: true,
          promptCacheTtlMs: 60_000
        }
      }),
    {
      getState: () => ({
        tabsByWorktree: {},
        agentStatusByPaneKey: {},
        terminalLayoutsByTabId: {},
        setActiveTab: storeMocks.setActiveTab,
        setActiveTabType: storeMocks.setActiveTabType
      })
    }
  )
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: activationMocks.activateAndRevealWorktree
}))

vi.mock('@/lib/resume-sleeping-agent-session', () => ({
  resumeSleepingAgentSession: resumeMocks.resumeSleepingAgentSession
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: launchMocks.launchAgentInNewTab
}))

vi.mock('@/lib/sleeping-agent-session-launch', () => ({
  launchSleepingAgentSession: launchMocks.launchSleepingAgentSession
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: vi.fn()
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/components/dashboard/useNow', () => ({
  useNow: vi.fn(() => 2_000)
}))

vi.mock('@/components/dashboard/DashboardAgentRow', () => ({
  default: ({
    agent,
    onActivate
  }: {
    agent: DashboardAgentRowData
    onActivate: (tabId: string, paneKey: string) => void
  }) => {
    capturedActivation = onActivate
    return <div data-testid="agent-row" data-pane-key={agent.paneKey} />
  }
}))

vi.mock('./focused-agent-row-highlight', () => ({
  useFocusedAgentPaneKey: vi.fn(() => null)
}))

describe('WorktreeCardAgents sleeping resume rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedActivation = null
    mockAgents = [makeSleepingAgent()]
  })

  it('reveals the worktree and resumes sleeping history when activated', async () => {
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedActivation?.('tab-1', 'tab-1:leaf-1')

    expect(activationMocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
    expect(resumeMocks.resumeSleepingAgentSession).toHaveBeenCalledWith('tab-1:leaf-1')
  })

  it('activates a resuming tab without starting another sleeping resume', async () => {
    mockAgents = [makeResumingAgent()]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedActivation?.('tab-2', 'resuming:tab-2')

    expect(activationMocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
    expect(storeMocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(storeMocks.setActiveTab).toHaveBeenCalledWith('tab-2')
    expect(resumeMocks.resumeSleepingAgentSession).not.toHaveBeenCalled()
  })

  it('relaunches a retained closed agent row when activated', async () => {
    launchMocks.launchAgentInNewTab.mockReturnValue({ tabId: 'tab-new' })
    mockAgents = [makeRetainedLaunchedAgent()]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedActivation?.('tab-3', 'launching:tab-3')

    expect(activationMocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
    expect(launchMocks.launchAgentInNewTab).toHaveBeenCalledWith({
      agent: 'codex',
      worktreeId: 'wt-1',
      launchSource: 'sidebar'
    })
    expect(storeMocks.dismissRetainedAgent).toHaveBeenCalledWith('launching:tab-3')
  })

  it('resumes a retained done row when its original terminal tab is gone', async () => {
    launchMocks.launchSleepingAgentSession.mockReturnValue(true)
    mockAgents = [makeRetainedResumableAgent()]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    capturedActivation?.('tab-4', 'tab-4:44444444-4444-4444-8444-444444444444')

    expect(activationMocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
    expect(launchMocks.launchSleepingAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        paneKey: 'tab-4:44444444-4444-4444-8444-444444444444',
        tabId: 'tab-4',
        worktreeId: 'wt-1',
        agent: 'codex',
        prompt: 'implement the sidebar fix',
        state: 'done',
        providerSession: { key: 'session_id', id: 'codex-session-4' },
        origin: 'terminal-close'
      })
    )
    expect(storeMocks.dismissRetainedAgent).toHaveBeenCalledWith(
      'tab-4:44444444-4444-4444-8444-444444444444'
    )
  })
})
