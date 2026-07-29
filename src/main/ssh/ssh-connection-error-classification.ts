import { isAuthError } from './ssh-connection-utils'

export type SshConnectionErrorReason = 'auth' | 'unreachable' | 'network' | 'timeout' | 'unknown'

export type SshConnectionErrorClassification = {
  reason: SshConnectionErrorReason
  message: string
}

/** Map a raw SSH connection error to a short, user-facing reason so the UI can
 *  distinguish a wrong password from a network/host problem instead of showing
 *  ssh2's opaque "All configured authentication methods failed". */
export function classifySshConnectionError(
  err: Error,
  usedPassword: boolean
): SshConnectionErrorClassification {
  const code = (err as NodeJS.ErrnoException).code
  const msg = err.message.toLowerCase()

  if (isAuthError(err) || msg.includes('permission denied')) {
    return {
      reason: 'auth',
      message: usedPassword
        ? 'Authentication failed. Check the password and try again.'
        : 'Authentication failed. Check your credentials and try again.'
    }
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || msg.includes('unreach')) {
    return { reason: 'unreachable', message: 'Host is unreachable. Check the address and network.' }
  }
  if (code === 'ETIMEDOUT' || msg.includes('etimedout') || msg.includes('timed out')) {
    return { reason: 'timeout', message: 'Connection timed out. The host did not respond.' }
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN' ||
    msg.includes('econn')
  ) {
    return { reason: 'network', message: 'Network error connecting to the host.' }
  }
  return { reason: 'unknown', message: err.message }
}
