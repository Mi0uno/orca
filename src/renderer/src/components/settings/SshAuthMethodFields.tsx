import { FileKey, KeyRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SettingsSwitch } from './SettingsFormControls'
import type { EditingTarget } from './ssh-target-draft'
import { translate } from '@/i18n/i18n'

// Why: both add-host entry points (Settings form + sidebar dialog) offer the same
// auth-method choice, so the SSH-key / password fields live in one component to
// keep the credential UX and masking rules identical.
export function SshAuthMethodFields({
  idPrefix,
  form,
  disabled,
  onFormChange
}: {
  idPrefix: string
  form: EditingTarget
  disabled: boolean
  onFormChange: (updater: (prev: EditingTarget) => EditingTarget) => void
}): React.JSX.Element {
  const isPassword = form.authMethod === 'password'

  return (
    <div className="col-span-2 space-y-3">
      <div className="space-y-1.5">
        <Label>
          {translate('auto.components.settings.SshAuthMethodFields.method', 'Authentication')}
        </Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={form.authMethod}
          onValueChange={(value) => {
            // Why: radix emits '' when the active item is re-pressed; ignore it so
            // a method always stays selected.
            if (value !== 'key' && value !== 'password') {
              return
            }
            onFormChange((f) => ({ ...f, authMethod: value }))
          }}
          disabled={disabled}
          className="w-full"
        >
          <ToggleGroupItem value="key" className="flex-1 gap-1.5">
            <FileKey className="size-3.5" />
            {translate('auto.components.settings.SshAuthMethodFields.key', 'SSH Key')}
          </ToggleGroupItem>
          <ToggleGroupItem value="password" className="flex-1 gap-1.5">
            <KeyRound className="size-3.5" />
            {translate('auto.components.settings.SshAuthMethodFields.password', 'Password')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isPassword ? (
        <PasswordFields
          idPrefix={idPrefix}
          form={form}
          disabled={disabled}
          onFormChange={onFormChange}
        />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-identity-file`} className="flex items-center gap-1.5">
            <FileKey className="size-3.5" />
            {translate('auto.components.settings.SshTargetForm.63c0c145c1', 'Identity File')}
          </Label>
          <Input
            id={`${idPrefix}-identity-file`}
            value={form.identityFile}
            disabled={disabled}
            onChange={(e) => onFormChange((f) => ({ ...f, identityFile: e.target.value }))}
            placeholder={translate(
              'auto.components.settings.SshTargetForm.d6a5f2ee5c',
              '~/.ssh/id_ed25519 (leave empty for SSH agent)'
            )}
          />
          <p className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.settings.SshTargetForm.cb91f6375c',
              'Optional. SSH agent is used by default.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function PasswordFields({
  idPrefix,
  form,
  disabled,
  onFormChange
}: {
  idPrefix: string
  form: EditingTarget
  disabled: boolean
  onFormChange: (updater: (prev: EditingTarget) => EditingTarget) => void
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-password`} className="flex items-center gap-1.5">
          <KeyRound className="size-3.5" />
          {translate('auto.components.settings.SshAuthMethodFields.passwordLabel', 'Password')}
        </Label>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="off"
          maxLength={16_384}
          value={form.password}
          disabled={disabled}
          onChange={(e) => onFormChange((f) => ({ ...f, password: e.target.value }))}
          placeholder={
            form.hasSavedPassword
              ? translate(
                  'auto.components.settings.SshAuthMethodFields.savedPlaceholder',
                  'Password saved — leave blank to keep'
                )
              : translate(
                  'auto.components.settings.SshAuthMethodFields.enterPlaceholder',
                  'Enter password'
                )
          }
        />
      </div>

      <div className="flex items-start justify-between gap-4 py-1 text-xs">
        <div className="min-w-0 flex-1 space-y-0.5">
          <Label className="text-xs font-medium">
            {translate(
              'auto.components.settings.SshAuthMethodFields.remember',
              'Remember password'
            )}
          </Label>
          <p className="text-muted-foreground">
            {translate(
              'auto.components.settings.SshAuthMethodFields.rememberHelp',
              'Stored in your operating system’s secure credential store. Turn off to enter it each session.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={form.savePassword}
          disabled={disabled}
          onChange={() => onFormChange((f) => ({ ...f, savePassword: !f.savePassword }))}
          ariaLabel={translate(
            'auto.components.settings.SshAuthMethodFields.remember',
            'Remember password'
          )}
        />
      </div>

      {form.hasSavedPassword ? (
        <button
          type="button"
          disabled={disabled}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() =>
            onFormChange((f) => ({
              ...f,
              password: '',
              savePassword: false,
              hasSavedPassword: false
            }))
          }
        >
          {translate(
            'auto.components.settings.SshAuthMethodFields.clearSaved',
            'Clear saved password'
          )}
        </button>
      ) : null}
    </div>
  )
}
