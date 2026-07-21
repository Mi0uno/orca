import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Server } from 'ssh2'
import { describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { SshTarget } from '../../shared/ssh-types'

vi.mock('./ssh-config-parser', () => ({
  resolveWithSshG: vi.fn().mockResolvedValue(null)
}))

import { SshConnection, type SshConnectionCallbacks } from './ssh-connection'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

describe('SSH keyboard-interactive authentication', () => {
  it('completes password plus multi-prompt verification against a real ssh2 server', async () => {
    const hostKey = readFileSync(
      join(process.cwd(), 'node_modules', 'ssh2', 'test', 'fixtures', 'ssh_host_rsa_key')
    )
    const server = new Server({ hostKeys: [hostKey] }, (client) => {
      let passwordAccepted = false
      client.on('authentication', (context) => {
        if (context.method === 'password' && context.password === 'correct-password') {
          passwordAccepted = true
          context.reject(['keyboard-interactive'], true)
          return
        }
        if (context.method === 'keyboard-interactive' && passwordAccepted) {
          context.prompt(
            [
              { prompt: 'Verification code: ', echo: false },
              { prompt: 'Device name: ', echo: true }
            ],
            (answers) => {
              if (answers[0] === '654321' && answers[1] === 'laptop') {
                context.accept()
              } else {
                context.reject(['keyboard-interactive'])
              }
            }
          )
          return
        }
        context.reject(passwordAccepted ? ['keyboard-interactive'] : ['password'])
      })
    })

    const port = await listen(server)
    const target: SshTarget = {
      id: 'keyboard-interactive-target',
      label: 'MFA host',
      host: '127.0.0.1',
      port,
      username: 'deploy',
      identityAgent: 'none'
    }
    const onCredentialRequest = vi.fn(
      async (_targetId: string, kind: string, detail: string): Promise<string | null> => {
        if (kind === 'password') {
          return 'correct-password'
        }
        if (kind === 'keyboard-interactive' && detail.startsWith('Verification code')) {
          return '654321'
        }
        if (kind === 'keyboard-interactive' && detail.startsWith('Device name')) {
          return 'laptop'
        }
        return null
      }
    )
    const callbacks: SshConnectionCallbacks = {
      onStateChange: vi.fn(),
      onCredentialRequest
    }
    const connection = new SshConnection(target, callbacks)

    try {
      await connection.connect()

      expect(connection.getState().status).toBe('connected')
      expect(onCredentialRequest).toHaveBeenCalledWith(target.id, 'password', target.host)
      expect(onCredentialRequest).toHaveBeenCalledWith(
        target.id,
        'keyboard-interactive',
        'Verification code: ',
        expect.objectContaining({ echo: false, promptIndex: 1, promptCount: 2 }),
        expect.any(AbortSignal)
      )
      expect(onCredentialRequest).toHaveBeenCalledWith(
        target.id,
        'keyboard-interactive',
        'Device name: ',
        expect.objectContaining({ echo: true, promptIndex: 2, promptCount: 2 }),
        expect.any(AbortSignal)
      )
    } finally {
      await connection.disconnect()
      await close(server)
    }
  })
})
