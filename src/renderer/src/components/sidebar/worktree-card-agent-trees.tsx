import React from 'react'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  CompactAgentExpansion,
  CompactAgentRow,
  CompactAgentSummaryButton
} from './worktree-card-compact-agents'

type SendTargetStatus = {
  status: 'eligible' | 'disabled' | 'sending'
  disabledReason?: string
}

type AgentTreeHandlers = {
  handleActivateAgentTab: (tabId: string, paneKey: string) => void
  handleActivateRetainedAgent: (
    tabId: string,
    paneKey: string,
    agent?: DashboardAgentRowData
  ) => void
  handleActivateSleepingAgent: (tabId: string, paneKey: string) => void
  handleActivateResumingAgent: (tabId: string, paneKey: string) => void
  handleCloseAgent: (agent: DashboardAgentRowData) => void
  handleDismissAgent: (paneKey: string) => void
  handleSendTargetClick: (paneKey: string) => void
  handleStartRenameAgent: (agent: DashboardAgentRowData) => void
  toggleLineageParent: (paneKey: string) => void
}

type CommonTreeProps = {
  rootAgents: DashboardAgentRowData[]
  childrenByParentPaneKey: ReadonlyMap<string, DashboardAgentRowData[]>
  collapsedLineageParents: ReadonlySet<string>
  anyRootHasChildren: boolean
  focusedAgentPaneKey: string | null
  isAgentSendTargetModeActive: boolean
  sendTargetsByPaneKey: ReadonlyMap<string, SendTargetStatus>
  now: number
  handlers: AgentTreeHandlers
}

function activationHandlerFor(
  agent: DashboardAgentRowData,
  handlers: AgentTreeHandlers
): (tabId: string, paneKey: string) => void {
  if (agent.rowSource === 'sleeping') {
    return handlers.handleActivateSleepingAgent
  }
  if (agent.rowSource === 'retained') {
    return (tabId, paneKey) => handlers.handleActivateRetainedAgent(tabId, paneKey, agent)
  }
  if (agent.rowSource === 'resuming') {
    return handlers.handleActivateResumingAgent
  }
  if (agent.rowSource === 'launching') {
    return handlers.handleActivateResumingAgent
  }
  return handlers.handleActivateAgentTab
}

function sendTargetFor(props: CommonTreeProps, paneKey: string): SendTargetStatus | undefined {
  if (!props.isAgentSendTargetModeActive) {
    return undefined
  }
  return (
    props.sendTargetsByPaneKey.get(paneKey) ?? {
      status: 'disabled' as const,
      disabledReason: 'Agent is not available'
    }
  )
}

export function WorktreeCardFullAgentTree({
  className,
  hasLineage,
  stopBubble,
  unvisitedByPaneKey,
  ...props
}: CommonTreeProps & {
  className?: string
  hasLineage: boolean
  stopBubble: (event: React.MouseEvent) => void
  unvisitedByPaneKey: Record<string, boolean>
}): React.JSX.Element {
  const renderAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set()
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childAgents = props.childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const isRootAgent = ancestorPaneKeys.size === 0
    const expanded = !props.collapsedLineageParents.has(agent.paneKey)
    const sendTarget = sendTargetFor(props, agent.paneKey)
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <DashboardAgentRow
          agent={agent}
          onDismiss={props.handlers.handleDismissAgent}
          onActivate={activationHandlerFor(agent, props.handlers)}
          onCloseAgent={props.handlers.handleCloseAgent}
          onRename={props.handlers.handleStartRenameAgent}
          now={props.now}
          isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
          stateDotSize="sm"
          hideExpand
          childAgentCount={hasChildAgents ? childAgents.length : undefined}
          childAgentsExpanded={expanded}
          onToggleChildAgents={
            hasChildAgents ? () => props.handlers.toggleLineageParent(agent.paneKey) : undefined
          }
          reserveDisclosureGutter={isRootAgent && props.anyRootHasChildren && !hasChildAgents}
          isFocusedPane={agent.paneKey === props.focusedAgentPaneKey}
          sendTargetStatus={sendTarget?.status}
          sendTargetDisabledReason={sendTarget?.disabledReason}
          onSendTargetClick={
            props.isAgentSendTargetModeActive ? props.handlers.handleSendTargetClick : undefined
          }
          hideLineageConnectors
        />
        {hasChildAgents && expanded ? (
          <div className="worktree-agent-lineage-children">
            {childAgents.map((childAgent) =>
              renderAgentBranch(childAgent, descendantAncestorPaneKeys)
            )}
          </div>
        ) : null}
      </React.Fragment>
    )
  }

  return (
    <div
      className={cn('flex flex-col mt-1', className)}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
    >
      {props.rootAgents.map((rootAgent) => renderAgentBranch(rootAgent))}
    </div>
  )
}

export function WorktreeCardCompactAgentTree({
  agents,
  className,
  compactAgentListRootRef,
  compactRootListExpanded,
  hasLineage,
  onToggleSummary,
  stopBubble,
  ...props
}: CommonTreeProps & {
  agents: DashboardAgentRowData[]
  className?: string
  compactAgentListRootRef: React.RefObject<HTMLDivElement | null>
  compactRootListExpanded: boolean
  hasLineage: boolean
  onToggleSummary: () => void
  stopBubble: (event: React.MouseEvent) => void
}): React.JSX.Element {
  const renderCompactAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    cacheTimerActive = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childAgents = props.childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const isRootAgent = ancestorPaneKeys.size === 0
    const expanded = !props.collapsedLineageParents.has(agent.paneKey)
    const sendTarget = sendTargetFor(props, agent.paneKey)
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <CompactAgentRow
          agent={agent}
          now={props.now}
          onActivate={activationHandlerFor(agent, props.handlers)}
          onCloseAgent={props.handlers.handleCloseAgent}
          onRename={props.handlers.handleStartRenameAgent}
          sendTargetStatus={sendTarget?.status}
          sendTargetDisabledReason={sendTarget?.disabledReason}
          onSendTargetClick={
            props.isAgentSendTargetModeActive ? props.handlers.handleSendTargetClick : undefined
          }
          childAgentCount={hasChildAgents ? childAgents.length : undefined}
          childAgentsExpanded={expanded}
          onToggleChildAgents={
            hasChildAgents ? () => props.handlers.toggleLineageParent(agent.paneKey) : undefined
          }
          reserveDisclosureGutter={isRootAgent && props.anyRootHasChildren && !hasChildAgents}
          isFocusedPane={agent.paneKey === props.focusedAgentPaneKey}
          cacheTimerActive={cacheTimerActive}
        />
        {hasChildAgents ? (
          <CompactAgentExpansion expanded={expanded}>
            <div className="worktree-agent-lineage-children flex flex-col gap-0.5">
              {childAgents.map((childAgent) =>
                renderCompactAgentBranch(
                  childAgent,
                  descendantAncestorPaneKeys,
                  cacheTimerActive && expanded
                )
              )}
            </div>
          </CompactAgentExpansion>
        ) : null}
      </React.Fragment>
    )
  }

  const summaryAgents = hasLineage ? props.rootAgents : agents
  const shouldUseSummaryRow = summaryAgents.length > 1 && !props.isAgentSendTargetModeActive
  const subjectLabel = `${hasLineage ? props.rootAgents.length : agents.length} agents`

  return (
    <div
      ref={compactAgentListRootRef}
      className={cn('flex flex-col mt-1 gap-0.5', className)}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
      data-compact-agent-list="true"
    >
      {agents.length === 0 ? null : shouldUseSummaryRow ? (
        <div
          className={cn(
            'compact-agent-summary-panel',
            compactRootListExpanded && 'compact-agent-summary-panel-expanded'
          )}
        >
          <CompactAgentSummaryButton
            agents={summaryAgents}
            subjectLabel={subjectLabel}
            expanded={compactRootListExpanded}
            onToggle={onToggleSummary}
          />
          <CompactAgentExpansion expanded={compactRootListExpanded}>
            {props.rootAgents.map((rootAgent) =>
              renderCompactAgentBranch(rootAgent, new Set(), compactRootListExpanded)
            )}
          </CompactAgentExpansion>
        </div>
      ) : (
        props.rootAgents.map((rootAgent) => renderCompactAgentBranch(rootAgent))
      )}
    </div>
  )
}
