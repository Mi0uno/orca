import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  SshCredentialKind,
  SshCredentialRequestEvent,
  SshKeyboardInteractivePromptMetadata
} from '../../shared/ssh-types'

const CREDENTIAL_TIMEOUT_MS = 120_000
const MAX_CREDENTIAL_RESPONSE_LENGTH = 16_384
const MAX_PROMPT_DETAIL_LENGTH = 4_096
const MAX_INTERACTION_NAME_LENGTH = 256
const MAX_INSTRUCTIONS_LENGTH = 8_192
const MAX_REQUEST_ID_LENGTH = 128

type PendingCredentialRequest = {
  resolve: (value: string | null) => void
  timer: ReturnType<typeof setTimeout>
  getMainWindow: () => BrowserWindow | null
  signal?: AbortSignal
  onAbort?: () => void
}

const pendingRequests = new Map<string, PendingCredentialRequest>()

function notifyCredentialResolved(
  getMainWindow: () => BrowserWindow | null,
  requestId: string
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ssh:credential-resolved', { requestId })
  }
}

function settleCredentialRequest(requestId: string, value: string | null): void {
  const pending = pendingRequests.get(requestId)
  if (!pending) {
    return
  }
  pendingRequests.delete(requestId)
  clearTimeout(pending.timer)
  if (pending.signal && pending.onAbort) {
    pending.signal.removeEventListener('abort', pending.onAbort)
  }
  notifyCredentialResolved(pending.getMainWindow, requestId)
  pending.resolve(value)
}

function clampPromptText(value: string, maxLength: number): string {
  return value.slice(0, maxLength)
}

function buildCredentialRequestEvent(
  requestId: string,
  targetId: string,
  kind: SshCredentialKind,
  detail: string,
  keyboardInteractive?: SshKeyboardInteractivePromptMetadata
): SshCredentialRequestEvent {
  const base = {
    requestId,
    targetId,
    detail: clampPromptText(detail, MAX_PROMPT_DETAIL_LENGTH)
  }
  if (kind !== 'keyboard-interactive') {
    return { ...base, kind }
  }
  const metadata = keyboardInteractive ?? {
    interactionName: '',
    instructions: '',
    echo: false,
    promptIndex: 1,
    promptCount: 1
  }
  return {
    ...base,
    kind,
    interactionName: clampPromptText(metadata.interactionName, MAX_INTERACTION_NAME_LENGTH),
    instructions: clampPromptText(metadata.instructions, MAX_INSTRUCTIONS_LENGTH),
    echo: metadata.echo === true,
    promptIndex: metadata.promptIndex,
    promptCount: metadata.promptCount
  }
}

export function requestCredential(
  getMainWindow: () => BrowserWindow | null,
  targetId: string,
  kind: SshCredentialKind,
  detail: string,
  keyboardInteractive?: SshKeyboardInteractivePromptMetadata,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) {
    return Promise.resolve(null)
  }
  const requestId = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      settleCredentialRequest(requestId, null)
    }, CREDENTIAL_TIMEOUT_MS)

    const onAbort = signal ? () => settleCredentialRequest(requestId, null) : undefined
    pendingRequests.set(requestId, { resolve, timer, getMainWindow, signal, onAbort })
    if (signal && onAbort) {
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }
    }

    if (!pendingRequests.has(requestId)) {
      return
    }

    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(
        'ssh:credential-request',
        buildCredentialRequestEvent(requestId, targetId, kind, detail, keyboardInteractive)
      )
    } else {
      settleCredentialRequest(requestId, null)
    }
  })
}

export function registerCredentialHandler(): void {
  ipcMain.removeHandler('ssh:submitCredential')
  ipcMain.handle('ssh:submitCredential', (_event, args: unknown) => {
    if (!args || typeof args !== 'object') {
      throw new Error('Invalid SSH credential response')
    }
    const { requestId, value } = args as { requestId?: unknown; value?: unknown }
    if (
      typeof requestId !== 'string' ||
      requestId.length === 0 ||
      requestId.length > MAX_REQUEST_ID_LENGTH ||
      (value !== null &&
        (typeof value !== 'string' || value.length > MAX_CREDENTIAL_RESPONSE_LENGTH))
    ) {
      throw new Error('Invalid SSH credential response')
    }
    settleCredentialRequest(requestId, value)
  })
}
