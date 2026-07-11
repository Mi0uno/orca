import React, { useCallback, useState } from 'react'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { getAgentRowPrimaryText } from '@/lib/agent-row-primary-text'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { parseResumingAgentPaneKey } from './worktree-agent-resuming-rows'

export function getAgentTabId(agent: DashboardAgentRowData): string {
  return (
    parseResumingAgentPaneKey(agent.paneKey) ?? parsePaneKey(agent.paneKey)?.tabId ?? agent.tab.id
  )
}

function getAgentRenameInitialTitle(agent: DashboardAgentRowData): string {
  return (
    agent.customTitle?.trim() ||
    agent.tab.customTitle?.trim() ||
    getAgentRowPrimaryText(agent.entry) ||
    agent.tab.title
  )
}

function WorktreeAgentRenameDialog({
  open,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  draft: string
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {translate('auto.components.sidebar.WorktreeCardAgents.renameTitle', 'Rename agent')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.sidebar.WorktreeCardAgents.renameDescription',
                'Set the label shown for this agent in the workspace list.'
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            autoFocus
            aria-label={translate(
              'auto.components.sidebar.WorktreeCardAgents.renameInput',
              'Agent name'
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {translate('auto.components.sidebar.WorktreeCardAgents.renameCancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!draft.trim()}>
              {translate('auto.components.sidebar.WorktreeCardAgents.renameSave', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function useWorktreeCardAgentActions(args: {
  agents: DashboardAgentRowData[]
  worktreeId: string
}): {
  handleCloseAgent: (agent: DashboardAgentRowData) => void
  handleStartRenameAgent: (agent: DashboardAgentRowData) => void
  renameDialog: React.JSX.Element
} {
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dropAgentStatusByTabPrefix = useAppStore((s) => s.dropAgentStatusByTabPrefix)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const clearSleepingAgentSession = useAppStore((s) => s.clearSleepingAgentSession)
  const renameAgentTitle = useAppStore((s) => s.renameAgentTitle)
  const clearAgentTitle = useAppStore((s) => s.clearAgentTitle)
  const closeTab = useAppStore((s) => s.closeTab)
  const setTabCustomTitle = useAppStore((s) => s.setTabCustomTitle)

  const [renamingAgent, setRenamingAgent] = useState<DashboardAgentRowData | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const handleCloseAgent = useCallback(
    (agent: DashboardAgentRowData) => {
      const tabId = getAgentTabId(agent)
      const sameTabAgentCount = args.agents.filter(
        (candidate) => getAgentTabId(candidate) === tabId
      ).length
      dropAgentStatus(agent.paneKey)
      dismissRetainedAgent(agent.paneKey)
      clearSleepingAgentSession(agent.paneKey)
      clearAgentTitle(agent.paneKey)
      if (agent.rowSource === 'resuming' || sameTabAgentCount <= 1) {
        dropAgentStatusByTabPrefix(tabId)
        closeTab(tabId, { recordInteraction: true, retainAgentHistory: false })
        clearSleepingAgentSession(agent.paneKey)
        clearAgentTitle(agent.paneKey)
      }
    },
    [
      args.agents,
      clearAgentTitle,
      clearSleepingAgentSession,
      closeTab,
      dismissRetainedAgent,
      dropAgentStatus,
      dropAgentStatusByTabPrefix
    ]
  )

  const handleStartRenameAgent = useCallback((agent: DashboardAgentRowData) => {
    setRenamingAgent(agent)
    setRenameDraft(getAgentRenameInitialTitle(agent))
  }, [])

  const handleRenameDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setRenamingAgent(null)
      setRenameDraft('')
    }
  }, [])

  const handleRenameSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!renamingAgent) {
        return
      }
      const title = renameDraft.trim()
      if (!title) {
        return
      }
      renameAgentTitle(renamingAgent.paneKey, title)
      const tabId = getAgentTabId(renamingAgent)
      const tabExists = (useAppStore.getState().tabsByWorktree[args.worktreeId] ?? []).some(
        (tab) => tab.id === tabId
      )
      if (tabExists) {
        setTabCustomTitle(tabId, title, { recordInteraction: true })
      }
      setRenamingAgent(null)
      setRenameDraft('')
    },
    [args.worktreeId, renameAgentTitle, renameDraft, renamingAgent, setTabCustomTitle]
  )

  return {
    handleCloseAgent,
    handleStartRenameAgent,
    renameDialog: (
      <WorktreeAgentRenameDialog
        open={renamingAgent !== null}
        draft={renameDraft}
        onDraftChange={setRenameDraft}
        onOpenChange={handleRenameDialogOpenChange}
        onSubmit={handleRenameSubmit}
      />
    )
  }
}
