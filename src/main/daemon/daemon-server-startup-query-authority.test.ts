import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DaemonServer } from './daemon-server'
import type { DaemonRequest } from './types'
import type { SubprocessHandle } from './session'

type DaemonServerPrivate = {
  host: {
    closeStartupQueryAuthority(sessionId: string): number
  }
  routeRequest(clientId: string, request: DaemonRequest): Promise<unknown>
}

describe('DaemonServer startup query authority routing', () => {
  let dir: string | null = null
  let server: DaemonServer | null = null

  afterEach(async () => {
    await server?.shutdown()
    server = null
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = null
    }
  })

  it('returns the applied sequence from closeStartupQueryAuthority', async () => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-startup-query-authority-'))
    server = new DaemonServer({
      socketPath: join(dir, 'daemon.sock'),
      tokenPath: join(dir, 'daemon.token'),
      spawnSubprocess: () => ({}) as SubprocessHandle
    })
    const daemon = server as unknown as DaemonServerPrivate
    const closeAuthority = vi.spyOn(daemon.host, 'closeStartupQueryAuthority').mockReturnValue(42)

    await expect(
      daemon.routeRequest('client-1', {
        id: 'req-1',
        type: 'closeStartupQueryAuthority',
        payload: { sessionId: 'session-1' }
      })
    ).resolves.toEqual({ appliedSeq: 42 })
    expect(closeAuthority).toHaveBeenCalledWith('session-1')
  })
})
