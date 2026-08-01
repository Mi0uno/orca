import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { NestedRepoTelemetryRuntimeKind } from '../../../../shared/nested-repo-telemetry'
import type { AddRepoExistingWorkspaceSource } from '../../../../shared/telemetry-events'
import type { NestedRepoScanResult, Repo } from '../../../../shared/types'
import type { WorktreeFetchOptions } from '@/store/slices/worktree-helpers'
import type { RepoSlice } from '@/store/slices/repos'
import { createNestedRepoScanId } from './add-repo-dialog-types'
import { translate } from '@/i18n/i18n'
import { scanLocalPathForNestedRepos, startLocalNestedScan } from './local-folder-nested-scan'
import { worktreeRefreshOptions } from './add-repo-runtime-owner'
import type { ExecutionHostId } from '../../../../shared/execution-host'

type ShowNestedRepoReview = (args: {
  scan: NestedRepoScanResult
  selectedPath: string
  connectionId: string | null
  attemptId: string
  runtimeKind: NestedRepoTelemetryRuntimeKind
  inProgress: boolean
  scanId: string | null
  runtimeEnvironmentId?: string | null
}) => void

type LocalPathAddResult =
  | { status: 'completed'; repo: Repo }
  | { status: 'cancelled' | 'paused' | 'skipped' }

type LocalPathAddMode = 'single' | 'batch'

export function useAddRepoLocalFolderFlow({
  isOpen,
  droppedLocalPath,
  activeRuntimeEnvironmentId,
  addProjectKind = 'git',
  initializeGitOnAdd = false,
  addRepoPath,
  closeModal,
  fetchWorktrees,
  scanNestedRepos,
  setActiveNestedScanId,
  setNestedScanInProgress,
  showNestedRepoReview,
  onGitRepoReady,
  setIsAdding,
  setAddProjectBusyLabel
}: {
  isOpen: boolean
  droppedLocalPath: string
  activeRuntimeEnvironmentId: string | null | undefined
  addProjectKind?: 'git' | 'folder'
  initializeGitOnAdd?: boolean
  addRepoPath: RepoSlice['addRepoPath']
  closeModal: () => void
  fetchWorktrees: (repoId: string, options?: WorktreeFetchOptions) => Promise<unknown>
  scanNestedRepos: RepoSlice['scanNestedRepos']
  setActiveNestedScanId: (scanId: string | null, runtimeEnvironmentId?: string | null) => void
  setNestedScanInProgress: (inProgress: boolean) => void
  showNestedRepoReview: ShowNestedRepoReview
  onGitRepoReady: (
    repoId: string,
    source: AddRepoExistingWorkspaceSource,
    selectedPath?: string,
    executionHostId?: ExecutionHostId
  ) => Promise<void>
  setIsAdding: (isAdding: boolean) => void
  setAddProjectBusyLabel: (label: string | null) => void
}): {
  handleBrowse: () => Promise<void>
  resetLocalFolderFlow: () => void
} {
  const localAddGenRef = useRef(0)
  const droppedLocalPathHandledRef = useRef<string | null>(null)

  const resetLocalFolderFlow = useCallback((): void => {
    localAddGenRef.current++
    droppedLocalPathHandledRef.current = null
  }, [])

  const clearNestedScanState = useCallback((): void => {
    setNestedScanInProgress(false)
    setActiveNestedScanId(null)
  }, [setActiveNestedScanId, setNestedScanInProgress])

  const addLocalPathForGeneration = useCallback(
    async (
      path: string,
      source: AddRepoExistingWorkspaceSource,
      gen: number,
      mode: LocalPathAddMode = 'single'
    ): Promise<LocalPathAddResult> => {
      if (activeRuntimeEnvironmentId?.trim()) {
        toast.error(
          translate(
            'auto.components.sidebar.useAddRepoLocalFolderFlow.7ab10e4974',
            'Use a host path to add projects from a remote host.'
          )
        )
        closeModal()
        return { status: 'paused' }
      }
      // Why: only the default git branch-project path scans for nested repos; an
      // initialize-git add or an explicit folder add skips the scan and adds directly.
      const shouldScanNestedRepos = addProjectKind === 'git' && !initializeGitOnAdd
      setAddProjectBusyLabel(
        shouldScanNestedRepos
          ? 'Scanning for repositories...'
          : addProjectKind === 'git'
            ? 'Opening project...'
            : 'Opening folder...'
      )
      try {
        if (shouldScanNestedRepos) {
          startLocalNestedScan(
            createNestedRepoScanId(),
            activeRuntimeEnvironmentId,
            setActiveNestedScanId,
            setNestedScanInProgress
          )
          const result = await scanLocalPathForNestedRepos({
            path,
            mode,
            runtimeEnvironmentId: activeRuntimeEnvironmentId,
            isCurrentGeneration: () => gen === localAddGenRef.current,
            scanNestedRepos,
            showNestedRepoReview
          })
          if (gen !== localAddGenRef.current) {
            return { status: 'cancelled' }
          }
          clearNestedScanState()
          if (result.kind === 'skipped') {
            return { status: 'skipped' }
          }
          if (result.kind === 'paused') {
            return { status: 'paused' }
          }
          if (result.kind === 'cancelled') {
            return { status: 'cancelled' }
          }
        }
        setAddProjectBusyLabel(
          addProjectKind === 'git' ? 'Opening project...' : 'Opening folder...'
        )
        const repo = await addRepoPath(path, addProjectKind, {
          runtimeEnvironmentId: activeRuntimeEnvironmentId ?? null,
          initializeGit: addProjectKind === 'git' ? initializeGitOnAdd : false,
          requireExactGitRoot: true
        })
        if (gen !== localAddGenRef.current) {
          return { status: 'cancelled' }
        }
        if (!repo) {
          return { status: 'paused' }
        }
        if (isGitRepoKind(repo)) {
          // Why: a transient non-authoritative refresh must not strand a persisted repo.
          const ownerOptions = worktreeRefreshOptions(activeRuntimeEnvironmentId ?? null)
          await fetchWorktrees(repo.id, ownerOptions)
          if (gen !== localAddGenRef.current) {
            return { status: 'cancelled' }
          }
          if (mode === 'batch') {
            return { status: 'completed', repo }
          }
          await (ownerOptions.executionHostId
            ? onGitRepoReady(repo.id, source, repo.path, ownerOptions.executionHostId)
            : onGitRepoReady(repo.id, source, repo.path))
        } else {
          // Why: folder repos skip the Git default-checkout handoff and activate
          // their synthetic root workspace in the folder add flow.
          closeModal()
        }
        return { status: 'completed', repo }
      } finally {
        if (gen === localAddGenRef.current) {
          clearNestedScanState()
        }
      }
    },
    [
      activeRuntimeEnvironmentId,
      addProjectKind,
      addRepoPath,
      clearNestedScanState,
      closeModal,
      fetchWorktrees,
      initializeGitOnAdd,
      onGitRepoReady,
      scanNestedRepos,
      setActiveNestedScanId,
      setAddProjectBusyLabel,
      setNestedScanInProgress,
      showNestedRepoReview
    ]
  )

  const handleAddLocalPath = useCallback(
    async (
      path: string,
      source: AddRepoExistingWorkspaceSource,
      mode: LocalPathAddMode = 'single'
    ): Promise<LocalPathAddResult> => {
      const gen = ++localAddGenRef.current
      setIsAdding(true)
      try {
        return await addLocalPathForGeneration(path, source, gen, mode)
      } finally {
        if (gen === localAddGenRef.current) {
          clearNestedScanState()
          setIsAdding(false)
          setAddProjectBusyLabel(null)
        }
      }
    },
    [addLocalPathForGeneration, clearNestedScanState, setAddProjectBusyLabel, setIsAdding]
  )

  const handleAddLocalPaths = useCallback(
    async (paths: string[], source: AddRepoExistingWorkspaceSource, gen: number): Promise<void> => {
      const gitRepos: { id: string; path: string }[] = []
      const shouldDeferGitRepoReady = paths.length > 1
      let skippedCount = 0
      for (const path of paths) {
        const result = await addLocalPathForGeneration(
          path,
          source,
          gen,
          shouldDeferGitRepoReady ? 'batch' : 'single'
        )
        if (result.status === 'skipped') {
          skippedCount++
          continue
        }
        if (result.status !== 'completed') {
          return
        }
        if (isGitRepoKind(result.repo)) {
          gitRepos.push({ id: result.repo.id, path: result.repo.path })
        }
      }
      if (gen !== localAddGenRef.current) {
        return
      }
      if (skippedCount > 0) {
        toast.info(
          translate(
            'auto.components.sidebar.useAddRepoLocalFolderFlow.skippedBatchFolders',
            'Some folders were skipped'
          ),
          {
            description: translate(
              'auto.components.sidebar.useAddRepoLocalFolderFlow.skippedBatchFoldersDescription',
              'Add skipped folders individually to review or confirm them.'
            )
          }
        )
      }
      const firstGitRepo = gitRepos[0]
      const batchOwnerOptions = worktreeRefreshOptions(activeRuntimeEnvironmentId ?? null)
      if (shouldDeferGitRepoReady && firstGitRepo) {
        await (batchOwnerOptions.executionHostId
          ? onGitRepoReady(
              firstGitRepo.id,
              source,
              firstGitRepo.path,
              batchOwnerOptions.executionHostId
            )
          : onGitRepoReady(firstGitRepo.id, source, firstGitRepo.path))
      }
    },
    [activeRuntimeEnvironmentId, addLocalPathForGeneration, onGitRepoReady]
  )

  useEffect(() => {
    if (!isOpen || !droppedLocalPath) {
      return
    }
    if (droppedLocalPathHandledRef.current === droppedLocalPath) {
      return
    }
    droppedLocalPathHandledRef.current = droppedLocalPath
    void handleAddLocalPath(droppedLocalPath, 'local_folder_picker')
  }, [droppedLocalPath, handleAddLocalPath, isOpen])

  const handleBrowse = useCallback(async (): Promise<void> => {
    const gen = ++localAddGenRef.current
    setIsAdding(true)
    setAddProjectBusyLabel('Choose a folder...')
    try {
      const paths = await window.api.repos.pickFolders()
      if (paths.length === 0 || gen !== localAddGenRef.current) {
        return
      }
      await handleAddLocalPaths(paths, 'local_folder_picker', gen)
    } finally {
      if (gen === localAddGenRef.current) {
        clearNestedScanState()
        setIsAdding(false)
        setAddProjectBusyLabel(null)
      }
    }
  }, [clearNestedScanState, handleAddLocalPaths, setAddProjectBusyLabel, setIsAdding])

  return { handleBrowse, resetLocalFolderFlow }
}
