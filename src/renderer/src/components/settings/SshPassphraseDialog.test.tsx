// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { SshPassphraseDialog } from './SshPassphraseDialog'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-dialog-open="true">{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>
}))

const initialState = useAppStore.getInitialState()
const submitCredential = vi.fn().mockResolvedValue(undefined)
let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderRequest(request: Record<string, string | number | boolean>): Promise<void> {
  useAppStore.setState({
    sshCredentialQueue: [request] as never,
    sshTargetLabels: new Map([['target-1', 'Production host']])
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<SshPassphraseDialog />))
}

function getButton(label: string): HTMLButtonElement {
  const button = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }
  return button
}

async function setInputValue(value: string): Promise<void> {
  const input = container?.querySelector<HTMLInputElement>('input')
  if (!input) {
    throw new Error('Credential input not found')
  }
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('SshPassphraseDialog keyboard-interactive prompts', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
    submitCredential.mockClear()
    submitCredential.mockResolvedValue(undefined)
    mocks.toastError.mockReset()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ssh: { submitCredential } }
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount())
    }
    root = null
    container?.remove()
    container = null
    useAppStore.setState(initialState, true)
  })

  it('shows server instructions and masks a non-echoing challenge answer', async () => {
    await renderRequest({
      requestId: 'request-1',
      targetId: 'target-1',
      kind: 'keyboard-interactive',
      detail: 'Verification code: ',
      interactionName: 'Duo Security',
      instructions: 'Approve the sign-in request, then enter the code.',
      echo: false,
      promptIndex: 1,
      promptCount: 2
    })

    expect(container?.textContent).toContain('SSH Verification')
    expect(container?.textContent).toContain('Production host')
    expect(container?.textContent).toContain('Duo Security')
    expect(container?.textContent).toContain('Approve the sign-in request, then enter the code.')
    expect(container?.textContent).toContain('Prompt 1 of 2')
    expect(container?.querySelector('input')?.type).toBe('password')
    expect(getButton('Continue').disabled).toBe(false)
  })

  it('shows an echoing prompt as text and permits an empty response', async () => {
    await renderRequest({
      requestId: 'request-2',
      targetId: 'target-1',
      kind: 'keyboard-interactive',
      detail: 'Press Enter to approve: ',
      interactionName: '',
      instructions: '',
      echo: true,
      promptIndex: 1,
      promptCount: 1
    })

    const input = container?.querySelector('input')
    expect(input?.type).toBe('text')

    await act(async () => getButton('Continue').click())

    expect(submitCredential).toHaveBeenCalledWith({ requestId: 'request-2', value: '' })
  })

  it('keeps password submission disabled until a value is entered', async () => {
    await renderRequest({
      requestId: 'request-3',
      targetId: 'target-1',
      kind: 'password',
      detail: 'production.example.com'
    })

    expect(container?.textContent).toContain('SSH Password')
    expect(getButton('Connect').disabled).toBe(true)

    await setInputValue('secret-password')
    expect(getButton('Connect').disabled).toBe(false)
    await act(async () => getButton('Connect').click())

    expect(submitCredential).toHaveBeenCalledWith({
      requestId: 'request-3',
      value: 'secret-password'
    })
  })

  it('cancels a private-key passphrase request without submitting a secret', async () => {
    await renderRequest({
      requestId: 'request-4',
      targetId: 'target-1',
      kind: 'passphrase',
      detail: '~/.ssh/id_ed25519'
    })

    expect(container?.textContent).toContain('SSH Key Passphrase')
    await act(async () => getButton('Cancel').click())

    expect(submitCredential).toHaveBeenCalledWith({ requestId: 'request-4', value: null })
  })

  it('keeps the prompt open and reports a credential submission failure', async () => {
    submitCredential.mockRejectedValueOnce(new Error('Submission failed'))
    await renderRequest({
      requestId: 'request-5',
      targetId: 'target-1',
      kind: 'password',
      detail: 'production.example.com'
    })
    await setInputValue('secret-password')

    await act(async () => getButton('Connect').click())

    expect(mocks.toastError).toHaveBeenCalledWith('Submission failed')
    expect(container?.querySelector('[data-dialog-open]')).not.toBeNull()
    expect(getButton('Connect').disabled).toBe(false)
  })
})
