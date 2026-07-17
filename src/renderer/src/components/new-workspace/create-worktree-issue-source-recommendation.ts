// Why: the create-worktree GitHub search lets a fork pick Upstream vs Origin
// issues *for that search only* — it must not write the repo's persisted
// `issueSourcePreference` (that's the Tasks/settings surface, deliberately
// separate). To still feel smart, we tally which source the user picks per
// repo and default the next panel open to the more-used one. Renderer-local
// (localStorage) because it's a per-device UX nicety, not shared project state.
import type { IssueSourcePreference } from '../../../../shared/types'

const STORAGE_KEY = 'orca.createWorktree.issueSourcePicks'

/** Explicit source the panel can fetch. `'auto'` is never tallied — it isn't a
 *  thing the user picks here, it's the fallback when no tally exists. */
export type CreateWorktreeIssueSource = 'upstream' | 'origin'

type RepoPickCounts = { upstream: number; origin: number }
type PickMap = Record<string, RepoPickCounts>

function readMap(): PickMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as PickMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: PickMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be disabled — picks just won't persist this session.
  }
}

function normalizeCounts(value: RepoPickCounts | undefined): RepoPickCounts {
  const upstream = Number.isFinite(value?.upstream) ? Math.max(0, value!.upstream) : 0
  const origin = Number.isFinite(value?.origin) ? Math.max(0, value!.origin) : 0
  return { upstream, origin }
}

/**
 * Record one pick for `repoId`. Returns nothing — callers re-read via
 * `recommendCreateWorktreeIssueSource` on the next open.
 */
export function recordCreateWorktreeIssueSourcePick(
  repoId: string,
  source: CreateWorktreeIssueSource
): void {
  if (!repoId) {
    return
  }
  const map = readMap()
  const counts = normalizeCounts(map[repoId])
  map[repoId] = {
    upstream: counts.upstream + (source === 'upstream' ? 1 : 0),
    origin: counts.origin + (source === 'origin' ? 1 : 0)
  }
  writeMap(map)
}

/**
 * The more-picked source for `repoId`, or `null` when there's no signal (no
 * picks, or an exact tie). Callers fall back to their own heuristic on `null`
 * — for a fork that means Upstream, matching the app-wide `auto` behavior.
 */
export function recommendCreateWorktreeIssueSource(
  repoId: string
): CreateWorktreeIssueSource | null {
  if (!repoId) {
    return null
  }
  const counts = normalizeCounts(readMap()[repoId])
  if (counts.upstream === counts.origin) {
    return null
  }
  return counts.upstream > counts.origin ? 'upstream' : 'origin'
}

/**
 * Resolve the source the panel should default to: the tally recommendation,
 * else the app-wide heuristic. Since the selector only renders for forks
 * (upstream exists), the heuristic default is `'upstream'` — mirroring
 * `getIssueOwnerRepo`'s upstream-if-exists rule so an untouched fork behaves
 * identically to the rest of the app until the user expresses a preference.
 */
export function resolveCreateWorktreeIssueSourceDefault(
  repoId: string,
  persistedPreference: IssueSourcePreference | undefined
): CreateWorktreeIssueSource {
  const recommended = recommendCreateWorktreeIssueSource(repoId)
  if (recommended) {
    return recommended
  }
  // Why: honor an explicit persisted choice as the seed when the user has one
  // but hasn't picked in this panel yet — respects intent without persisting
  // panel picks back. `'auto'`/undefined → upstream (fork heuristic).
  return persistedPreference === 'origin' ? 'origin' : 'upstream'
}
