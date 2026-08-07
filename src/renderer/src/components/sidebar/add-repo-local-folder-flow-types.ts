import type { AddRepoExistingWorkspaceSource } from '../../../../shared/telemetry-events'
import type { NestedRepoScanResult, Repo } from '../../../../shared/types'
import type { NestedRepoTelemetryRuntimeKind } from '../../../../shared/nested-repo-telemetry'
import type { AddRepoOptions } from '../../../../shared/add-repo-options'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { RepoSlice } from '@/store/slices/repos'
import type { WorktreeFetchOptions } from '@/store/slices/worktree-helpers'

export type AddRepoLocalFolderShowNestedRepoReview = (args: {
  scan: NestedRepoScanResult
  selectedPath: string
  connectionId: string | null
  attemptId: string
  runtimeKind: NestedRepoTelemetryRuntimeKind
  inProgress: boolean
  scanId: string | null
  runtimeEnvironmentId?: string | null
}) => void

export type LocalPathAddResult =
  | { status: 'completed'; repo: Repo }
  | { status: 'cancelled' | 'paused' | 'skipped' }

export type LocalPathAddMode = 'single' | 'batch'

export type AddRepoLocalFolderSource = AddRepoExistingWorkspaceSource

export type AddRepoPathOptions = AddRepoOptions & { runtimeEnvironmentId?: string | null }

export type UseAddRepoLocalFolderFlowArgs = {
  isOpen: boolean
  droppedLocalPath: string
  activeRuntimeEnvironmentId: string | null | undefined
  addProjectKind?: 'git' | 'folder'
  initializeGitOnAdd?: boolean
  addRepoPath: (
    path: string,
    kind?: 'git' | 'folder',
    options?: AddRepoPathOptions
  ) => Promise<Repo | null>
  closeModal: () => void
  fetchWorktrees: (repoId: string, options?: WorktreeFetchOptions) => Promise<unknown>
  scanNestedRepos: RepoSlice['scanNestedRepos']
  setActiveNestedScanId: (scanId: string | null, runtimeEnvironmentId?: string | null) => void
  setNestedScanInProgress: (inProgress: boolean) => void
  showNestedRepoReview: AddRepoLocalFolderShowNestedRepoReview
  onGitRepoReady: (
    repoId: string,
    source: AddRepoLocalFolderSource,
    executionHostId?: ExecutionHostId
  ) => Promise<void>
  setIsAdding: (isAdding: boolean) => void
  setAddProjectBusyLabel: (label: string | null) => void
}
