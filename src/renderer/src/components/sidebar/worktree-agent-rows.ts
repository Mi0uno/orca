import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { isExplicitAgentStatusFresh } from '@/lib/agent-status'
import type { RetainedAgentEntry } from '@/store/slices/agent-status'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentType,
  type AgentStatusEntry,
  type AgentStatusOrchestrationContext
} from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../../shared/types'
import {
  buildTitleDerivedAgentRows,
  resolveAgentTypeFromTerminalTitle
} from './worktree-title-derived-agent-rows'
import { buildSubagentChildRows } from './worktree-subagent-child-rows'
import { resolveCompatibleAgentTypeForOwner } from '../../../../shared/agent-title-owner'
import { compareWorktreeAgentRows } from './worktree-agent-row-order'
import {
  effectiveWorktreeAgentRowStartedAt,
  tabFromWorktreeAttributedStatusEntry
} from './worktree-agent-row-fallback-tab'
import { appendSleepingAgentHistoryRows } from './worktree-agent-sleeping-history-rows'
import { appendResumingAgentRows } from './worktree-agent-resuming-rows'
import { appendLaunchingAgentRows } from './worktree-agent-launching-rows'
import {
  isRetainedLegacyAliasOfSeenStablePane,
  markCompletedWorkerParentPaneKeysSeen
} from './worktree-agent-row-pane-dedup'
import { entryWithRuntimeOrchestration } from './worktree-agent-row-runtime-entry'
import type { AutomaticAgentResumeClaim, TerminalSlice } from '@/store/slices/terminals'

/**
 * Resolves the sidebar row agent type, prioritizing launch agent configuration
 * and normalizing compatible agent kinds.
 */
function resolveRowAgentType(entry: AgentStatusEntry, tab?: TerminalTab | null): AgentType {
  const entryAgentType = resolveCompatibleAgentTypeForOwner(entry.agentType, tab?.launchAgent)
  if (entryAgentType && entryAgentType !== 'unknown') {
    return entryAgentType
  }
  return (
    resolveAgentTypeFromTerminalTitle(entry.terminalTitle ?? tab?.title, tab?.launchAgent) ??
    tab?.launchAgent ??
    entryAgentType ??
    'unknown'
  )
}

export function buildWorktreeAgentRows(args: {
  tabs: TerminalTab[]
  entries: AgentStatusEntry[]
  retained: RetainedAgentEntry[]
  sleeping?: SleepingAgentSessionRecord[]
  automaticAgentResumeClaimsByTabId?: Record<string, AutomaticAgentResumeClaim>
  pendingStartupByTabId?: TerminalSlice['pendingStartupByTabId']
  agentCustomTitlesByPaneKey?: Record<string, string>
  runtimePaneTitlesByTabId?: Record<string, Record<number, string>>
  ptyIdsByTabId?: Record<string, string[]>
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot | undefined>
  runtimeAgentOrchestrationByPaneKey?: Record<string, AgentStatusOrchestrationContext>
  now: number
}): DashboardAgentRow[] {
  const rows: DashboardAgentRow[] = []
  const seenPaneKeys = new Set<string>()
  const currentTabIds = new Set(args.tabs.map((tab) => tab.id))

  const entriesByTabId = new Map<string, AgentStatusEntry[]>()
  for (const entry of args.entries) {
    const parsed = parsePaneKey(entry.paneKey)
    if (!parsed) {
      continue
    }
    const bucket = entriesByTabId.get(parsed.tabId)
    if (bucket) {
      bucket.push(entry)
    } else {
      entriesByTabId.set(parsed.tabId, [entry])
    }
  }

  for (const tab of args.tabs) {
    const explicitEntries = entriesByTabId.get(tab.id) ?? []
    for (const entry of explicitEntries) {
      const rowEntry = entryWithRuntimeOrchestration(entry, args.runtimeAgentOrchestrationByPaneKey)
      const isFresh = isExplicitAgentStatusFresh(rowEntry, args.now, AGENT_STATUS_STALE_AFTER_MS)
      const shouldDecay =
        !isFresh &&
        (rowEntry.state === 'working' ||
          rowEntry.state === 'blocked' ||
          rowEntry.state === 'waiting')
      const startedAt = effectiveWorktreeAgentRowStartedAt(rowEntry)
      rows.push({
        paneKey: rowEntry.paneKey,
        entry: rowEntry,
        tab,
        agentType: resolveRowAgentType(rowEntry, tab),
        rowSource: 'live',
        state: shouldDecay ? 'idle' : rowEntry.state,
        startedAt,
        customTitle: args.agentCustomTitlesByPaneKey?.[rowEntry.paneKey]
      })
      rows.push(...buildSubagentChildRows({ parentEntry: rowEntry, tab, parentIsFresh: isFresh }))
      seenPaneKeys.add(rowEntry.paneKey)
    }
  }

  markCompletedWorkerParentPaneKeysSeen({
    entries: args.entries,
    retained: args.retained,
    runtimeAgentOrchestrationByPaneKey: args.runtimeAgentOrchestrationByPaneKey,
    terminalLayoutsByTabId: args.terminalLayoutsByTabId,
    currentTabIds,
    seenPaneKeys
  })

  rows.push(...buildTitleDerivedAgentRows({ ...args, seenPaneKeys }))

  // Why: orchestration workers can be attributed to a worktree by main before
  // their tab is present in this renderer. Keep those live rows visible in the
  // worktree card instead of waiting for tab membership that may never arrive.
  for (const entry of args.entries) {
    if (seenPaneKeys.has(entry.paneKey)) {
      continue
    }
    const rowEntry = entryWithRuntimeOrchestration(entry, args.runtimeAgentOrchestrationByPaneKey)
    const startedAt = effectiveWorktreeAgentRowStartedAt(rowEntry)
    const tab = tabFromWorktreeAttributedStatusEntry(rowEntry, startedAt)
    if (!tab) {
      continue
    }
    const isFresh = isExplicitAgentStatusFresh(rowEntry, args.now, AGENT_STATUS_STALE_AFTER_MS)
    const shouldDecay =
      !isFresh &&
      (rowEntry.state === 'working' || rowEntry.state === 'blocked' || rowEntry.state === 'waiting')
    rows.push({
      paneKey: rowEntry.paneKey,
      entry: rowEntry,
      tab,
      agentType: resolveRowAgentType(rowEntry, tab),
      rowSource: 'live',
      state: shouldDecay ? 'idle' : rowEntry.state,
      startedAt,
      customTitle: args.agentCustomTitlesByPaneKey?.[rowEntry.paneKey]
    })
    rows.push(...buildSubagentChildRows({ parentEntry: rowEntry, tab, parentIsFresh: isFresh }))
    seenPaneKeys.add(rowEntry.paneKey)
  }

  appendSleepingAgentHistoryRows({
    rows,
    seenPaneKeys,
    sleeping: args.sleeping,
    agentCustomTitlesByPaneKey: args.agentCustomTitlesByPaneKey
  })

  for (const ra of args.retained) {
    if (seenPaneKeys.has(ra.entry.paneKey)) {
      continue
    }
    if (
      isRetainedLegacyAliasOfSeenStablePane({
        paneKey: ra.entry.paneKey,
        terminalLayoutsByTabId: args.terminalLayoutsByTabId,
        seenPaneKeys
      })
    ) {
      continue
    }
    const rowEntry = entryWithRuntimeOrchestration(
      ra.entry,
      args.runtimeAgentOrchestrationByPaneKey
    )
    rows.push({
      paneKey: rowEntry.paneKey,
      entry: rowEntry,
      tab: ra.tab,
      agentType: resolveRowAgentType(rowEntry, ra.tab),
      rowSource: 'retained',
      state: 'done',
      startedAt: ra.startedAt,
      customTitle:
        args.agentCustomTitlesByPaneKey?.[rowEntry.paneKey] ?? ra.tab.customTitle ?? undefined
    })
  }

  appendResumingAgentRows({
    rows,
    seenPaneKeys,
    tabs: args.tabs,
    automaticAgentResumeClaimsByTabId: args.automaticAgentResumeClaimsByTabId,
    pendingStartupByTabId: args.pendingStartupByTabId,
    agentCustomTitlesByPaneKey: args.agentCustomTitlesByPaneKey
  })

  appendLaunchingAgentRows({
    rows,
    seenPaneKeys,
    tabs: args.tabs,
    pendingStartupByTabId: args.pendingStartupByTabId,
    terminalLayoutsByTabId: args.terminalLayoutsByTabId,
    agentCustomTitlesByPaneKey: args.agentCustomTitlesByPaneKey
  })

  // Why: hook pings can rebuild the live entry list in a different iteration
  // order. Equal-start agents still need a deterministic sidebar order.
  rows.sort(compareWorktreeAgentRows)
  return rows
}
