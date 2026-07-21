import { describe, expect, it, vi } from 'vitest'
import type { Prompt } from 'ssh2'
import { requestKeyboardInteractiveAnswers } from './ssh-keyboard-interactive'
import type { SshConnectionCallbacks } from './ssh-connection-utils'

function createCallbacks(
  onCredentialRequest?: SshConnectionCallbacks['onCredentialRequest']
): SshConnectionCallbacks {
  return { onStateChange: vi.fn(), onCredentialRequest }
}

function createRequest(
  prompts: Prompt[],
  callbacks: SshConnectionCallbacks,
  signal = new AbortController().signal
) {
  return {
    targetId: 'target-1',
    interactionName: 'Verification',
    instructions: 'Complete the prompts.',
    prompts,
    callbacks,
    signal
  }
}

describe('requestKeyboardInteractiveAnswers', () => {
  it('declines prompts when no credential callback is available', async () => {
    await expect(
      requestKeyboardInteractiveAnswers(
        createRequest([{ prompt: 'Code: ', echo: false }], createCallbacks())
      )
    ).resolves.toBeUndefined()
  })

  it('declines a prompt flood without opening renderer requests', async () => {
    const onCredentialRequest = vi.fn().mockResolvedValue('answer')
    const prompts = Array.from({ length: 33 }, (_, index) => ({
      prompt: `Prompt ${index}`,
      echo: false
    }))

    await expect(
      requestKeyboardInteractiveAnswers(
        createRequest(prompts, createCallbacks(onCredentialRequest))
      )
    ).resolves.toBeUndefined()
    expect(onCredentialRequest).not.toHaveBeenCalled()
  })

  it('declines prompts after the connection is aborted', async () => {
    const abortController = new AbortController()
    abortController.abort()
    const onCredentialRequest = vi.fn().mockResolvedValue('answer')

    await expect(
      requestKeyboardInteractiveAnswers(
        createRequest(
          [{ prompt: 'Code: ', echo: false }],
          createCallbacks(onCredentialRequest),
          abortController.signal
        )
      )
    ).resolves.toBeNull()
    expect(onCredentialRequest).not.toHaveBeenCalled()
  })
})
