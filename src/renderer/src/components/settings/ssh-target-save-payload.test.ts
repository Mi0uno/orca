import { describe, expect, it } from 'vitest'
import { EMPTY_FORM } from './ssh-target-draft'
import { buildSshTargetSavePayload, resolveSshPasswordSaveAction } from './ssh-target-save-payload'

describe('buildSshTargetSavePayload', () => {
  it('rejects empty hosts', () => {
    const result = buildSshTargetSavePayload({ ...EMPTY_FORM, host: '' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Host or SSH config alias is required')
    }
  })

  it('omits default SSH connection reuse from new targets but clears it on update', () => {
    const result = buildSshTargetSavePayload({
      ...EMPTY_FORM,
      label: 'Production',
      host: 'prod.example.com',
      username: 'deploy',
      port: '2202'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.payload.target).toMatchObject({
      label: 'Production',
      configHost: 'prod.example.com',
      host: 'prod.example.com',
      port: 2202,
      username: 'deploy',
      relayGracePeriodSeconds: 0
    })
    expect(result.payload.target).not.toHaveProperty('systemSshConnectionReuse')
    expect(result.payload.updates).toMatchObject({
      source: 'manual',
      identityFile: undefined,
      proxyCommand: undefined,
      jumpHost: undefined,
      systemSshConnectionReuse: undefined
    })
  })

  it('persists explicit SSH connection reuse opt-outs and bounded relay timeouts', () => {
    const result = buildSshTargetSavePayload({
      ...EMPTY_FORM,
      host: 'appliance.example.com',
      username: 'admin',
      identityFile: '~/.ssh/appliance',
      proxyCommand: 'cloudflared access ssh --hostname %h',
      jumpHost: 'bastion.example.com',
      systemSshConnectionReuse: false,
      relayKeepAliveUntilReset: false,
      relayGracePeriodSeconds: '600'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.payload.target).toMatchObject({
      label: 'admin@appliance.example.com',
      host: 'appliance.example.com',
      relayGracePeriodSeconds: 600,
      identityFile: '~/.ssh/appliance',
      proxyCommand: 'cloudflared access ssh --hostname %h',
      jumpHost: 'bastion.example.com',
      systemSshConnectionReuse: false
    })
    expect(result.payload.updates).toMatchObject({
      source: 'manual',
      systemSshConnectionReuse: false
    })
  })

  it('rejects invalid bounded relay timeouts', () => {
    const result = buildSshTargetSavePayload({
      ...EMPTY_FORM,
      host: 'appliance.example.com',
      relayKeepAliveUntilReset: false,
      relayGracePeriodSeconds: '59'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Terminal timeout')
    }
  })

  it('records password auth flags without ever including the password', () => {
    const result = buildSshTargetSavePayload({
      ...EMPTY_FORM,
      host: 'db.example.com',
      username: 'root',
      authMethod: 'password',
      password: 'super-secret',
      savePassword: true,
      identityFile: '~/.ssh/ignored'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(result.error)
    }
    expect(result.payload.target).toMatchObject({ authMethod: 'password', savePassword: true })
    // Identity file is a key-auth concept and must be dropped in password mode.
    expect(result.payload.target).not.toHaveProperty('identityFile')
    // The secret must never appear in the persisted target payload.
    expect(JSON.stringify(result.payload)).not.toContain('super-secret')
    expect(result.payload.updates).toMatchObject({
      authMethod: 'password',
      savePassword: true,
      identityFile: undefined
    })
  })

  it('rejects password auth combined with a proxy command or jump host', () => {
    const result = buildSshTargetSavePayload({
      ...EMPTY_FORM,
      host: 'db.example.com',
      authMethod: 'password',
      password: 'x',
      jumpHost: 'bastion.example.com'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Password login')
    }
  })
})

describe('resolveSshPasswordSaveAction', () => {
  it('clears any stored password when the host uses key auth', () => {
    expect(resolveSshPasswordSaveAction({ ...EMPTY_FORM, authMethod: 'key' })).toEqual({
      kind: 'clear'
    })
  })

  it('sets a freshly typed password with the remember flag', () => {
    expect(
      resolveSshPasswordSaveAction({
        ...EMPTY_FORM,
        authMethod: 'password',
        password: 'pw',
        savePassword: true
      })
    ).toEqual({ kind: 'set', password: 'pw', remember: true })
  })

  it('keeps an existing saved password when the field is left blank', () => {
    expect(
      resolveSshPasswordSaveAction({
        ...EMPTY_FORM,
        authMethod: 'password',
        password: '',
        savePassword: true
      })
    ).toEqual({ kind: 'none' })
  })

  it('clears a saved password when remember is turned off with no new value', () => {
    expect(
      resolveSshPasswordSaveAction({
        ...EMPTY_FORM,
        authMethod: 'password',
        password: '',
        savePassword: false
      })
    ).toEqual({ kind: 'clear' })
  })
})
