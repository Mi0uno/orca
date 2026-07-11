// @vitest-environment happy-dom

import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from './useDashboardData'
import { TooltipProvider } from '../ui/tooltip'
import DashboardAgentRow from './DashboardAgentRow'

function makeAgent(): DashboardAgentRowData {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    tab: {
      id: 'tab-1',
      ptyId: null,
      worktreeId: 'wt-1',
      title: 'Terminal 1',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 1
    },
    agentType: 'codex',
    rowSource: 'live',
    state: 'working',
    startedAt: 1,
    entry: {
      paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
      state: 'working',
      prompt: 'Fix agent actions',
      updatedAt: 1,
      stateStartedAt: 1,
      stateHistory: [],
      agentType: 'codex'
    }
  }
}

afterEach(() => cleanup())

describe('DashboardAgentRow actions', () => {
  it('runs hover actions without activating the row', async () => {
    const user = userEvent.setup()
    const agent = makeAgent()
    const onActivate = vi.fn()
    const onCloseAgent = vi.fn()
    const onRename = vi.fn()

    render(
      <TooltipProvider>
        <DashboardAgentRow
          agent={agent}
          onDismiss={vi.fn()}
          onCloseAgent={onCloseAgent}
          onRename={onRename}
          onActivate={onActivate}
          now={10_000}
          hideIdentityIcon
          hideExpand
        />
      </TooltipProvider>
    )

    await user.click(screen.getByLabelText('Rename agent'))
    await user.click(screen.getByLabelText('Close agent'))

    expect(onRename).toHaveBeenCalledWith(agent)
    expect(onCloseAgent).toHaveBeenCalledWith(agent)
    expect(onActivate).not.toHaveBeenCalled()
  })
})
