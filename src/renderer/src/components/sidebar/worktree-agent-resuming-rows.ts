import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { AutomaticAgentResumeClaim, TerminalSlice } from '@/store/slices/terminals'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/types'

export const RESUMING_AGENT_PANE_KEY_PREFIX = 'resuming:'

export function makeResumingAgentPaneKey(tabId: string): string {
  return `${RESUMING_AGENT_PANE_KEY_PREFIX}${tabId}`
}

export function parseResumingAgentPaneKey(paneKey: string): string | null {
  return paneKey.startsWith(RESUMING_AGENT_PANE_KEY_PREFIX)
    ? paneKey.slice(RESUMING_AGENT_PANE_KEY_PREFIX.length)
    : null
}

function resumingClaimToAgentEntry(args: {
  paneKey: string
  tab: TerminalTab
  claim: AutomaticAgentResumeClaim
}): AgentStatusEntry {
  const updatedAt = args.claim.updatedAt ?? args.claim.capturedAt ?? args.tab.createdAt
  return {
    paneKey: args.paneKey,
    state: 'working',
    prompt:
      args.claim.prompt?.trim() ||
      `Restoring ${formatAgentTypeLabel(args.claim.launchAgent)} session`,
    updatedAt,
    stateStartedAt: updatedAt,
    stateHistory: [],
    agentType: args.claim.launchAgent,
    worktreeId: args.claim.worktreeId,
    tabId: args.tab.id,
    providerSession: args.claim.providerSession,
    ...(args.claim.terminalTitle ? { terminalTitle: args.claim.terminalTitle } : {}),
    ...(args.claim.interrupted !== undefined ? { interrupted: args.claim.interrupted } : {})
  }
}

export function appendResumingAgentRows(args: {
  rows: DashboardAgentRow[]
  seenPaneKeys: Set<string>
  tabs: TerminalTab[]
  automaticAgentResumeClaimsByTabId?: Record<string, AutomaticAgentResumeClaim>
  pendingStartupByTabId?: TerminalSlice['pendingStartupByTabId']
  agentCustomTitlesByPaneKey?: Record<string, string>
}): void {
  const seenTabIds = new Set(args.rows.map((row) => row.tab.id))
  for (const tab of args.tabs) {
    if (seenTabIds.has(tab.id)) {
      continue
    }
    const claim = args.automaticAgentResumeClaimsByTabId?.[tab.id]
    const pendingStartup = args.pendingStartupByTabId?.[tab.id]
    if (!claim || claim.worktreeId !== tab.worktreeId) {
      continue
    }
    if (
      pendingStartup?.resumeProviderSession &&
      pendingStartup.resumeProviderSession.id !== claim.providerSession.id
    ) {
      continue
    }
    const paneKey = makeResumingAgentPaneKey(tab.id)
    if (args.seenPaneKeys.has(paneKey)) {
      continue
    }
    const rowEntry = resumingClaimToAgentEntry({ paneKey, tab, claim })
    args.rows.push({
      paneKey,
      entry: rowEntry,
      tab,
      agentType: claim.launchAgent,
      rowSource: 'resuming',
      state: 'idle',
      startedAt: rowEntry.updatedAt,
      customTitle:
        args.agentCustomTitlesByPaneKey?.[paneKey] ??
        claim.customTitle?.trim() ??
        tab.customTitle?.trim() ??
        undefined
    })
    args.seenPaneKeys.add(paneKey)
    seenTabIds.add(tab.id)
  }
}
