// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/types'

const setIssueSourcePreferenceMock = vi.fn()
const resolveRepositoryOriginLiveMock = vi.fn()

vi.mock('../../store', () => ({
  useAppStore: (
    selector: (state: {
      settingsSearchQuery: string
      setIssueSourcePreference: typeof setIssueSourcePreferenceMock
    }) => unknown
  ) =>
    selector({
      settingsSearchQuery: '',
      setIssueSourcePreference: setIssueSourcePreferenceMock
    })
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: () => ({ kind: 'local' })
}))

vi.mock('./repository-icon-github', () => ({
  resolveRepositoryOriginLive: (...args: unknown[]) => resolveRepositoryOriginLiveMock(...args)
}))

import { RepositoryIssueSourceSection } from './RepositoryIssueSourceSection'

const FORK_REPO: Repo = {
  id: 'repo-1',
  path: '/home/user/project',
  displayName: 'My Project',
  badgeColor: '#000000',
  addedAt: 0,
  upstream: { owner: 'stablyai', repo: 'orca' }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  setIssueSourcePreferenceMock.mockReset()
  setIssueSourcePreferenceMock.mockResolvedValue(undefined)
  resolveRepositoryOriginLiveMock.mockReset()
  resolveRepositoryOriginLiveMock.mockResolvedValue({ owner: 'Mi0uno', repo: 'orca' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

async function render(repo: Repo): Promise<void> {
  await act(async () => {
    root.render(React.createElement(RepositoryIssueSourceSection, { repo, forceVisible: true }))
  })
}

function segment(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === label
  )
  if (!button) {
    throw new Error(`segment "${label}" not found`)
  }
  return button as HTMLButtonElement
}

describe('RepositoryIssueSourceSection', () => {
  it('renders nothing for non-fork repos (no upstream)', async () => {
    const { upstream: _upstream, ...nonFork } = FORK_REPO
    await render(nonFork as Repo)
    expect(container.querySelector('[role="radiogroup"]')).toBeNull()
  })

  it('renders a three-way control for forks and marks auto active by default', async () => {
    await render(FORK_REPO)
    expect(segment('Auto').getAttribute('aria-checked')).toBe('true')
    expect(segment('Upstream').getAttribute('aria-checked')).toBe('false')
    expect(segment('Origin').getAttribute('aria-checked')).toBe('false')
  })

  it('reflects the persisted origin preference', async () => {
    await render({ ...FORK_REPO, issueSourcePreference: 'origin' })
    expect(segment('Origin').getAttribute('aria-checked')).toBe('true')
    expect(segment('Auto').getAttribute('aria-checked')).toBe('false')
  })

  it('persists the chosen preference via the store', async () => {
    await render(FORK_REPO)
    act(() => {
      segment('Origin').click()
    })
    expect(setIssueSourcePreferenceMock).toHaveBeenCalledWith(
      'repo-1',
      '/home/user/project',
      'origin'
    )
  })

  it('does not re-persist when the active pill is clicked again', async () => {
    await render({ ...FORK_REPO, issueSourcePreference: 'upstream' })
    act(() => {
      segment('Upstream').click()
    })
    expect(setIssueSourcePreferenceMock).not.toHaveBeenCalled()
  })
})
