import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import {
  getRuntimePathBasename,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../../shared/cross-platform-path'

type RepoDisplayLabelItem = {
  path: string
  displayName: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

// Why: two repos can share the same absolute path across hosts (e.g. a local
// /Users/alice and an SSH host's /Users/alice). Keying labels by raw path alone
// lets one repo's label overwrite the other's, so scope the key by execution
// host. getRepoExecutionHostId returns 'local' for local repos and falls back to
// the connectionId (ssh:<id>) for SSH folder-repos that leave executionHostId unset.
export function getRepoDisplayLabelKey(
  item: Pick<RepoDisplayLabelItem, 'path' | 'connectionId' | 'executionHostId'>
): string {
  return `${getRepoExecutionHostId(item)}::${item.path}`
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || isWindowsAbsolutePathLike(value)
}

function normalizeDisplayName(item: RepoDisplayLabelItem): string {
  const displayName = item.displayName.trim()
  if (!displayName) {
    return getRuntimePathBasename(item.path) || item.path
  }
  const displayNameMatchesPath =
    normalizeRuntimePathForComparison(displayName) === normalizeRuntimePathForComparison(item.path)
  if (displayNameMatchesPath || isAbsolutePathLike(displayName)) {
    return getRuntimePathBasename(displayName) || displayName
  }
  return displayName
}

function normalizePathSegments(path: string): string[] {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').split('/').filter(Boolean)
}

function labelForDepth(item: RepoDisplayLabelItem, depth: number): string {
  const segments = normalizePathSegments(item.path)
  const suffix = segments.slice(Math.max(0, segments.length - depth))
  if (suffix.length === 0) {
    return item.displayName
  }
  suffix[suffix.length - 1] = item.displayName
  return suffix.join('/')
}

function hasDuplicateLabels(labels: readonly string[]): boolean {
  return new Set(labels).size !== labels.length
}

export function getRepoDisplayLabelsByPath(
  items: readonly RepoDisplayLabelItem[]
): Map<string, string> {
  const labels = new Map<string, string>()
  const itemsByName = new Map<string, RepoDisplayLabelItem[]>()
  const pathCounts = new Map<string, number>()

  for (const item of items) {
    const pathKey = normalizeRuntimePathForComparison(item.path)
    pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1)
  }

  const setRepoLabel = (item: RepoDisplayLabelItem, label: string): void => {
    labels.set(getRepoDisplayLabelKey(item), label)
    // Why: older callers still look up by raw path, but duplicate paths across
    // hosts cannot share one raw-path value without one repo overwriting another.
    if ((pathCounts.get(normalizeRuntimePathForComparison(item.path)) ?? 0) === 1) {
      labels.set(item.path, label)
    }
  }

  for (const item of items) {
    const displayName = normalizeDisplayName(item)
    setRepoLabel(item, displayName)
    const colliding = itemsByName.get(displayName) ?? []
    colliding.push({ ...item, displayName })
    itemsByName.set(displayName, colliding)
  }

  for (const collidingItems of itemsByName.values()) {
    if (collidingItems.length < 2) {
      continue
    }
    const uniquePaths = new Set(
      collidingItems.map((item) => normalizeRuntimePathForComparison(item.path))
    )
    if (uniquePaths.size < 2) {
      continue
    }
    const maxDepth = Math.max(
      ...collidingItems.map((item) => normalizePathSegments(item.path).length)
    )
    let depth = 1
    let nextLabels = collidingItems.map((item) => labelForDepth(item, depth))
    while (depth < maxDepth && hasDuplicateLabels(nextLabels)) {
      depth += 1
      nextLabels = collidingItems.map((item) => labelForDepth(item, depth))
    }
    collidingItems.forEach((item, index) => {
      const label = nextLabels[index] ?? item.displayName
      setRepoLabel(item, label)
    })
  }

  return labels
}
