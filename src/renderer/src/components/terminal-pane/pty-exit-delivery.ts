import {
  bufferPreHandlerPtyExit,
  clearPreHandlerPtyState,
  consumePreHandlerPtyState,
  drainPreHandlerPtyExit
} from './pty-pre-handler-buffer'

type PtyExitSidecar = (code: number, context: { hadPrimary: boolean }) => void

const ptyExitSidecars = new Map<string, Set<PtyExitSidecar>>()

export function takePtyExitSidecars(ptyId: string): PtyExitSidecar[] {
  const sidecars = ptyExitSidecars.get(ptyId)
  if (!sidecars) {
    return []
  }
  ptyExitSidecars.delete(ptyId)
  return Array.from(sidecars)
}

export function subscribeToPtyExitSidecar(
  ptyId: string,
  watcher: PtyExitSidecar,
  hasPrimary: () => boolean
): () => void {
  let set = ptyExitSidecars.get(ptyId)
  if (!set) {
    set = new Set()
    ptyExitSidecars.set(ptyId, set)
  }
  set.add(watcher)
  const unsubscribe = (): void => {
    const current = ptyExitSidecars.get(ptyId)
    current?.delete(watcher)
    if (current?.size === 0) {
      ptyExitSidecars.delete(ptyId)
    }
  }
  queueMicrotask(() => {
    if (!ptyExitSidecars.get(ptyId)?.has(watcher) || hasPrimary()) {
      return
    }
    drainPreHandlerPtyExit(ptyId, (code) => {
      unsubscribe()
      watcher(code, { hadPrimary: false })
    })
  })
  return unsubscribe
}

type PtyExitDelivery = {
  ptyId: string
  code: number
  primary?: (code: number) => void
  sidecars: readonly PtyExitSidecar[]
}

/** Delivers one exit to its primary owner and every observational sidecar. */
export function deliverPtyExitToHandlers(delivery: PtyExitDelivery): void {
  let firstError: unknown
  let hasError = false
  try {
    if (delivery.primary) {
      clearPreHandlerPtyState(delivery.ptyId)
      try {
        delivery.primary(delivery.code)
      } finally {
        // Why: ownership is final even when cleanup throws; a duplicate exit
        // must not become a new pre-handler event for a future mount.
        consumePreHandlerPtyState(delivery.ptyId)
      }
    } else {
      bufferPreHandlerPtyExit(delivery.ptyId, delivery.code)
    }
  } catch (error) {
    firstError = error
    hasError = true
  }

  for (const sidecar of delivery.sidecars) {
    try {
      sidecar(delivery.code, { hadPrimary: delivery.primary !== undefined })
    } catch (error) {
      if (!hasError) {
        firstError = error
        hasError = true
      }
    }
  }
  if (hasError) {
    throw firstError
  }
}
