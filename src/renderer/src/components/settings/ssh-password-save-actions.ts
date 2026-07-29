import type { MutableRefObject } from 'react'
import type { SshTarget } from '../../../../shared/ssh-types'
import { resolveSshPasswordSaveAction } from './ssh-target-save-payload'
import type { EditingTarget } from './ssh-target-draft'

// Why: the password is a secret, so it travels over the dedicated ssh:setPassword
// channel after the (secret-free) target is persisted — never through addTarget.
// Kept out of SshPane so the pane stays under the max-lines budget and both the
// save and edit password concerns live together.

/** Persist/clear the stored password for a just-saved target per the form's intent. */
export async function applySshPasswordFormAction(
  targetId: string,
  form: EditingTarget
): Promise<void> {
  const action = resolveSshPasswordSaveAction(form)
  if (action.kind === 'set') {
    await window.api.ssh.setPassword({
      targetId,
      password: action.password,
      remember: action.remember
    })
  } else if (action.kind === 'clear') {
    await window.api.ssh.clearPassword({ targetId })
  }
}

/** When editing a password host, reflect whether a password is already saved so
 *  the form can show "leave blank to keep" without exposing the stored secret. */
export function loadSavedSshPasswordFlag(
  target: SshTarget,
  setForm: (updater: (prev: EditingTarget) => EditingTarget) => void,
  mountedRef: MutableRefObject<boolean>
): void {
  if (target.authMethod !== 'password') {
    return
  }
  void window.api.ssh.hasPassword({ targetId: target.id }).then((saved) => {
    if (mountedRef.current) {
      setForm((f) => ({ ...f, hasSavedPassword: saved }))
    }
  })
}
