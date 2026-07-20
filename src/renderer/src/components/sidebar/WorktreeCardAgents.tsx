import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { resumeSleepingAgentSession } from '@/lib/resume-sleeping-agent-session'
import { launchSleepingAgentSession } from '@/lib/sleeping-agent-session-launch'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useNow } from '@/components/dashboard/useNow'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import {
  selectSendTargetControlInputs,
  selectSendTargetInputs
} from './worktree-card-send-target-inputs'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { dismissStaleAgentRowByKey } from '../terminal-pane/stale-agent-row'
import { useFocusedAgentPaneKey } from './focused-agent-row-highlight'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '../../../../shared/constants'
import { revealElementInScrollContainer } from './worktree-sidebar-reveal'
import { useWorktreeAgentExpansionState } from './worktree-card-agents-expansion-state'
import { useWorktreeCardAgentActions } from './worktree-card-agent-actions'
import {
  WorktreeCardCompactAgentTree,
  WorktreeCardFullAgentTree
} from './worktree-card-agent-trees'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import {
  isResumableTuiAgent,
  type SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'

export const SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT =
  'orca-suppress-worktree-list-scroll-adjustment'

const dispatchSuppressScrollAdjustment = () => {
  window.dispatchEvent(new CustomEvent(SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT))
}

function revealCompactAgentCard(agentListRoot: HTMLElement | null): void {
  const sidebarElement = agentListRoot?.closest('[data-worktree-sidebar]')
  const worktreeOptionElement = agentListRoot?.closest('[role="option"]')
  if (!(sidebarElement instanceof HTMLElement) || !worktreeOptionElement) {
    return
  }
  revealElementInScrollContainer(sidebarElement, worktreeOptionElement, 'auto')
}

type Props = {
  worktreeId: string
  agents?: DashboardAgentRowData[]
  /** Spacing from the card body above; parent decides whether a divider is appropriate. */
  className?: string
}

/** Inline agent list rendered inside WorktreeCard when 'inline-agents' is enabled. */
const WorktreeCardAgents = React.memo(function WorktreeCardAgents({
  worktreeId,
  agents: precomputedAgents,
  className
}: Props) {
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const agents = precomputedAgents ?? selectedAgents
  if (agents.length === 0) {
    return null
  }
  // Why: mount the inner body (owns the 30s useNow tick) only for non-empty rows, so idle worktrees pay no timer cost.
  return <WorktreeCardAgentsBody worktreeId={worktreeId} agents={agents} className={className} />
})

type BodyProps = {
  worktreeId: string
  agents: DashboardAgentRowData[]
  className?: string
}

const WorktreeCardAgentsBody = React.memo(function WorktreeCardAgentsBody({
  worktreeId,
  agents,
  className
}: BodyProps) {
  const agentActivityDisplayMode =
    useAppStore((s) => s.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const clearSleepingAgentSession = useAppStore((s) => s.clearSleepingAgentSession)
  const { targetMode: agentSendPopoverTargetMode, agentStatusEpoch } = useAppStore(
    useShallow((s) => selectSendTargetControlInputs(s, worktreeId))
  )
  // Why: return a stable empty constant unless the send-target popover is ours, so churny pane-title/agent-status maps don't re-render idle bodies.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Why: derive per-agent unvisited flags from the ack map so rows bold on first appearance and mute once the tab is visited.
  const acknowledgedAgentsByPaneKey = useAppStore((s) => s.acknowledgedAgentsByPaneKey)
  const unvisitedByPaneKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const a of agents) {
      const ackAt = acknowledgedAgentsByPaneKey[a.paneKey] ?? 0
      out[a.paneKey] = a.rowSource !== 'sleeping' && ackAt < a.entry.stateStartedAt
    }
    return out
  }, [agents, acknowledgedAgentsByPaneKey])

  const handleDismissAgent = useCallback(
    (paneKey: string) => {
      dropAgentStatus(paneKey)
      dismissRetainedAgent(paneKey)
      clearSleepingAgentSession(paneKey)
    },
    [clearSleepingAgentSession, dismissRetainedAgent, dropAgentStatus]
  )
  const { handleCloseAgent, handleStartRenameAgent, renameDialog } = useWorktreeCardAgentActions({
    agents,
    worktreeId
  })

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode !== null
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    if (!isAgentSendTargetModeActive) {
      return new Map<
        string,
        { status: 'eligible' | 'disabled' | 'sending'; disabledReason?: string }
      >()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? { status: 'sending' as const, disabledReason: 'Sending...' }
          : target.disabledReason
            ? { status: target.status, disabledReason: target.disabledReason }
            : { status: target.status }
      ])
    )
  }, [
    // Why: stale-boundary timers bump this epoch without replacing the status map, so re-derive when freshness flips.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    // sendTargetInputs: stable empty when inactive, shallow bundle of the five maps when active — one ref covers all five deps.
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => {
      const parsed = parsePaneKey(paneKey)
      if (!parsed) {
        // Why: malformed/legacy numeric keys can't be resolved after pane replay/remount, so drop the stale row instead of guessing.
        console.warn('[WorktreeCardAgents] malformed paneKey, skipping pane focus', paneKey)
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      if (parsed.tabId !== tabId) {
        console.warn('[WorktreeCardAgents] paneKey tabId mismatch, dismissing row', {
          tabId,
          paneKey
        })
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      // Why: design-doc rule — every user-initiated worktree switch must route through activateAndRevealWorktree (cross-repo activation + nav history).
      activateAndRevealWorktree(worktreeId)
      const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
      if (tabs.some((t) => t.id === tabId)) {
        activateTabAndFocusPane(tabId, parsed.leafId, {
          ackPaneKeyOnSuccess: paneKey,
          flashFocusedPane: true,
          scrollToBottomIfOutputSinceLastView: true
        })
      } else {
        const liveEntry = useAppStore.getState().agentStatusByPaneKey[paneKey]
        if (liveEntry?.worktreeId === worktreeId) {
          // Why: orchestration worker status can be worktree-attributed before the renderer knows its tab; keep the live row instead of dismissing as stale.
          return
        }
        dismissStaleAgentRowByKey(paneKey)
      }
    },
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(
    (_tabId: string, _paneKey: string, agent?: DashboardAgentRowData) => {
      if (!agent) {
        return
      }
      if (agent.paneKey.startsWith('launching:') && isTuiAgent(agent.agentType)) {
        activateAndRevealWorktree(worktreeId)
        const launched = launchAgentInNewTab({
          agent: agent.agentType,
          worktreeId,
          launchSource: 'sidebar'
        })
        if (launched) {
          dismissRetainedAgent(agent.paneKey)
        }
        return
      }
      if (!isResumableTuiAgent(agent.agentType) || !agent.entry.providerSession) {
        return
      }
      activateAndRevealWorktree(worktreeId)
      const store = useAppStore.getState()
      const tabId = agent.entry.tabId ?? agent.tab.id
      const terminalTitle = agent.entry.terminalTitle ?? agent.tab.title
      const customTitle = agent.customTitle?.trim() || agent.tab.customTitle?.trim() || undefined
      const launchConfig = store.getAgentLaunchConfigForStatusEntry?.(agent.entry)
      const record: SleepingAgentSessionRecord = {
        paneKey: agent.paneKey,
        tabId,
        worktreeId,
        agent: agent.agentType,
        providerSession: agent.entry.providerSession,
        prompt: agent.entry.prompt,
        state: agent.entry.state,
        capturedAt: agent.startedAt > 0 ? agent.startedAt : agent.entry.updatedAt,
        updatedAt: agent.entry.updatedAt,
        ...(terminalTitle ? { terminalTitle } : {}),
        ...(customTitle ? { customTitle } : {}),
        ...(agent.entry.lastAssistantMessage
          ? { lastAssistantMessage: agent.entry.lastAssistantMessage }
          : {}),
        ...(agent.entry.interrupted !== undefined ? { interrupted: agent.entry.interrupted } : {}),
        ...(launchConfig ? { launchConfig } : {}),
        origin: 'terminal-close'
      }
      if (launchSleepingAgentSession(record)) {
        dismissRetainedAgent(agent.paneKey)
      }
    },
    [dismissRetainedAgent, worktreeId]
  )
  const handleActivateSleepingAgent = useCallback(
    (_tabId: string, paneKey: string) => {
      activateAndRevealWorktree(worktreeId)
      resumeSleepingAgentSession(paneKey)
    },
    [worktreeId]
  )
  const handleActivateResumingAgent = useCallback(
    (tabId: string) => {
      activateAndRevealWorktree(worktreeId)
      useAppStore.getState().setActiveTabType('terminal')
      useAppStore.getState().setActiveTab(tabId)
    },
    [worktreeId]
  )

  // Why: one 30s tick per non-empty inline list; zero-agent cards never mount this (see WorktreeCardAgents), so idle worktrees pay no timer cost.
  const now = useNow(30_000)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => buildAgentRowLineageTree(agents),
    [agents]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  // Why: keep disclosure state out of local useState so a WorktreeCard remount (virtualizer recycle / sibling toggle) doesn't reset it.
  const {
    collapsedLineageParents,
    compactRootListExpanded,
    toggleLineageParent: toggleLineageParentState,
    toggleCompactRootList
  } = useWorktreeAgentExpansionState(worktreeId)

  // Why: reveal only on a genuine user collapse→expand; seeding an already-expanded panel from cache on remount must not re-trigger the reveal scroll.
  const previousCompactExpandedRef = useRef(compactRootListExpanded)
  useLayoutEffect(() => {
    const wasExpanded = previousCompactExpandedRef.current
    previousCompactExpandedRef.current = compactRootListExpanded
    if (!wasExpanded && compactRootListExpanded && agentActivityDisplayMode === 'compact') {
      dispatchSuppressScrollAdjustment()
      // Why: defer the reveal scroll to next frame; running it inline forces a sync sidebar layout that janks the opening animation.
      const handle = requestAnimationFrame(() => {
        revealCompactAgentCard(compactAgentListRootRef.current)
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [agentActivityDisplayMode, compactRootListExpanded])
  const toggleLineageParent = useCallback(
    (paneKey: string) => {
      dispatchSuppressScrollAdjustment()
      toggleLineageParentState(paneKey)
    },
    [toggleLineageParentState]
  )

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Why: root leaf siblings reserve a leading spacer when any root has a chevron, keeping the state-dot column aligned (descendants already indent).
  const anyRootHasChildren = rootAgents.some(
    (agent) => (childrenByParentPaneKey.get(agent.paneKey) ?? []).length > 0
  )
  const treeHandlers = {
    handleActivateAgentTab,
    handleActivateRetainedAgent,
    handleActivateSleepingAgent,
    handleActivateResumingAgent,
    handleCloseAgent,
    handleDismissAgent,
    handleSendTargetClick,
    handleStartRenameAgent,
    toggleLineageParent
  }
  const commonTreeProps = {
    rootAgents,
    childrenByParentPaneKey,
    collapsedLineageParents,
    anyRootHasChildren,
    focusedAgentPaneKey,
    isAgentSendTargetModeActive,
    sendTargetsByPaneKey,
    now,
    handlers: treeHandlers
  }

  if (agentActivityDisplayMode === 'compact') {
    return (
      <>
        <WorktreeCardCompactAgentTree
          {...commonTreeProps}
          agents={agents}
          className={className}
          compactAgentListRootRef={compactAgentListRootRef}
          compactRootListExpanded={compactRootListExpanded}
          hasLineage={hasLineage}
          onToggleSummary={() => {
            dispatchSuppressScrollAdjustment()
            toggleCompactRootList()
          }}
          stopBubble={stopBubble}
        />
        {renameDialog}
      </>
    )
  }

  return (
    // Why: swallow bubbling so gutter clicks do not reach WorktreeCard's activate/edit handlers.
    <>
      <WorktreeCardFullAgentTree
        {...commonTreeProps}
        className={className}
        hasLineage={hasLineage}
        stopBubble={stopBubble}
        unvisitedByPaneKey={unvisitedByPaneKey}
      />
      {renameDialog}
    </>
  )
})

export default WorktreeCardAgents
