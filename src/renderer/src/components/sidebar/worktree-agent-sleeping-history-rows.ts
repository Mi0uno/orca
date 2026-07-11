import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalTab } from '../../../../shared/types'

function sleepingRecordToAgentEntry(record: SleepingAgentSessionRecord): AgentStatusEntry {
  return {
    paneKey: record.paneKey,
    state: record.state,
    prompt: record.prompt,
    updatedAt: record.updatedAt,
    stateStartedAt: record.updatedAt,
    stateHistory: [],
    agentType: record.agent,
    worktreeId: record.worktreeId,
    providerSession: record.providerSession,
    ...(record.tabId ? { tabId: record.tabId } : {}),
    ...(record.terminalTitle ? { terminalTitle: record.terminalTitle } : {}),
    ...(record.lastAssistantMessage ? { lastAssistantMessage: record.lastAssistantMessage } : {}),
    ...(record.interrupted !== undefined ? { interrupted: record.interrupted } : {})
  }
}

function tabFromSleepingRecord(record: SleepingAgentSessionRecord): TerminalTab {
  const parsed = parsePaneKey(record.paneKey)
  return {
    id: record.tabId ?? parsed?.tabId ?? record.paneKey,
    ptyId: null,
    worktreeId: record.worktreeId,
    title: record.terminalTitle ?? formatAgentTypeLabel(record.agent),
    customTitle: record.customTitle ?? null,
    color: null,
    sortOrder: 0,
    createdAt: record.capturedAt,
    launchAgent: record.agent
  }
}

export function appendSleepingAgentHistoryRows(args: {
  rows: DashboardAgentRow[]
  seenPaneKeys: Set<string>
  sleeping?: SleepingAgentSessionRecord[]
  agentCustomTitlesByPaneKey?: Record<string, string>
}): void {
  for (const record of args.sleeping ?? []) {
    if (record.origin !== 'terminal-close' || args.seenPaneKeys.has(record.paneKey)) {
      continue
    }
    const rowEntry = sleepingRecordToAgentEntry(record)
    args.rows.push({
      paneKey: rowEntry.paneKey,
      entry: rowEntry,
      tab: tabFromSleepingRecord(record),
      agentType: record.agent,
      rowSource: 'sleeping',
      state: 'idle',
      startedAt: record.updatedAt,
      customTitle: args.agentCustomTitlesByPaneKey?.[rowEntry.paneKey] ?? record.customTitle
    })
    args.seenPaneKeys.add(rowEntry.paneKey)
  }
}
