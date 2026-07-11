import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  /** Controls spacing from the card body above. Passed in so the parent can
   *  decide whether a divider is appropriate — e.g. suppressed when the card
   *  chrome already provides visual separation. */
  className?: string
}

/**
 * Inline agent list rendered directly inside WorktreeCard when the
 * 'inline-agents' card property is enabled. Gives persistent per-card
 * visibility of each agent's live state, prompt, and last message.
 *
 * Reuses useWorktreeAgentRows + DashboardAgentRow so row layout and the
 * derivation stay consistent with the inline agent activity on each card.
 */
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
  // Why: gate the 30s tick behind non-empty rows by mounting the inner body
  // only when there's something to show. The setInterval lives in the inner
  // component's useNow, so idle worktrees don't pay per-card timer cost.
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
  // Why: these five maps are read only to derive send-target eligibility, which
  // matters only while the send-target popover targets THIS card. Two of them
  // (runtimePaneTitlesByTabId, agentStatusByPaneKey) churn on every pane-title
  // and agent-status write app-wide, so subscribing to them unconditionally made
  // every mounted agent body re-render on unrelated terminals. Gate the
  // subscription: return a stable empty constant when the popover isn't ours, so
  // useShallow keeps the same result and idle bodies stop reacting to the churn.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Why: subscribe to the ack map reference (Object.is equality) and derive
  // per-agent unvisited flags locally. Keeps the inline list's bold/mute
  // behavior consistent with how acks flow elsewhere — rows bold on first
  // appearance and mute once the user has visited the agent's tab
  // (useAutoAckViewedAgent acks automatically on terminal focus). Without
  // this, all inline rows stayed muted regardless of attention state.
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
    // Why: stale-boundary timers bump this epoch without replacing the status
    // map, so target eligibility must derive again when freshness flips.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    // sendTargetInputs is a stable empty constant while inactive and a
    // shallow-compared bundle of the five maps while active, so it covers all
    // five former deps in one reference.
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
        // Why: malformed or legacy numeric keys cannot be resolved safely after
        // pane replay/remount, so drop the stale row instead of guessing.
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
      // Why: route through activateAndRevealWorktree so cross-repo clicks also
      // set activeRepoId, record a nav-history entry, clear sidebar filters,
      // reveal the card, and stamp focus recency — per the design doc rule
      // "Every user-initiated worktree switch must route through
      // activateAndRevealWorktree". Bypassing it (direct setActiveWorktree +
      // markWorktreeVisited) silently skipped cross-repo activation and
      // back/forward history for clicks from inline agent rows.
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
          // Why: orchestration worker status can be worktree-attributed before
          // the renderer knows its tab. Keep the visible live row instead of
          // dismissing it as stale just because it cannot be focused yet.
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

  // Why: own one 30s tick per non-empty inline list. Cards with zero agents
  // never mount this component (see WorktreeCardAgents), so idle worktrees
  // don't pay any timer cost.
  const now = useNow(30_000)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => buildAgentRowLineageTree(agents),
    [agents]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  const [collapsedLineageParents, setCollapsedLineageParents] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [compactRootListExpanded, setCompactRootListExpanded] = useState(false)

  useLayoutEffect(() => {
    if (compactRootListExpanded && agentActivityDisplayMode === 'compact') {
      dispatchSuppressScrollAdjustment()
      // Why: defer the reveal scroll out of the expand commit. Running it inline
      // forces a synchronous sidebar layout that blocks the animation's opening
      // frames (a visible jump); next-frame keeps the open smooth and the
      // ScrollBehavior 'auto' still lands before the height transition finishes.
      const handle = requestAnimationFrame(() => {
        revealCompactAgentCard(compactAgentListRootRef.current)
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [agentActivityDisplayMode, compactRootListExpanded])
  const toggleLineageParent = useCallback((paneKey: string) => {
    dispatchSuppressScrollAdjustment()
    setCollapsedLineageParents((current) => {
      const next = new Set(current)
      if (next.has(paneKey)) {
        next.delete(paneKey)
      } else {
        next.add(paneKey)
      }
      return next
    })
  }, [])

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Why: when any root row has a disclosure chevron, root leaf siblings reserve
  // a matching leading spacer so the state-dot column stays aligned across the
  // card. Descendants already have the child rail indent, so adding this spacer
  // there double-indents child agents.
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
            setCompactRootListExpanded((expanded) => !expanded)
          }}
          stopBubble={stopBubble}
        />
        {renameDialog}
      </>
    )
  }

  return (
    // Why: swallow bubbling so clicks on the gutter around the agent rows
    // don't reach WorktreeCard's activate / edit-meta handlers.
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
