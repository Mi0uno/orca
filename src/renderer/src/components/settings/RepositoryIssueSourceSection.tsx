import { useEffect, useMemo, useState } from 'react'
import type {
  GitHubRepositoryIdentity,
  IssueSourcePreference,
  Repo
} from '../../../../shared/types'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { useAppStore } from '../../store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSegmentedControl } from './SettingsFormControls'
import { resolveRepositoryOriginLive } from './repository-icon-github'
import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'

type RepositoryIssueSourceSectionProps = {
  repo: Repo
  forceVisible?: boolean
}

function formatSlug(identity: GitHubRepositoryIdentity | null): string | null {
  return identity ? `${identity.owner}/${identity.repo}` : null
}

/**
 * Per-repo Issue source selector, surfaced in project settings so forks can
 * pick which repo's issues Orca lists and files against without hunting for
 * the compact pill on the Tasks header.
 *
 * Why fork-gated: only forks have a meaningful choice — `upstream` must exist
 * for the two sources to diverge. Non-forks fall through the same
 * `repo.upstream` gate the fork-sync section uses, so this stays hidden.
 *
 * Why three explicit states here (Auto / Upstream / Origin) but two on the
 * Tasks pill: settings is the one place a user can *reset* to the heuristic,
 * so `'auto'` is an offered choice rather than the mere absence of one.
 */
export function RepositoryIssueSourceSection({
  repo,
  forceVisible
}: RepositoryIssueSourceSectionProps): React.JSX.Element | null {
  const setIssueSourcePreference = useAppStore((s) => s.setIssueSourcePreference)
  const upstream = repo.upstream
  const mountedRef = useMountedRef()
  const [origin, setOrigin] = useState<GitHubRepositoryIdentity | null>(null)

  // Why: resolve origin on the host that owns the repo, matching the
  // icon-picker's routing so SSH/runtime repos read their own `.git/config`.
  const selectedHost = parseExecutionHostId(getRepoExecutionHostId(repo))
  const activeRuntimeEnvironmentId =
    selectedHost?.kind === 'runtime' ? selectedHost.environmentId : null
  const runtimeTarget = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }),
    [activeRuntimeEnvironmentId]
  )

  useEffect(() => {
    if (!upstream) {
      return
    }
    let cancelled = false
    void resolveRepositoryOriginLive(runtimeTarget, repo)
      .then((resolved) => {
        if (!cancelled && mountedRef.current) {
          setOrigin(resolved)
        }
      })
      .catch(() => {
        // Why: a failed origin lookup only costs the slug label; the selector
        // still works because the choice is stored as a preference keyword.
      })
    return () => {
      cancelled = true
    }
  }, [upstream, runtimeTarget, repo, mountedRef])

  if (!upstream) {
    return null
  }

  const preference: IssueSourcePreference = repo.issueSourcePreference ?? 'auto'
  const upstreamSlug = formatSlug(upstream)
  const originSlug = formatSlug(origin)
  // Why: `'auto'` resolves to upstream-if-exists; since we only render when
  // upstream exists, auto effectively points at upstream today.
  const effectiveSlug = preference === 'origin' ? originSlug : upstreamSlug

  const updatePreference = (next: IssueSourcePreference) => {
    if (next === preference) {
      return
    }
    void setIssueSourcePreference(repo.id, repo.path, next)
  }

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.RepositoryIssueSourceSection.title',
        'Issue Source'
      )}
      description={translate(
        'auto.components.settings.RepositoryIssueSourceSection.description',
        "Choose which repository's issues this fork shows and files against."
      )}
      keywords={searchKeywords([
        repo.displayName,
        upstream.owner,
        upstream.repo,
        ...(origin ? [origin.owner, origin.repo] : []),
        { key: 'auto.components.settings.repository.search.issueSource', fallback: 'issue source' },
        { key: 'auto.components.settings.repository.search.issues', fallback: 'issues' },
        { key: 'auto.components.settings.repository.search.upstream', fallback: 'upstream' },
        { key: 'auto.components.settings.repository.search.origin', fallback: 'origin' },
        { key: 'auto.components.settings.repository.search.fork', fallback: 'fork' }
      ])}
      className="space-y-3"
      forceVisible={forceVisible}
    >
      <div className="space-y-1">
        <div className="text-sm font-semibold">
          {translate('auto.components.settings.RepositoryIssueSourceSection.title', 'Issue Source')}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.RepositoryIssueSourceSection.longDescription',
            'This fork can list and create issues on the upstream project or on your fork. Auto uses upstream when it exists, otherwise your fork. Pull requests are unaffected.'
          )}
        </p>
        {effectiveSlug ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.RepositoryIssueSourceSection.showingFrom',
              'Showing issues from {{slug}}',
              { slug: effectiveSlug }
            )}
          </p>
        ) : null}
      </div>
      <SettingsSegmentedControl<IssueSourcePreference>
        value={preference}
        onChange={updatePreference}
        ariaLabel={translate(
          'auto.components.settings.RepositoryIssueSourceSection.modeLabel',
          'Issue source'
        )}
        size="sm"
        options={[
          {
            value: 'auto',
            label: translate('auto.components.settings.RepositoryIssueSourceSection.auto', 'Auto')
          },
          {
            value: 'upstream',
            label: translate(
              'auto.components.settings.RepositoryIssueSourceSection.upstream',
              'Upstream'
            ),
            ariaLabel: upstreamSlug ?? undefined
          },
          {
            value: 'origin',
            label: translate(
              'auto.components.settings.RepositoryIssueSourceSection.origin',
              'Origin'
            ),
            ariaLabel: originSlug ?? undefined
          }
        ]}
      />
    </SearchableSetting>
  )
}
