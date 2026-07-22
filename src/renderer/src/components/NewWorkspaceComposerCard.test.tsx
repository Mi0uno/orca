// @vitest-environment happy-dom

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiMocks,
  changeInputValue,
  devboxNeedsSetupHostOption,
  disconnectedBastionNeedsSetupHostOption,
  disconnectedDevboxNeedsSetupHostOption,
  findConnectButton,
  findInputByLabel,
  findRunTargetItem,
  localReadyHostOption,
  openRunTargetPicker,
  renderCard,
  sourceRepos,
  storeMocks
} from './new-workspace-composer-card-test-harness'

let current: ReturnType<typeof renderCard> | null = null

describe('NewWorkspaceComposerCard folder task source mode', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      runtimeEnvironments: {
        getStatus: apiMocks.runtimeGetStatus
      },
      ssh: {
        connect: apiMocks.sshConnect
      }
    }
    apiMocks.runtimeGetStatus.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'runtime-devbox',
        rendererGraphEpoch: 1,
        graphStatus: 'ready',
        authoritativeWindowId: null,
        liveTabCount: 0,
        liveLeafCount: 0
      },
      _meta: { runtimeId: 'runtime-devbox' }
    })
    apiMocks.sshConnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    act(() => current?.root.unmount())
    current?.container.remove()
    current = null
    vi.clearAllMocks()
  })

  it('passes folder child repos into the create-from field without a source trigger', () => {
    current = renderCard({
      repoBackedSearchRepos: sourceRepos as never
    })

    const projectSection = current.container.querySelector(
      '[data-contextual-tour-target="workspace-creation-project"]'
    )
    const nameSection = current.container.querySelector(
      '[data-contextual-tour-target="workspace-creation-name"]'
    )
    expect(projectSection?.textContent).not.toContain('Task Source')
    expect(nameSection?.textContent).toContain("Name or 'Create From'")
    expect(
      current.container
        .querySelector('[aria-label="workspace name"]')
        ?.getAttribute('data-repo-backed-search-count')
    ).toBe('2')
    expect(
      current.container
        .querySelector('[aria-label="workspace name"]')
        ?.getAttribute('data-repo-backed-search-names')
    ).toBe('Repo A,Repo B')
    expect(current.container.querySelector('[data-testid="repo-backed-source-trigger"]')).toBeNull()
    expect(current.container.querySelectorAll('[data-testid="project-combobox"]')).toHaveLength(1)
  })

  it('keeps the reuse-branch row collapsed until a local branch is reusable', () => {
    // Why: the row stays mounted (for the smooth height transition) but is
    // collapsed + aria-hidden when reuse isn't possible.
    current = renderCard({ canReuseSelectedBranch: false })
    const collapsedReuse = [...current.container.querySelectorAll('[aria-hidden="true"]')].find(
      (el) => el.textContent?.includes('Reuse branch')
    )
    expect(collapsedReuse).toBeTruthy()

    act(() => current?.root.unmount())
    current?.container.remove()

    current = renderCard({ canReuseSelectedBranch: true, reuseSelectedBranch: true })
    const reuseLabel = [...current.container.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('Reuse branch')
    )
    expect(reuseLabel).toBeTruthy()
    // Visible: not inside an aria-hidden (collapsed) wrapper.
    expect(reuseLabel?.closest('[aria-hidden="true"]')).toBeNull()
    expect(current.container.textContent).toContain(
      'Check out the existing branch instead of creating a new one from it.'
    )
  })

  it('emits the toggled value from the reuse checkbox in both directions', () => {
    const clickReuseCheckbox = (): void => {
      const reuseLabel = [...(current?.container.querySelectorAll('label') ?? [])].find((label) =>
        label.textContent?.includes('Reuse branch')
      )
      const checkbox = reuseLabel?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      expect(checkbox).toBeTruthy()
      act(() => checkbox?.click())
    }

    // Checked -> unchecked (opting out of reuse).
    const offChanges: boolean[] = []
    current = renderCard({
      canReuseSelectedBranch: true,
      reuseSelectedBranch: true,
      onReuseSelectedBranchChange: (next) => offChanges.push(next)
    })
    clickReuseCheckbox()
    expect(offChanges).toEqual([false])

    act(() => current?.root.unmount())
    current?.container.remove()

    // Unchecked -> checked (opting into reuse — the action that pins the branch).
    const onChanges: boolean[] = []
    current = renderCard({
      canReuseSelectedBranch: true,
      reuseSelectedBranch: false,
      onReuseSelectedBranchChange: (next) => onChanges.push(next)
    })
    clickReuseCheckbox()
    expect(onChanges).toEqual([true])
  })

  it('shows the setup startup policy toggle only when setup is available', () => {
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      setupConfig: {
        source: 'yaml',
        command: '# defaultTabs[1]\npnpm dev',
        kind: 'default-tabs'
      }
    })
    expect(current.container.textContent).not.toContain(
      'Wait for setup to complete before starting agent'
    )

    act(() => current?.root.unmount())
    current?.container.remove()

    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      setupConfig: {
        source: 'yaml',
        command: 'pnpm install',
        kind: 'setup'
      }
    })
    expect(current.container.textContent).toContain(
      'Wait for setup to complete before starting agent'
    )
  })

  it('emits the setup startup policy toggle value when setup will run', () => {
    const changes: string[] = []
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      resolvedSetupDecision: 'run',
      setupConfig: {
        source: 'yaml',
        command: 'pnpm install',
        kind: 'setup'
      },
      onSetupAgentStartupPolicyChange: (next) => changes.push(next)
    })

    const waitSwitch = current.container.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="Wait for setup to complete before starting agent"]'
    )
    expect(waitSwitch).toBeTruthy()
    expect(waitSwitch?.disabled).toBe(false)
    act(() => waitSwitch?.click())
    expect(changes).toEqual(['wait-for-setup'])
  })

  it('disables the wait-for-setup toggle when setup is set to skip', () => {
    const changes: string[] = []
    current = renderCard({
      advancedOpen: true,
      setupControlsEnabled: true,
      resolvedSetupDecision: 'skip',
      setupConfig: {
        source: 'yaml',
        command: 'pnpm install',
        kind: 'setup'
      },
      onSetupAgentStartupPolicyChange: (next) => changes.push(next)
    })

    const waitSwitch = current.container.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="Wait for setup to complete before starting agent"]'
    )
    expect(waitSwitch?.disabled).toBe(true)
    // Nothing to wait for when setup won't run — clicking is inert.
    act(() => waitSwitch?.click())
    expect(changes).toEqual([])
  })

  it('shows a git-only branch name field in Advanced and emits manual edits', () => {
    const changes: (string | undefined)[] = []
    current = renderCard({
      advancedOpen: false,
      branchesEnabled: true,
      branchNameOverride: 'feature/initial',
      onBranchNameOverrideChange: (next) => changes.push(next)
    })

    const branchInput = findInputByLabel(current.container, 'Branch name')
    expect(branchInput).toBeTruthy()
    expect(branchInput?.value).toBe('feature/initial')

    changeInputValue(branchInput as HTMLInputElement, 'feature/manual')

    expect(changes).toEqual(['feature/manual'])
  })

  it('omits the branch name field for non-git projects', () => {
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      selectedRepoIsGit: false,
      branchNameOverride: 'feature/manual',
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeNull()
  })

  it('omits the branch name field when a tracked work item is the source', () => {
    // Why: a PR/issue/MR/Linear source derives the branch itself (and a linked
    // GitHub PR re-resolves it at submit), so a manual override would be a
    // silently ignored control — the field is only for typed-name/base-branch.
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      branchNameOverride: 'feature/manual',
      smartNameSelection: { kind: 'github-pr', label: '#42 Fix', url: 'https://example.com/pr/42' },
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeNull()
  })

  it('keeps the branch name field when creating from a base branch', () => {
    // Why: choosing a base branch still lets the user name their new branch.
    current = renderCard({
      advancedOpen: true,
      branchesEnabled: true,
      branchNameOverride: 'feature/manual',
      smartNameSelection: { kind: 'branch', label: 'main' },
      onBranchNameOverrideChange: vi.fn()
    })

    expect(findInputByLabel(current.container, 'Branch name')).toBeTruthy()
  })

  it('does not disable folder workspace creation when only source lookup needs SSH', () => {
    current = renderCard({
      eligibleRepos: [
        { id: 'repo-a', displayName: 'Repo A', path: '/repo-a', connectionId: 'ssh-a' } as never
      ],
      repoBackedSearchRepos: sourceRepos as never,
      repoBackedSourcesDisabled: false
    })

    const createButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Create workspace')
    )
    expect(createButton).toBeTruthy()
    expect(createButton?.hasAttribute('disabled')).toBe(false)
    expect(
      current.container
        .querySelector('[aria-label="workspace name"]')
        ?.getAttribute('data-repo-backed-sources-disabled')
    ).toBe('false')
  })

  it('shows a switch-to-worktree entry for folder projects before initialization is needed', () => {
    const useGitWorktrees = vi.fn()
    current = renderCard({
      selectedRepoIsGit: false,
      projectModeSwitch: {
        targetMode: 'git-worktrees',
        initializeGit: false,
        onInitializeGitChange: vi.fn(),
        onSwitchMode: useGitWorktrees,
        preparing: false,
        disabled: false
      }
    })

    expect(current.container.textContent).toContain('Git worktrees')
    expect(current.container.textContent).toContain('Switch to worktree mode')
    expect(current.container.textContent).not.toContain('Initialize Git here')
    expect(
      current.container
        .querySelector('[aria-label="workspace name"]')
        ?.getAttribute('data-text-only')
    ).toBe('true')

    const gitButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Switch to worktree mode')
    )
    expect(gitButton).toBeTruthy()
    act(() => gitButton?.click())
    expect(useGitWorktrees).toHaveBeenCalledTimes(1)
  })

  it('shows the initialization checkbox when worktree mode finds a non-git folder', () => {
    const initializeChanges: boolean[] = []
    const useGitWorktrees = vi.fn()
    current = renderCard({
      selectedRepoIsGit: false,
      projectModeSwitch: {
        targetMode: 'git-worktrees',
        initializeGit: true,
        onInitializeGitChange: (next) => initializeChanges.push(next),
        onSwitchMode: useGitWorktrees,
        preparing: false,
        disabled: false,
        showInitializeGitOption: true
      }
    })

    expect(current.container.textContent).toContain('Git worktrees')
    expect(current.container.textContent).toContain('Initialize Git here')

    const initializeLabel = [...current.container.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('Initialize Git here')
    )
    const checkbox = initializeLabel?.querySelector<HTMLElement>('[role="checkbox"]')
    expect(checkbox).toBeTruthy()
    expect(checkbox?.getAttribute('aria-checked')).toBe('true')
    act(() => checkbox?.click())
    expect(initializeChanges).toEqual([false])

    const gitButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Switch to worktree mode')
    )
    expect(gitButton).toBeTruthy()
    act(() => gitButton?.click())
    expect(useGitWorktrees).toHaveBeenCalledTimes(1)
  })

  it('shows a switch-to-folder entry for Git worktree projects', () => {
    const useFolderMode = vi.fn()
    current = renderCard({
      selectedRepoIsGit: true,
      branchesEnabled: true,
      projectModeSwitch: {
        targetMode: 'folder-workspace',
        initializeGit: false,
        onInitializeGitChange: vi.fn(),
        onSwitchMode: useFolderMode,
        preparing: false,
        disabled: false
      }
    })

    expect(current.container.textContent).toContain('Plain folder workspaces')
    expect(current.container.textContent).toContain('Switch to plain mode')
    expect(current.container.textContent).not.toContain('Initialize Git here')

    const folderButton = [...current.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Switch to plain mode')
    )
    expect(folderButton).toBeTruthy()
    act(() => folderButton?.click())
    expect(useFolderMode).toHaveBeenCalledTimes(1)
  })

  it('enables branch source selection once the project is in Git worktree mode', () => {
    current = renderCard({
      selectedRepoIsGit: true,
      branchesEnabled: true,
      projectModeSwitch: undefined
    })

    const sourceInput = current.container.querySelector('[aria-label="workspace name"]')
    expect(sourceInput?.getAttribute('data-text-only')).toBe('false')
    expect(sourceInput?.getAttribute('data-branches-enabled')).toBe('true')
    expect(current.container.textContent).toContain("Name or 'Create From'")
  })

  it('shows setup-needed hosts in the run target picker when one setup is ready', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    expect(current.container.textContent).toContain('Run on')
    openRunTargetPicker(current.container)

    const devboxItem = findRunTargetItem('Devbox')
    expect(devboxItem?.textContent).toContain('Project not set up on this host')
    // Not-connected rows stay highlightable (not disabled) so they hover like the other
    // items; a separator sets them off instead of a heading.
    expect(devboxItem?.getAttribute('aria-disabled')).toBe('false')
    expect(devboxItem?.getAttribute('data-disabled')).toBe('false')
    expect(document.body.querySelector('[cmdk-separator]')).toBeTruthy()
  })

  it('shows the run target picker for one ready setup so hosts can be added', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    expect(current.container.textContent).toContain('Run on')
    openRunTargetPicker(current.container)
    expect(findRunTargetItem('Add host')).toBeTruthy()
  })

  it('does not select setup-needed run target rows', () => {
    const hostChanges: string[] = []
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId)
    })

    openRunTargetPicker(current.container)
    const devboxItem = findRunTargetItem('Devbox')
    expect(devboxItem).toBeTruthy()
    act(() => devboxItem?.click())

    expect(hostChanges).toEqual([])
  })

  it('connects disconnected setup-needed SSH hosts without selecting them', async () => {
    const hostChanges: string[] = []
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, disconnectedDevboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId)
    })

    openRunTargetPicker(current.container)
    const devboxItem = findRunTargetItem('Devbox')
    expect(
      devboxItem?.getAttribute('aria-disabled') === 'true' ||
        devboxItem?.hasAttribute('data-disabled')
    ).toBe(true)
    const connectButton = [...(devboxItem?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Connect')
    )
    expect(connectButton).toBeTruthy()

    await act(async () => {
      connectButton?.click()
    })

    expect(apiMocks.sshConnect).toHaveBeenCalledWith({ targetId: 'devbox' })
    expect(hostChanges).toEqual([])
    // The picker stays open so the connecting state is visible; the row is not auto-selected.
    expect(findRunTargetItem('Devbox')).toBeTruthy()
  })

  it('keeps other hosts connectable while one connect is still in flight', async () => {
    // First host's connect never resolves — a stalled connect must not disable the others.
    apiMocks.sshConnect.mockImplementation(({ targetId }: { targetId: string }) =>
      targetId === 'devbox' ? new Promise(() => {}) : Promise.resolve(undefined)
    )
    current = renderCard({
      projectHostSetupOptions: [
        localReadyHostOption,
        disconnectedDevboxNeedsSetupHostOption,
        disconnectedBastionNeedsSetupHostOption
      ],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    await act(async () => {
      findConnectButton('Devbox')?.click()
    })

    // The picker stays open through the connect, so the state is inspectable in place.
    // Devbox is mid-connect: disabled, showing the connecting indicator; Bastion stays clickable.
    const devboxButton = findConnectButton('Devbox')
    expect(devboxButton?.disabled).toBe(true)
    expect(devboxButton?.textContent).toContain('Connecting')
    const bastionButton = findConnectButton('Bastion')
    expect(bastionButton?.disabled).toBe(false)
    expect(bastionButton?.textContent).toContain('Connect')

    await act(async () => {
      bastionButton?.click()
    })
    expect(apiMocks.sshConnect).toHaveBeenCalledWith({ targetId: 'bastion' })
  })

  it('stops the connecting indicator when the connect fails', async () => {
    // A failed connect must clear the spinner and restore the Connect button so the user
    // can retry — the row can't stay stuck on "Connecting" after the error.
    apiMocks.sshConnect.mockRejectedValue(new Error('connection refused'))
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, disconnectedDevboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    await act(async () => {
      findConnectButton('Devbox')?.click()
    })

    const devboxButton = findConnectButton('Devbox')
    expect(devboxButton?.disabled).toBe(false)
    expect(devboxButton?.textContent).toContain('Connect')
    expect(devboxButton?.textContent).not.toContain('Connecting')
  })

  it('opens the SSH host add dialog over the composer without leaving for Settings', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    act(() => findRunTargetItem('Add SSH host')?.click())

    const dialog = document.body.querySelector('[data-testid="add-remote-host-dialog"]')
    expect(dialog?.getAttribute('data-mode')).toBe('ssh')
    // The composer stays put — no navigation that would discard the in-progress form.
    expect(storeMocks.closeModal).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsPage).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsTarget).not.toHaveBeenCalled()
  })

  it('opens the add-host submenu on hover without a click', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    const addHost = findRunTargetItem('Add host')
    expect(addHost).toBeTruthy()
    // Hovering the row (no click) opens its submenu so it feels like a menu. React derives
    // onPointerEnter from a bubbling pointerover, which is what jsdom dispatches here.
    act(() => {
      addHost?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    })

    expect(findRunTargetItem('Add SSH host')).toBeTruthy()
    expect(findRunTargetItem('Add Remote Orca Server')).toBeTruthy()
  })

  it('opens the remote Orca server add dialog over the composer without leaving for Settings', () => {
    current = renderCard({
      projectHostSetupOptions: [localReadyHostOption, devboxNeedsSetupHostOption],
      selectedProjectHostSetupId: 'setup-local'
    })

    openRunTargetPicker(current.container)
    act(() => findRunTargetItem('Add host')?.click())
    act(() => findRunTargetItem('Add Remote Orca Server')?.click())

    const dialog = document.body.querySelector('[data-testid="add-remote-host-dialog"]')
    expect(dialog?.getAttribute('data-mode')).toBe('server')
    expect(storeMocks.closeModal).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsPage).not.toHaveBeenCalled()
    expect(storeMocks.openSettingsTarget).not.toHaveBeenCalled()
  })

  it('shows VM recipes inside the run target picker', () => {
    const hostChanges: string[] = []
    const recipeChanges: (string | null)[] = []
    current = renderCard({
      projectHostSetupOptions: [
        {
          kind: 'ready',
          id: 'setup-local',
          label: 'Local Mac',
          path: '/Users/alice/orca'
        },
        {
          kind: 'ready',
          id: 'setup-builder',
          label: 'Builder',
          path: '/workspace/orca'
        }
      ] as never,
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId),
      ephemeralVmRecipes: [
        {
          id: 'vercel',
          name: 'Vercel Sandbox',
          create: './scripts/orca-vm/vercel.start.sh',
          destroy: './scripts/orca-vm/vercel.cleanup.sh',
          destroyDisabled: false
        }
      ] as never,
      onEphemeralVmRecipeChange: (recipeId) => recipeChanges.push(recipeId)
    })

    expect(current.container.textContent).toContain('Run on')
    expect(current.container.textContent).not.toContain('VM recipe')

    const runTargetButton =
      current.container.querySelector<HTMLButtonElement>('button[role="combobox"]')
    expect(runTargetButton).toBeTruthy()
    act(() => runTargetButton?.click())

    expect(document.body.textContent).toContain('Per-Workspace Environment')
    const ephemeralVmItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ].find((item) => item.textContent?.includes('Per-Workspace Environment'))
    expect(ephemeralVmItem).toBeTruthy()
    act(() => ephemeralVmItem?.click())

    const recipeItem = [...document.body.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
      (item) => item.textContent?.includes('Vercel Sandbox')
    )
    expect(recipeItem).toBeTruthy()
    act(() => recipeItem?.click())

    expect(recipeChanges).toEqual(['vercel'])
    expect(hostChanges).toEqual([])
  })

  it('clears the selected VM recipe when an existing host is selected', () => {
    const hostChanges: string[] = []
    const recipeChanges: (string | null)[] = []
    current = renderCard({
      projectHostSetupOptions: [
        {
          kind: 'ready',
          id: 'setup-local',
          label: 'Local Mac',
          path: '/Users/alice/orca'
        },
        {
          kind: 'ready',
          id: 'setup-builder',
          label: 'Builder',
          path: '/workspace/orca'
        }
      ] as never,
      selectedProjectHostSetupId: 'setup-local',
      onProjectHostSetupChange: (setupId) => hostChanges.push(setupId),
      ephemeralVmRecipes: [
        {
          id: 'vercel',
          name: 'Vercel Sandbox',
          create: './scripts/orca-vm/vercel.start.sh',
          destroyDisabled: true
        }
      ] as never,
      selectedEphemeralVmRecipeId: 'vercel',
      onEphemeralVmRecipeChange: (recipeId) => recipeChanges.push(recipeId)
    })

    const runTargetButton =
      current.container.querySelector<HTMLButtonElement>('button[role="combobox"]')
    expect(runTargetButton?.textContent).toContain('Per-Workspace Environment')
    act(() => runTargetButton?.click())

    const builderItem = [...document.body.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
      (item) => item.textContent?.includes('Builder')
    )
    expect(builderItem).toBeTruthy()
    act(() => builderItem?.click())

    expect(hostChanges).toEqual(['setup-builder'])
    expect(recipeChanges).toEqual([null])
  })
})
