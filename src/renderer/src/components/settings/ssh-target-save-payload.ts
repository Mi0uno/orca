import { MAX_SSH_RELAY_GRACE_PERIOD_SECONDS, type SshTarget } from '../../../../shared/ssh-types'
import {
  getSshTargetDraftConnectionFields,
  isRelayGracePeriodValid,
  parseRelayGracePeriodSeconds,
  type EditingTarget
} from './ssh-target-draft'
import { translate } from '../../i18n/i18n'

type SshTargetSavePayload = {
  target: Omit<SshTarget, 'id'>
  updates: Partial<Omit<SshTarget, 'id'>>
}

type SshTargetSavePayloadResult =
  | { ok: true; payload: SshTargetSavePayload }
  | { ok: false; error: string }

export function buildSshTargetSavePayload(form: EditingTarget): SshTargetSavePayloadResult {
  const { host, configHost, username, port } = getSshTargetDraftConnectionFields(form)
  if (!host) {
    return {
      ok: false,
      error: translate(
        'auto.components.settings.SshPane.0e5aa04161',
        'Host or SSH config alias is required'
      )
    }
  }

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      error: translate(
        'auto.components.settings.SshPane.4db9afce1c',
        'Port must be between 1 and 65535'
      )
    }
  }

  const graceSeconds = parseRelayGracePeriodSeconds(form)
  if (!isRelayGracePeriodValid(form, graceSeconds)) {
    return {
      ok: false,
      error: translate(
        'auto.components.settings.SshPane.3879cbaa52',
        'Terminal timeout must be between 60 and {{value0}} seconds, or keep terminals alive until reset.',
        { value0: MAX_SSH_RELAY_GRACE_PERIOD_SECONDS }
      )
    }
  }

  const usePassword = form.authMethod === 'password'
  const proxyCommand = form.proxyCommand.trim() || undefined
  const jumpHost = form.jumpHost.trim() || undefined

  // Why: password auth uses the direct ssh2 transport, which can't inject a
  // password through a spawned ProxyCommand/ProxyJump. Block the combination so
  // the user isn't left with a host that silently can't authenticate.
  if (usePassword && (proxyCommand || jumpHost)) {
    return {
      ok: false,
      error: translate(
        'auto.components.settings.SshPane.pwdProxyUnsupported',
        'Password login can’t be combined with a proxy command or jump host. Use an identity file for those hosts.'
      )
    }
  }

  // Why: identity file is a key-auth concept; drop it in password mode so the
  // connection layer doesn't offer a key the user explicitly opted out of.
  const identityFile = usePassword ? undefined : form.identityFile.trim() || undefined
  const systemSshConnectionReuse = form.systemSshConnectionReuse ? undefined : false
  const authMethod: SshTarget['authMethod'] = usePassword ? 'password' : undefined
  const savePassword = usePassword ? form.savePassword : undefined

  const target: Omit<SshTarget, 'id'> = {
    label: form.label.trim() || (username ? `${username}@${host}` : configHost),
    configHost,
    host,
    port,
    username,
    relayGracePeriodSeconds: graceSeconds,
    ...(authMethod ? { authMethod } : {}),
    ...(savePassword !== undefined ? { savePassword } : {}),
    ...(identityFile ? { identityFile } : {}),
    ...(proxyCommand ? { proxyCommand } : {}),
    ...(jumpHost ? { jumpHost } : {}),
    ...(systemSshConnectionReuse === false ? { systemSshConnectionReuse } : {})
  }

  return {
    ok: true,
    payload: {
      target,
      updates: {
        ...target,
        // Why: updateTarget merges partially, so explicit undefined values are
        // required to clear optional fields inherited from ~/.ssh/config or a
        // previous auth-method choice.
        authMethod,
        savePassword,
        identityFile,
        proxyCommand,
        jumpHost,
        systemSshConnectionReuse,
        source: 'manual'
      }
    }
  }
}

/** The password-store mutation a caller should run after persisting the target.
 *  Keeps the secret out of addTarget/updateTarget while letting both add-host
 *  UIs share one decision on set vs. clear vs. leave-as-is. */
export type SshPasswordSaveAction =
  | { kind: 'none' }
  | { kind: 'set'; password: string; remember: boolean }
  | { kind: 'clear' }

export function resolveSshPasswordSaveAction(form: EditingTarget): SshPasswordSaveAction {
  if (form.authMethod !== 'password') {
    // Why: switching a host back to key auth must drop any credential it held.
    return { kind: 'clear' }
  }
  if (form.password.length > 0) {
    return { kind: 'set', password: form.password, remember: form.savePassword }
  }
  // Blank password field on a password host: keep an existing saved credential,
  // but honor a toggled-off "remember" by clearing the persisted copy.
  if (!form.savePassword) {
    return { kind: 'clear' }
  }
  return { kind: 'none' }
}
