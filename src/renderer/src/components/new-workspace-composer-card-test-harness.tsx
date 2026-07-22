import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { expect, vi } from 'vitest'
import NewWorkspaceComposerCard from './NewWorkspaceComposerCard'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'
import type { ProjectHostSetupOption } from '@/lib/project-host-setup-options'

const hoistedMocks = vi.hoisted(() => ({
  storeMocks: {
    closeModal: vi.fn(),
    openModal: vi.fn(),
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    setRuntimeEnvironmentStatus: vi.fn()
  },
  apiMocks: {
    runtimeGetStatus: vi.fn(),
    sshConnect: vi.fn()
  }
}))

export const storeMocks = hoistedMocks.storeMocks
export const apiMocks = hoistedMocks.apiMocks

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        closeModal: hoistedMocks.storeMocks.closeModal,
        openModal: hoistedMocks.storeMocks.openModal,
        openSettingsPage: hoistedMocks.storeMocks.openSettingsPage,
        openSettingsTarget: hoistedMocks.storeMocks.openSettingsTarget,
        setRuntimeEnvironmentStatus: hoistedMocks.storeMocks.setRuntimeEnvironmentStatus,
        activeModal: 'none',
        settings: { defaultTuiAgent: null, disabledTuiAgents: [] },
        updateSettings: vi.fn()
      }),
    {
      getState: () => ({
        setRuntimeEnvironmentStatus: hoistedMocks.storeMocks.setRuntimeEnvironmentStatus
      })
    }
  )
}))

vi.mock('@/components/contextual-tours/use-contextual-tour', () => ({
  useContextualTour: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/agent/AgentCombobox', () => ({
  default: () => <button type="button">Agent picker</button>
}))

// Stub the host-add dialog to its `mode`; the dialog's own SSH/runtime IPC has separate coverage.
vi.mock('@/components/sidebar/AddRemoteHostDialog', () => ({
  AddRemoteHostDialog: ({ mode }: { mode: 'ssh' | 'server' | null }) =>
    mode ? <div data-testid="add-remote-host-dialog" data-mode={mode} /> : null
}))

vi.mock('@/components/sparse/SparseCheckoutPresetSelect', () => ({
  default: () => <div data-testid="sparse-select" />
}))

vi.mock('@/components/new-workspace/SmartWorkspaceNameField', () => ({
  default: ({
    branchesEnabled,
    textOnly,
    repoBackedSourcesDisabled,
    repoBackedSearchRepos = []
  }: {
    branchesEnabled?: boolean
    textOnly?: boolean
    repoBackedSourcesDisabled?: boolean
    repoBackedSearchRepos?: { displayName: string }[]
  }) => (
    <input
      aria-label="workspace name"
      data-branches-enabled={branchesEnabled ? 'true' : 'false'}
      data-text-only={textOnly ? 'true' : 'false'}
      data-repo-backed-search-count={repoBackedSearchRepos.length}
      data-repo-backed-search-names={repoBackedSearchRepos
        .map((repo) => repo.displayName)
        .join(',')}
      data-repo-backed-sources-disabled={repoBackedSourcesDisabled ? 'true' : 'false'}
    />
  )
}))

vi.mock('@/components/new-workspace/ProjectCombobox', () => ({
  default: ({
    options,
    value,
    onValueChange
  }: {
    options: NewWorkspaceProjectOption[]
    value: string | null
    onValueChange: (value: string) => void
  }) => (
    <div data-testid="project-combobox" data-value={value ?? ''}>
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onValueChange(option.id)}>
          {option.displayName}
        </button>
      ))}
    </div>
  )
}))

const projectOptions: NewWorkspaceProjectOption[] = [
  {
    kind: 'project-group',
    id: 'project-group:platform',
    projectGroupId: 'platform',
    displayName: 'Platform',
    badgeColor: 'var(--muted-foreground)',
    detail: '/workspace/platform',
    parentPath: '/workspace/platform',
    connectionId: null
  }
]

export const sourceRepos = [
  {
    id: 'repo-a',
    displayName: 'Repo A',
    path: '/repo-a',
    badgeColor: '#111111'
  },
  {
    id: 'repo-b',
    displayName: 'Repo B',
    path: '/repo-b',
    badgeColor: '#222222'
  }
]

export const localReadyHostOption: ProjectHostSetupOption = {
  kind: 'ready',
  id: 'setup-local',
  projectId: 'project-group:platform',
  hostId: 'local',
  repoId: 'repo-a',
  label: 'Local Mac',
  detail: 'Orca',
  path: '/Users/alice/orca'
}

export const devboxNeedsSetupHostOption: ProjectHostSetupOption = {
  kind: 'needs-setup',
  id: 'needs-setup:ssh:devbox',
  projectId: 'project-group:platform',
  hostId: 'ssh:devbox',
  label: 'Devbox',
  detail: 'Project not set up on this host',
  isAvailable: true,
  attention: false
}

export const disconnectedDevboxNeedsSetupHostOption: ProjectHostSetupOption = {
  kind: 'needs-setup',
  id: 'needs-setup:ssh:devbox',
  projectId: 'project-group:platform',
  hostId: 'ssh:devbox',
  label: 'Devbox',
  detail: 'Connect this host to set up projects',
  isAvailable: false,
  attention: false,
  connectAction: { kind: 'ssh', targetId: 'devbox' }
}

export const disconnectedBastionNeedsSetupHostOption: ProjectHostSetupOption = {
  kind: 'needs-setup',
  id: 'needs-setup:ssh:bastion',
  projectId: 'project-group:platform',
  hostId: 'ssh:bastion',
  label: 'Bastion',
  detail: 'Connect this host to set up projects',
  isAvailable: false,
  attention: false,
  connectAction: { kind: 'ssh', targetId: 'bastion' }
}

export type RenderedNewWorkspaceComposerCard = {
  container: HTMLDivElement
  root: Root
}

export function renderCard(
  overrides: Partial<React.ComponentProps<typeof NewWorkspaceComposerCard>> = {}
): RenderedNewWorkspaceComposerCard {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <NewWorkspaceComposerCard
        quickAgent={null}
        onQuickAgentChange={() => {}}
        eligibleRepos={[]}
        repoId="repo-a"
        projectOptions={projectOptions}
        selectedProjectId="project-group:platform"
        selectedRepoIsGit
        onRepoChange={() => {}}
        onProjectChange={() => {}}
        primaryActionLabel="Create workspace"
        name=""
        onNameValueChange={() => {}}
        onSmartGitHubItemSelect={() => {}}
        onSmartGitLabItemSelect={() => {}}
        onSmartBranchSelect={() => {}}
        onSmartLinearIssueSelect={() => {}}
        smartNameSelection={null}
        onClearSmartNameSelection={() => {}}
        canReuseSelectedBranch={false}
        reuseSelectedBranch={false}
        onReuseSelectedBranchChange={() => {}}
        branchNameOverride=""
        onBranchNameOverrideChange={() => {}}
        forkPushWarning={null}
        detectedAgentIds={null}
        onOpenAgentSettings={() => {}}
        advancedOpen={false}
        onToggleAdvanced={() => {}}
        createDisabled={false}
        projectError={null}
        creating={false}
        onCreate={() => {}}
        note=""
        onNoteChange={() => {}}
        setupConfig={null}
        requiresExplicitSetupChoice={false}
        setupDecision={null}
        onSetupDecisionChange={() => {}}
        setupAgentStartupPolicy="start-immediately"
        onSetupAgentStartupPolicyChange={() => {}}
        shouldWaitForSetupCheck={false}
        resolvedSetupDecision={null}
        createError={null}
        selectedRepoConnectionId={null}
        selectedRepoSshStatus={null}
        selectedRepoRequiresConnection={false}
        selectedRepoConnectInProgress={false}
        onConnectSelectedRepo={async () => {}}
        canUseSparseCheckout={false}
        sparsePresets={[]}
        sparseSelectedPresetId={null}
        onSparseSelectPreset={() => {}}
        branchesEnabled={false}
        setupControlsEnabled={false}
        sparseControlsEnabled={false}
        {...overrides}
      />
    )
  })
  return { container, root }
}

export function findInputByLabel(
  container: HTMLElement,
  labelText: string
): HTMLInputElement | null {
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === labelText
  )
  const labelledId = label?.getAttribute('for')
  if (labelledId) {
    return document.getElementById(labelledId) as HTMLInputElement | null
  }
  return label?.parentElement?.querySelector<HTMLInputElement>('input') ?? null
}

export function changeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export function openRunTargetPicker(container: HTMLElement): void {
  const runTargetButton = container.querySelector<HTMLButtonElement>('button[role="combobox"]')
  expect(runTargetButton).toBeTruthy()
  act(() => runTargetButton?.click())
}

export function findRunTargetItem(label: string): HTMLElement | undefined {
  return [...document.body.querySelectorAll<HTMLElement>('[cmdk-item]')].find((item) =>
    item.textContent?.includes(label)
  )
}

export function findConnectButton(label: string): HTMLButtonElement | undefined {
  const item = findRunTargetItem(label)
  return [...(item?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Connect')
  )
}
