import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const ipcHandlers = vi.hoisted(() => new Map<string, (_event: unknown, args: unknown) => unknown>())

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: vi.fn((channel: string) => ipcHandlers.delete(channel)),
    handle: vi.fn((channel: string, handler: (_event: unknown, args: unknown) => unknown) => {
      ipcHandlers.set(channel, handler)
    })
  }
}))

import { registerCredentialHandler, requestCredential } from './ssh-passphrase'

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() }
  } as unknown as BrowserWindow
}

describe('SSH credential prompt IPC', () => {
  beforeEach(() => {
    ipcHandlers.clear()
  })

  it('forwards bounded keyboard-interactive prompt metadata and resolves its answer', async () => {
    const window = createWindow()
    const getMainWindow = () => window
    registerCredentialHandler()

    const answerPromise = requestCredential(
      getMainWindow,
      'target-1',
      'keyboard-interactive',
      'Verification code: ',
      {
        interactionName: 'Duo Security',
        instructions: 'Approve the sign-in request.',
        echo: false,
        promptIndex: 1,
        promptCount: 2
      }
    )

    expect(window.webContents.send).toHaveBeenCalledWith(
      'ssh:credential-request',
      expect.objectContaining({
        targetId: 'target-1',
        kind: 'keyboard-interactive',
        detail: 'Verification code: ',
        interactionName: 'Duo Security',
        instructions: 'Approve the sign-in request.',
        echo: false,
        promptIndex: 1,
        promptCount: 2
      })
    )
    const request = vi.mocked(window.webContents.send).mock.calls[0][1] as {
      requestId: string
    }
    await ipcHandlers.get('ssh:submitCredential')?.(null, {
      requestId: request.requestId,
      value: '654321'
    })

    await expect(answerPromise).resolves.toBe('654321')
    expect(window.webContents.send).toHaveBeenCalledWith('ssh:credential-resolved', {
      requestId: request.requestId
    })
  })

  it('resolves and removes an interactive request when its connection aborts', async () => {
    const window = createWindow()
    const getMainWindow = () => window
    const abortController = new AbortController()

    const answerPromise = requestCredential(
      getMainWindow,
      'target-1',
      'keyboard-interactive',
      'Code: ',
      {
        interactionName: '',
        instructions: '',
        echo: false,
        promptIndex: 1,
        promptCount: 1
      },
      abortController.signal
    )
    const request = vi.mocked(window.webContents.send).mock.calls[0][1] as {
      requestId: string
    }

    abortController.abort()

    await expect(answerPromise).resolves.toBeNull()
    expect(window.webContents.send).toHaveBeenCalledWith('ssh:credential-resolved', {
      requestId: request.requestId
    })
  })

  it('does not enqueue a request for an already-aborted connection', async () => {
    const window = createWindow()
    const abortController = new AbortController()
    abortController.abort()

    const answer = await requestCredential(
      () => window,
      'target-1',
      'keyboard-interactive',
      'Code: ',
      {
        interactionName: '',
        instructions: '',
        echo: false,
        promptIndex: 1,
        promptCount: 1
      },
      abortController.signal
    )

    expect(answer).toBeNull()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('rejects non-string credential responses at the IPC boundary', async () => {
    const window = createWindow()
    const getMainWindow = () => window
    registerCredentialHandler()
    const answerPromise = requestCredential(getMainWindow, 'target-1', 'password', 'host')
    const request = vi.mocked(window.webContents.send).mock.calls[0][1] as {
      requestId: string
    }

    expect(() =>
      ipcHandlers.get('ssh:submitCredential')?.(null, {
        requestId: request.requestId,
        value: { exposed: 'not-a-string' }
      })
    ).toThrow('Invalid SSH credential response')

    await ipcHandlers.get('ssh:submitCredential')?.(null, {
      requestId: request.requestId,
      value: null
    })
    await expect(answerPromise).resolves.toBeNull()
  })
})
