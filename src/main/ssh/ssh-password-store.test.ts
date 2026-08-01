import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SshPasswordStore from './ssh-password-store'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8'))
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
const rmSyncMock = vi.fn()
const hardenExistingSecureFileMock = vi.fn()
const writeSecureFileMock = vi.fn()
const homedirMock = vi.fn(() => '/home/test')

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  rmSync: rmSyncMock
}))

vi.mock('node:os', () => ({ homedir: homedirMock }))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/')
}))

vi.mock('../../shared/secure-file', () => ({
  hardenExistingSecureFile: hardenExistingSecureFileMock,
  writeSecureFile: writeSecureFileMock
}))

const storePath = '/home/test/.orca/ssh-passwords.enc'
const envelope = (kind: 'encrypted' | 'plaintext', value: string): string =>
  `orca-ssh-passwords:v1:${kind}:${Buffer.from(value, 'utf8').toString('base64')}`

async function loadStore(): Promise<typeof SshPasswordStore> {
  return await import('./ssh-password-store')
}

describe('ssh-password-store', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
    rmSyncMock.mockReset()
    hardenExistingSecureFileMock.mockReset()
    writeSecureFileMock.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value))
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf8'))
    existsSyncMock.mockReturnValue(false)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('reports no saved password for an unknown target', async () => {
    const store = await loadStore()
    expect(store.hasSavedSshPassword('ssh-1')).toBe(false)
    expect(store.resolveStoredSshPassword('ssh-1')).toBeUndefined()
  })

  it('encrypts and persists a saved password', async () => {
    const store = await loadStore()
    store.saveSshPassword('ssh-1', 'hunter2')

    expect(safeStorageMock.encryptString).toHaveBeenCalledWith(
      JSON.stringify({ 'ssh-1': 'hunter2' })
    )
    expect(writeSecureFileMock).toHaveBeenCalledWith(
      storePath,
      envelope('encrypted', JSON.stringify({ 'ssh-1': 'hunter2' }))
    )
    expect(store.hasSavedSshPassword('ssh-1')).toBe(true)
    expect(store.resolveStoredSshPassword('ssh-1')).toBe('hunter2')
  })

  it('warns and writes plaintext when encryption is unavailable', async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = await loadStore()

    store.saveSshPassword('ssh-1', 'plain')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safeStorage encryption unavailable'))
    expect(writeSecureFileMock).toHaveBeenCalledWith(
      storePath,
      envelope('plaintext', JSON.stringify({ 'ssh-1': 'plain' }))
    )
    warn.mockRestore()
  })

  it('decrypts a persisted password from disk', async () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      Buffer.from(envelope('encrypted', JSON.stringify({ 'ssh-9': 'fromdisk' })), 'utf8')
    )
    const store = await loadStore()

    expect(store.resolveStoredSshPassword('ssh-9')).toBe('fromdisk')
    expect(hardenExistingSecureFileMock).toHaveBeenCalledWith(storePath)
  })

  it('deletes one target while keeping others, removing the file when empty', async () => {
    const store = await loadStore()
    store.saveSshPassword('ssh-1', 'a')
    store.saveSshPassword('ssh-2', 'b')
    writeSecureFileMock.mockClear()

    store.deleteSshPassword('ssh-1')
    expect(writeSecureFileMock).toHaveBeenLastCalledWith(
      storePath,
      envelope('encrypted', JSON.stringify({ 'ssh-2': 'b' }))
    )
    expect(store.hasSavedSshPassword('ssh-1')).toBe(false)

    store.deleteSshPassword('ssh-2')
    expect(rmSyncMock).toHaveBeenCalledWith(storePath, { force: true })
    expect(store.hasSavedSshPassword('ssh-2')).toBe(false)
  })

  it('prefers a transient password over the persisted one', async () => {
    const store = await loadStore()
    store.saveSshPassword('ssh-1', 'persisted')
    store.setTransientSshPassword('ssh-1', 'freshly-typed')

    expect(store.resolveStoredSshPassword('ssh-1')).toBe('freshly-typed')
    // Transient values are never persisted or counted as "saved".
    expect(store.hasSavedSshPassword('ssh-1')).toBe(true)

    store.clearTransientSshPassword('ssh-1')
    expect(store.resolveStoredSshPassword('ssh-1')).toBe('persisted')
  })

  it('treats a corrupt store as empty instead of throwing', async () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from('not-an-envelope', 'utf8'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await loadStore()

    expect(store.resolveStoredSshPassword('ssh-1')).toBeUndefined()
    expect(store.hasSavedSshPassword('ssh-1')).toBe(false)
    error.mockRestore()
  })
})
