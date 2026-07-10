import { useCallback, useMemo, useState } from 'react'
import type { AddRepoProjectKind } from './AddRepoProjectModeControl'

export function useAddRepoProjectMode(): {
  projectKind: AddRepoProjectKind
  initializeGitOnAdd: boolean
  resetProjectMode: () => void
  setProjectKind: (kind: AddRepoProjectKind) => void
  setInitializeGitOnAdd: (enabled: boolean) => void
} {
  const [projectKind, setProjectKindState] = useState<AddRepoProjectKind>('git')
  const [initializeGitOnAdd, setInitializeGitOnAdd] = useState(false)

  const setProjectKind = useCallback((kind: AddRepoProjectKind): void => {
    setProjectKindState(kind)
    if (kind === 'folder') {
      setInitializeGitOnAdd(false)
    }
  }, [])

  const resetProjectMode = useCallback((): void => {
    setProjectKindState('git')
    setInitializeGitOnAdd(false)
  }, [])

  return useMemo(
    () => ({
      projectKind,
      initializeGitOnAdd,
      resetProjectMode,
      setProjectKind,
      setInitializeGitOnAdd
    }),
    [initializeGitOnAdd, projectKind, resetProjectMode, setProjectKind]
  )
}
