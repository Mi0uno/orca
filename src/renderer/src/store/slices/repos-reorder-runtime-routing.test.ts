import { describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import {
  installReposRuntimeRoutingHarness,
  localRepo,
  remoteRepo,
  reposReorder,
  runtimeEnvironmentCall
} from './repos-runtime-routing-fixture'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

installReposRuntimeRoutingHarness()

describe('repo slice reorder runtime routing', () => {
  it('reorders repos through the active remote runtime environment', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-4',
      ok: true,
      result: { status: 'applied' },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [localRepo, remoteRepo]
    })

    await store.getState().reorderRepos([remoteRepo.id, localRepo.id])

    expect(store.getState().repos.map((repo) => repo.id)).toEqual([remoteRepo.id, localRepo.id])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'repo.reorder',
      params: { orderedIds: [remoteRepo.id, localRepo.id] },
      timeoutMs: 15_000
    })
    expect(reposReorder).not.toHaveBeenCalled()
  })
})
