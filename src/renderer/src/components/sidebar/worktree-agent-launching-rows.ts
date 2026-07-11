import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode,
  TerminalTab,
  TuiAgent
} from '../../../../shared/types'
import type { TerminalSlice } from '@/store/slices/terminals'

export const LAUNCHING_AGENT_PANE_KEY_PREFIX = 'launching:'

export function makeLaunchingAgentPaneKey(tabId: string): string {
  return `${LAUNCHING_AGENT_PANE_KEY_PREFIX}${tabId}`
}

function collectLeafIds(node: TerminalPaneLayoutNode | null): string[] {
  if (!node) {
    return []
  }
  if (node.type === 'leaf') {
    return [node.leafId]
  }
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)]
}

function resolveLaunchingPaneKey(
  tab: TerminalTab,
  layout: TerminalLayoutSnapshot | undefined
): string {
  const leafId = layout?.activeLeafId ?? collectLeafIds(layout?.root ?? null)[0]
  return leafId && isTerminalLeafId(leafId)
    ? makePaneKey(tab.id, leafId)
    : makeLaunchingAgentPaneKey(tab.id)
}

function launchedTabToAgentEntry(args: {
  paneKey: string
  tab: TerminalTab
  launchAgent: TuiAgent
  isStarting: boolean
}): AgentStatusEntry {
  const agentLabel = formatAgentTypeLabel(args.launchAgent)
  return {
    paneKey: args.paneKey,
    state: 'working',
    prompt: args.isStarting ? `Starting ${agentLabel}` : agentLabel,
    updatedAt: args.tab.createdAt,
    stateStartedAt: args.tab.createdAt,
    stateHistory: [],
    agentType: args.launchAgent,
    worktreeId: args.tab.worktreeId,
    tabId: args.tab.id,
    terminalTitle: args.tab.title,
    lastAssistantMessage: args.isStarting ? 'Starting' : 'Idle'
  }
}

export function appendLaunchingAgentRows(args: {
  rows: DashboardAgentRow[]
  seenPaneKeys: Set<string>
  tabs: TerminalTab[]
  pendingStartupByTabId?: TerminalSlice['pendingStartupByTabId']
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot | undefined>
  agentCustomTitlesByPaneKey?: Record<string, string>
}): void {
  const seenTabIds = new Set(args.rows.map((row) => row.tab.id))
  for (const tab of args.tabs) {
    if (seenTabIds.has(tab.id)) {
      continue
    }
    const pendingStartup = args.pendingStartupByTabId?.[tab.id]
    const launchAgent = tab.launchAgent ?? pendingStartup?.launchAgent
    if (!launchAgent) {
      continue
    }
    const paneKey = resolveLaunchingPaneKey(tab, args.terminalLayoutsByTabId?.[tab.id])
    if (args.seenPaneKeys.has(paneKey)) {
      continue
    }
    const isStarting = pendingStartup?.launchAgent === launchAgent
    const rowEntry = launchedTabToAgentEntry({ paneKey, tab, launchAgent, isStarting })
    args.rows.push({
      paneKey,
      entry: rowEntry,
      tab,
      agentType: launchAgent,
      rowSource: 'launching',
      state: isStarting ? 'working' : 'idle',
      startedAt: tab.createdAt,
      customTitle:
        args.agentCustomTitlesByPaneKey?.[paneKey] ?? tab.customTitle?.trim() ?? undefined
    })
    args.seenPaneKeys.add(paneKey)
    seenTabIds.add(tab.id)
  }
}
