// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAddRepoHostChangeReset } from './use-add-repo-host-change-reset'

describe('useAddRepoHostChangeReset', () => {
  it('resets closed state only when the dialog transitions from open to closed', () => {
    const resetHostScopedState = vi.fn()
    const initialResetClosed = vi.fn()

    const { rerender } = renderHook(
      ({
        isOpen,
        onResetClosed,
        selectedHostId
      }: {
        isOpen: boolean
        onResetClosed: () => void
        selectedHostId: string
      }) =>
        useAddRepoHostChangeReset({
          isOpen,
          selectedHostId,
          onResetClosed,
          onResetHostScopedState: resetHostScopedState
        }),
      {
        initialProps: {
          isOpen: false,
          onResetClosed: initialResetClosed,
          selectedHostId: 'local'
        }
      }
    )

    expect(initialResetClosed).not.toHaveBeenCalled()

    const closedRerenderReset = vi.fn()
    rerender({
      isOpen: false,
      onResetClosed: closedRerenderReset,
      selectedHostId: 'local'
    })
    expect(closedRerenderReset).not.toHaveBeenCalled()

    const openReset = vi.fn()
    rerender({
      isOpen: true,
      onResetClosed: openReset,
      selectedHostId: 'local'
    })
    expect(openReset).not.toHaveBeenCalled()

    const closeReset = vi.fn()
    rerender({
      isOpen: false,
      onResetClosed: closeReset,
      selectedHostId: 'local'
    })
    expect(closeReset).toHaveBeenCalledTimes(1)

    const stillClosedReset = vi.fn()
    rerender({
      isOpen: false,
      onResetClosed: stillClosedReset,
      selectedHostId: 'local'
    })
    expect(stillClosedReset).not.toHaveBeenCalled()
    expect(resetHostScopedState).not.toHaveBeenCalled()
  })
})
