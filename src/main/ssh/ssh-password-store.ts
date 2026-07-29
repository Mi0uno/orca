import { safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-file'

// Why: SSH host passwords are secrets. They must never land in persisted target
// state, workspace state, logs, or telemetry — only in this local, OS-encrypted
// credential file (macOS Keychain / Windows DPAPI / Linux libsecret via
// safeStorage), keyed by target id. Mirrors minimax-cookie-store.ts.

const SSH_PASSWORD_FILE = 'ssh-passwords.enc'
const ENVELOPE_PREFIX = 'orca-ssh-passwords:v1:'

type PasswordEnvelopeKind = 'encrypted' | 'plaintext'

// Persisted passwords, decrypted lazily and cached for this process.
let cachedPasswords: Record<string, string> | null = null

// Why: session-only passwords the user typed without "remember" — kept in memory
// so a reconnect within the same session doesn't reprompt, but never written to disk.
const transientPasswords = new Map<string, string>()

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getSshPasswordPath(): string {
  return join(getOrcaDir(), SSH_PASSWORD_FILE)
}

function encodeEnvelope(kind: PasswordEnvelopeKind, payload: Buffer): string {
  return `${ENVELOPE_PREFIX}${kind}:${payload.toString('base64')}`
}

function serializePasswords(passwords: Record<string, string>): string {
  const json = JSON.stringify(passwords)
  if (safeStorage.isEncryptionAvailable()) {
    return encodeEnvelope('encrypted', safeStorage.encryptString(json))
  }
  console.warn('[ssh] safeStorage encryption unavailable — storing SSH passwords in plaintext')
  return encodeEnvelope('plaintext', Buffer.from(json, 'utf8'))
}

function decodeEnvelope(raw: Buffer): { kind: PasswordEnvelopeKind; payload: Buffer } {
  const text = raw.toString('utf8')
  if (!text.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('SSH password store is corrupt')
  }
  const rest = text.slice(ENVELOPE_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator < 0) {
    throw new Error('SSH password store is corrupt')
  }
  const kind = rest.slice(0, separator)
  if (kind !== 'encrypted' && kind !== 'plaintext') {
    throw new Error('SSH password store is corrupt')
  }
  return { kind, payload: Buffer.from(rest.slice(separator + 1), 'base64') }
}

function readEnvelope(raw: Buffer): Record<string, string> {
  const envelope = decodeEnvelope(raw)
  const json =
    envelope.kind === 'plaintext'
      ? envelope.payload.toString('utf8')
      : decryptEnvelopePayload(envelope.payload)
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }
  // Why: coerce to a flat string map so a tampered/legacy file can't inject
  // non-string values that later flow into a ConnectConfig.
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

function decryptEnvelopePayload(payload: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SSH passwords could not be decrypted')
  }
  return safeStorage.decryptString(payload)
}

function loadPersistedPasswords(): Record<string, string> {
  if (cachedPasswords !== null) {
    return cachedPasswords
  }
  const path = getSshPasswordPath()
  if (!existsSync(path)) {
    cachedPasswords = {}
    return cachedPasswords
  }
  // Why: keep hardening outside the decode try so a chmod/ACL failure isn't
  // misreported as a decrypt failure (matches minimax-cookie-store).
  try {
    hardenExistingSecureFile(path)
  } catch (error) {
    console.warn('[ssh] Failed to harden SSH password file while reading', error)
  }
  try {
    cachedPasswords = readEnvelope(readFileSync(path))
    return cachedPasswords
  } catch (error) {
    console.error('[ssh] Failed to decode/decrypt SSH password store', error)
    // Why: a corrupt/undecryptable store must not brick every host. Treat as
    // empty so the user is reprompted; saving a new password overwrites it.
    cachedPasswords = {}
    return cachedPasswords
  }
}

function persistPasswords(passwords: Record<string, string>): void {
  cachedPasswords = passwords
  if (Object.keys(passwords).length === 0) {
    rmSync(getSshPasswordPath(), { force: true })
    return
  }
  writeSecureFile(getSshPasswordPath(), serializePasswords(passwords))
}

/** Persist a password for a target in the local encrypted credential store. */
export function saveSshPassword(targetId: string, password: string): void {
  const passwords = { ...loadPersistedPasswords() }
  passwords[targetId] = password
  persistPasswords(passwords)
}

/** Remove any persisted password for a target. Leaves the transient copy intact. */
export function deleteSshPassword(targetId: string): void {
  const passwords = loadPersistedPasswords()
  if (!(targetId in passwords)) {
    return
  }
  const next = { ...passwords }
  delete next[targetId]
  persistPasswords(next)
}

/** True when a password is persisted for this target (ignores transient copies). */
export function hasSavedSshPassword(targetId: string): boolean {
  return targetId in loadPersistedPasswords()
}

/** Store a password only for the lifetime of this app session (no disk write). */
export function setTransientSshPassword(targetId: string, password: string): void {
  transientPasswords.set(targetId, password)
}

/** Drop a session-only password (e.g. when the target is removed). */
export function clearTransientSshPassword(targetId: string): void {
  transientPasswords.delete(targetId)
}

/** Resolve the effective password for a connect attempt: a session-only value
 *  the user just typed wins over the persisted one so an updated password takes
 *  effect immediately. Returns undefined when neither exists. */
export function resolveStoredSshPassword(targetId: string): string | undefined {
  return transientPasswords.get(targetId) ?? loadPersistedPasswords()[targetId]
}

/** Forget every persisted and transient password (used only by tests). */
export function __resetSshPasswordStoreForTests(): void {
  cachedPasswords = null
  transientPasswords.clear()
}
