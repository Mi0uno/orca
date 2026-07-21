import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { track } from '@/lib/telemetry'
import type {
  AddRepoDefaultCheckoutHandoffSource,
  EventProps
} from '../../../../shared/telemetry-events'
import type { DetectedWorktreeListResult, Worktree } from '../../../../shared/types'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import { markOnboardingProjectAdded } from '@/lib/onboarding-project-checklist'
import { finalizeImportedRepoAfterSkip } from './add-repo-skip-finalization'

type DefaultCheckoutHandoffReason = EventProps<'add_repo_default_checkout_handoff'>['reason']

export function getProjectDefaultCheckout(worktrees: readonly Worktree[]): Worktree | null {
  return worktrees.find((worktree) => worktree.isMainWorktree) ?? null
}

function getSelectedPathCheckout<T extends { path: string }>(
  worktrees: readonly T[],
  selectedPath: string | undefined
): T | null {
  if (!selectedPath) {
    return null
  }
  let bestMatch: { worktree: T; relativePath: string } | null = null
  for (const worktree of worktrees) {
    const relativePath = relativePathInsideRoot(worktree.path, selectedPath)
    if (relativePath === null) {
      continue
    }
    if (!bestMatch || relativePath.length < bestMatch.relativePath.length) {
      bestMatch = { worktree, relativePath }
    }
  }
  return bestMatch?.worktree ?? null
}

function getDetectedProjectDefaultCheckout(
  detected: DetectedWorktreeListResult | undefined,
  selectedPath: string | undefined
): DetectedWorktreeListResult['worktrees'][number] | null {
  if (detected?.authoritative !== true) {
    return null
  }
  const selectedPathCheckout = getSelectedPathCheckout(detected.worktrees, selectedPath)
  if (selectedPathCheckout) {
    return selectedPathCheckout
  }
  if (selectedPath) {
    return null
  }
  return detected.worktrees.find((worktree) => worktree.isMainWorktree) ?? null
}

function hasDetectedHiddenLinkedExternalWorktrees(
  detected: DetectedWorktreeListResult | undefined
): boolean {
  if (detected?.authoritative !== true) {
    return false
  }
  return detected.worktrees.some(
    (worktree) =>
      !worktree.isMainWorktree &&
      !worktree.selectedCheckout &&
      !worktree.visible &&
      worktree.ownership !== 'orca-managed' &&
      // Why: a repo whose only externals are agent scratch must not get
      // flipped to repo-wide 'show' by the add handoff (#9388).
      worktree.ownership !== 'agent-scratch'
  )
}

async function revealDetectedHiddenLinkedExternalWorktrees(
  repoId: string
): Promise<DefaultCheckoutHandoffReason | null> {
  const state = useAppStore.getState()
  if (!hasDetectedHiddenLinkedExternalWorktrees(state.detectedWorktreesByRepo[repoId])) {
    return null
  }

  // Why: the removed setup step's existing-worktree path made linked external
  // worktrees visible; the automatic handoff must preserve that import result.
  const updated = await state.updateRepo(repoId, { externalWorktreeVisibility: 'show' })
  if (!updated) {
    return 'show_detected_linked_failed'
  }
  const refreshed = await useAppStore.getState().fetchWorktrees(repoId, {
    requireAuthoritative: true
  })
  return refreshed ? null : 'linked_external_refresh_failed'
}

async function findDetectedDefaultCheckout(
  repoId: string,
  selectedPath: string | undefined
): Promise<{
  worktree: Worktree | null
  reason: DefaultCheckoutHandoffReason
}> {
  const state = useAppStore.getState()
  const detected = state.detectedWorktreesByRepo[repoId]
  const detectedDefaultCheckout = getDetectedProjectDefaultCheckout(detected, selectedPath)
  if (!detectedDefaultCheckout) {
    return {
      worktree: null,
      reason:
        detected?.authoritative === true ? 'no_default_checkout' : 'no_authoritative_detection'
    }
  }
  if (!detectedDefaultCheckout.visible) {
    // Why: a freshly cloned primary checkout can be detected as a hidden
    // external worktree; adding a project should make that checkout usable.
    const updated = await state.updateRepo(repoId, { externalWorktreeVisibility: 'show' })
    if (!updated) {
      return { worktree: null, reason: 'show_detected_default_failed' }
    }
  }
  const refreshed = await useAppStore.getState().fetchWorktrees(repoId, {
    requireAuthoritative: true
  })
  if (!refreshed) {
    return { worktree: null, reason: 'authoritative_refresh_failed' }
  }
  const refreshedWorktrees = useAppStore.getState().worktreesByRepo[repoId] ?? []
  const worktree =
    getSelectedPathCheckout(refreshedWorktrees, selectedPath) ??
    (selectedPath ? null : getProjectDefaultCheckout(refreshedWorktrees))
  return {
    worktree,
    reason: worktree ? 'detected_default_checkout' : 'refreshed_default_missing'
  }
}

function resolveInitialCwdForDefaultCheckout(
  defaultCheckout: Worktree,
  selectedPath: string | undefined
): string | undefined {
  if (!selectedPath) {
    return undefined
  }
  const relativePath = relativePathInsideRoot(defaultCheckout.path, selectedPath)
  return relativePath && relativePath.length > 0 ? selectedPath : undefined
}

export async function openProjectDefaultCheckout({
  repoId,
  source,
  selectedPath,
  setHideDefaultBranchWorkspace
}: {
  repoId: string
  source: AddRepoDefaultCheckoutHandoffSource
  selectedPath?: string
  setHideDefaultBranchWorkspace: (value: boolean) => void
}): Promise<void> {
  const loadedWorktrees = useAppStore.getState().worktreesByRepo[repoId] ?? []
  const selectedPathCheckout = getSelectedPathCheckout(loadedWorktrees, selectedPath)
  let defaultCheckout = selectedPathCheckout ?? getProjectDefaultCheckout(loadedWorktrees)
  let reason: DefaultCheckoutHandoffReason = 'loaded_default_checkout'
  if (selectedPath && !selectedPathCheckout && defaultCheckout) {
    // Why: adding an existing linked worktree should land in the selected
    // project directory, not an unrelated main checkout under Orca workspaces.
    const detectedDefaultCheckout = await findDetectedDefaultCheckout(repoId, selectedPath)
    defaultCheckout = detectedDefaultCheckout.worktree
    reason = detectedDefaultCheckout.reason
  }
  if (!defaultCheckout) {
    const detectedDefaultCheckout = await findDetectedDefaultCheckout(repoId, selectedPath)
    defaultCheckout = detectedDefaultCheckout.worktree
    reason = detectedDefaultCheckout.reason
  }

  if (defaultCheckout) {
    const revealLinkedFailureReason = await revealDetectedHiddenLinkedExternalWorktrees(repoId)
    if (revealLinkedFailureReason) {
      track('add_repo_default_checkout_handoff', {
        source,
        result: 'revealed_project',
        reason: revealLinkedFailureReason
      })
      finalizeImportedRepoAfterSkip(useAppStore.getState(), repoId)
      return
    }
    // Why: the onboarding handoff should land on the default checkout even
    // when the user normally hides default-branch workspaces in the sidebar.
    const state = useAppStore.getState()
    if (state.hideDefaultBranchWorkspace) {
      setHideDefaultBranchWorkspace(false)
    }
    track('add_repo_default_checkout_handoff', {
      source,
      result: 'opened_default_checkout',
      reason
    })
    const initialCwd = resolveInitialCwdForDefaultCheckout(defaultCheckout, selectedPath)
    if (initialCwd) {
      activateAndRevealWorktree(defaultCheckout.id, { initialCwd })
    } else {
      activateAndRevealWorktree(defaultCheckout.id)
    }
    return
  }

  track('add_repo_default_checkout_handoff', {
    source,
    result: 'revealed_project',
    reason
  })
  finalizeImportedRepoAfterSkip(useAppStore.getState(), repoId)
}

export async function finishProjectAddWithDefaultCheckout({
  repoId,
  source,
  selectedPath,
  closeModal,
  setHideDefaultBranchWorkspace
}: {
  repoId: string
  source: AddRepoDefaultCheckoutHandoffSource
  selectedPath?: string
  closeModal: () => void
  setHideDefaultBranchWorkspace: (value: boolean) => void
}): Promise<void> {
  await markOnboardingProjectAdded('addedRepo')
  closeModal()
  await openProjectDefaultCheckout({
    repoId,
    source,
    selectedPath,
    setHideDefaultBranchWorkspace
  })
}
