import { track } from '@/lib/telemetry'
import {
  buildNestedRepoScanTelemetry,
  createNestedRepoTelemetryAttemptId
} from '../../../../shared/nested-repo-telemetry'
import type { NestedRepoScanResult } from '../../../../shared/types'
import { createNestedRepoScanId } from './add-repo-dialog-types'

export type LocalNestedScanReview = (args: {
  scan: NestedRepoScanResult
  selectedPath: string
  connectionId: string | null
  attemptId: string
  runtimeKind: 'local'
  inProgress: boolean
  scanId: string | null
  runtimeEnvironmentId?: string | null
}) => void

// Why: the local-folder flow scans for nested repos before adding; this runs that scan with the
// streaming-progress + completed-review callbacks, returning the scan result or a cancellation/paused/skipped signal.
export async function scanLocalPathForNestedRepos(args: {
  path: string
  mode: 'single' | 'batch'
  runtimeEnvironmentId: string | null | undefined
  isCurrentGeneration: () => boolean
  scanNestedRepos: (
    path: string,
    connectionId?: string,
    controls?: {
      scanId?: string
      onProgress?: (scan: NestedRepoScanResult) => void
      runtimeEnvironmentId?: string | null
    }
  ) => Promise<NestedRepoScanResult | null>
  showNestedRepoReview: LocalNestedScanReview
}): Promise<
  | { kind: 'cancelled' }
  | { kind: 'skipped' }
  | { kind: 'paused' }
  | { kind: 'done'; scan: NestedRepoScanResult | null }
> {
  const { path, mode, runtimeEnvironmentId, isCurrentGeneration, scanNestedRepos, showNestedRepoReview } = args
  const attemptId = createNestedRepoTelemetryAttemptId()
  const scanId = createNestedRepoScanId()
  const scan = await scanNestedRepos(path, undefined, {
    scanId,
    runtimeEnvironmentId: runtimeEnvironmentId ?? null,
    onProgress: (progressScan) => {
      if (
        !isCurrentGeneration() ||
        mode === 'batch' ||
        progressScan.selectedPathKind !== 'non_git_folder' ||
        progressScan.repos.length === 0
      ) {
        return
      }
      showNestedRepoReview({
        scan: progressScan,
        selectedPath: path,
        connectionId: null,
        attemptId,
        runtimeKind: 'local',
        inProgress: true,
        scanId,
        runtimeEnvironmentId
      })
    }
  })
  if (!isCurrentGeneration()) {
    return { kind: 'cancelled' }
  }
  track(
    'add_repo_nested_scan_result',
    buildNestedRepoScanTelemetry({ attemptId, surface: 'sidebar', runtimeKind: 'local', scan })
  )
  if (scan?.selectedPathKind === 'non_git_folder' && mode === 'batch') {
    return { kind: 'skipped' }
  }
  if (scan?.selectedPathKind === 'non_git_folder' && scan.repos.length > 0) {
    // Why: a single-folder decision point cannot queue competing batch review states.
    showNestedRepoReview({
      scan,
      selectedPath: path,
      connectionId: null,
      attemptId,
      runtimeKind: 'local',
      inProgress: false,
      scanId,
      runtimeEnvironmentId
    })
    return { kind: 'paused' }
  }
  return { kind: 'done', scan }
}

export function startLocalNestedScan(
  scanId: string,
  runtimeEnvironmentId: string | null | undefined,
  setActiveNestedScanId: (scanId: string | null, runtimeEnvironmentId?: string | null) => void,
  setNestedScanInProgress: (inProgress: boolean) => void
): string {
  setActiveNestedScanId(scanId, runtimeEnvironmentId ?? null)
  setNestedScanInProgress(true)
  return scanId
}
