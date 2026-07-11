import {
  getRuntimePathBasename,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../../shared/cross-platform-path'

type RepoDisplayLabelItem = {
  path: string
  displayName: string
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

  for (const item of items) {
    const displayName = normalizeDisplayName(item)
    labels.set(item.path, displayName)
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
      labels.set(item.path, nextLabels[index] ?? item.displayName)
    })
  }

  return labels
}
