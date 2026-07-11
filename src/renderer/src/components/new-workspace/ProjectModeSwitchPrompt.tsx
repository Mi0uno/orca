import { Folder, GitBranch, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export type ProjectModeSwitchTarget = 'git-worktrees' | 'folder-workspace'

export type ProjectModeSwitchPromptProps = {
  targetMode: ProjectModeSwitchTarget
  initializeGit: boolean
  onInitializeGitChange: (next: boolean) => void
  onSwitchMode: () => void
  showInitializeGitOption?: boolean
  initializeGitRequired?: boolean
  preparing: boolean
  disabled: boolean
}

export function ProjectModeSwitchPrompt({
  targetMode,
  initializeGit,
  onInitializeGitChange,
  onSwitchMode,
  showInitializeGitOption = false,
  initializeGitRequired = false,
  preparing,
  disabled
}: ProjectModeSwitchPromptProps): React.JSX.Element {
  const isGitTarget = targetMode === 'git-worktrees'
  const Icon = isGitTarget ? GitBranch : Folder

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Icon className="size-3.5 text-muted-foreground" />
            {isGitTarget
              ? translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.gitWorktrees',
                  'Git worktrees'
                )
              : translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.folderWorkspaces',
                  'Plain folder workspaces'
                )}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {isGitTarget
              ? translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.description',
                  'Create or reuse branches from this folder instead of plain folder workspaces.'
                )
              : translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.folderDescription',
                  'Create workspaces directly in this project folder without Git worktree management.'
                )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onSwitchMode}
          disabled={disabled || preparing}
          className="shrink-0"
        >
          {preparing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {preparing
            ? translate(
                'auto.components.new.workspace.FolderProjectGitWorktreePrompt.preparing',
                'Switching'
              )
            : isGitTarget
              ? translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.switchToWorktreeMode',
                  'Switch to worktree mode'
                )
              : translate(
                  'auto.components.new.workspace.FolderProjectGitWorktreePrompt.switchToFolderMode',
                  'Switch to plain mode'
                )}
        </Button>
      </div>
      {isGitTarget && showInitializeGitOption ? (
        <div className="mt-2 space-y-1.5">
          {initializeGitRequired && !initializeGit ? (
            <p className="text-[11px] leading-4 text-destructive">
              {translate(
                'auto.components.new.workspace.FolderProjectGitWorktreePrompt.initializeGitRequired',
                'This folder is not a Git repository. Check Initialize Git here, then switch again.'
              )}
            </p>
          ) : null}
          <Label className="flex cursor-pointer items-start gap-2 text-xs font-normal">
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
      ) : null}
    </div>
  )
}
