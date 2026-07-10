import { GitBranch, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export type FolderProjectGitWorktreePromptProps = {
  initializeGit: boolean
  onInitializeGitChange: (next: boolean) => void
  onUseGitWorktrees: () => void
  preparing: boolean
  disabled: boolean
}

export function FolderProjectGitWorktreePrompt({
  initializeGit,
  onInitializeGitChange,
  onUseGitWorktrees,
  preparing,
  disabled
}: FolderProjectGitWorktreePromptProps): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <GitBranch className="size-3.5 text-muted-foreground" />
            {translate(
              'auto.components.new.workspace.FolderProjectGitWorktreePrompt.gitWorktrees',
              'Git worktrees'
            )}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {translate(
              'auto.components.new.workspace.FolderProjectGitWorktreePrompt.description',
              'Use branches from this folder instead of plain folder workspaces.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onUseGitWorktrees}
          disabled={disabled || preparing}
          className="shrink-0"
        >
          {preparing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {preparing
            ? translate(
                'auto.components.new.workspace.FolderProjectGitWorktreePrompt.preparing',
                'Preparing'
              )
            : translate(
                'auto.components.new.workspace.FolderProjectGitWorktreePrompt.useGitWorktrees',
                'Use Git worktrees'
              )}
        </Button>
      </div>
      <Label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-normal">
        <Checkbox
          className="mt-0.5"
          checked={initializeGit}
          disabled={disabled || preparing}
          onCheckedChange={(checked) => onInitializeGitChange(checked === true)}
        />
        <span className="min-w-0">
          <span className="block font-medium text-foreground">
            {translate(
              'auto.components.new.workspace.FolderProjectGitWorktreePrompt.initializeGit',
              'Initialize Git here'
            )}
          </span>
          <span className="block text-[11px] leading-4 text-muted-foreground">
            {translate(
              'auto.components.new.workspace.FolderProjectGitWorktreePrompt.initializeGitDescription',
              'Create an initial commit if this folder is not already a repository.'
            )}
          </span>
        </span>
      </Label>
    </div>
  )
}
