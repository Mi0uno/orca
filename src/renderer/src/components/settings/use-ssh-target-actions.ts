import { useState, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import { SSH_TERMINATE_RECONNECT_REQUIRED } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

// Why: the per-target connection actions (connect/disconnect/terminate/reset/test)
// are a cohesive cluster with their own transient `testing` state. Extracting them
// keeps SshPane under the max-lines budget without an eslint-disable.
export type SshTargetActions = {
  testingIds: Set<string>
  handleConnect: (targetId: string) => Promise<void>
  handleDisconnect: (targetId: string) => Promise<void>
  handleTerminateSessions: (targetId: string) => Promise<void>
  handleResetRelay: (targetId: string) => Promise<void>
  handleTest: (targetId: string) => Promise<void>
}

export function useSshTargetActions(
  mountedRef: MutableRefObject<boolean>,
  reloadTargets: () => Promise<void>
): SshTargetActions {
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  const handleConnect = async (targetId: string): Promise<void> => {
    try {
      await window.api.ssh.connect({ targetId })
      recordFeatureInteraction('ssh')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate('auto.components.settings.SshPane.e95d5ae10e', 'Connection failed')
      )
    }
  }

  const handleDisconnect = async (targetId: string): Promise<void> => {
    try {
      await window.api.ssh.disconnect({ targetId })
      recordFeatureInteraction('ssh')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate('auto.components.settings.SshPane.a43de1d3ee', 'Disconnect failed')
      )
    }
  }

  const handleTerminateSessions = async (targetId: string): Promise<void> => {
    try {
      await terminateSessionsWithReconnect(targetId)
      toast.success(
        translate('auto.components.settings.SshPane.90e308c98b', 'Remote terminals ended')
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.SshPane.025e107643',
              'Failed to end remote terminals'
            )
      )
    }
  }

  const handleResetRelay = async (targetId: string): Promise<void> => {
    try {
      await window.api.ssh.resetRelay({ targetId })
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.settings.SshPane.db2e48975e', 'Remote relay reset')
        )
      }
      await reloadTargets()
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate(
                'auto.components.settings.SshPane.2c4ee7332b',
                'Failed to reset remote relay'
              )
        )
      }
    }
  }

  const handleTest = async (targetId: string): Promise<void> => {
    setTestingIds((prev) => new Set(prev).add(targetId))
    try {
      const result = await window.api.ssh.testConnection({ targetId })
      recordFeatureInteraction('ssh')
      if (mountedRef.current) {
        if (result.success) {
          toast.success(
            translate('auto.components.settings.SshPane.81d08bcddf', 'Connection successful')
          )
        } else {
          toast.error(
            result.error ??
              translate('auto.components.settings.SshPane.0cda732f43', 'Connection test failed')
          )
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          err instanceof Error
            ? err.message
            : translate('auto.components.settings.SshPane.68c13b4589', 'Test failed')
        )
      }
    } finally {
      if (mountedRef.current) {
        setTestingIds((prev) => {
          const next = new Set(prev)
          next.delete(targetId)
          return next
        })
      }
    }
  }

  return {
    testingIds,
    handleConnect,
    handleDisconnect,
    handleTerminateSessions,
    handleResetRelay,
    handleTest
  }
}

async function terminateSessionsWithReconnect(targetId: string): Promise<void> {
  try {
    await window.api.ssh.terminateSessions({ targetId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes(SSH_TERMINATE_RECONNECT_REQUIRED)) {
      throw err
    }
    // Why: disconnect is now non-destructive, so preserved remote PTYs may
    // require a fresh relay attachment before they can be explicitly killed.
    await window.api.ssh.connect({ targetId })
    await window.api.ssh.terminateSessions({ targetId })
  }
}
