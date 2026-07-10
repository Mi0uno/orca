import { useId } from 'react'
import { Folder, GitBranch } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type AddRepoProjectKind = 'git' | 'folder'

type AddRepoProjectModeControlProps = {
  projectKind: AddRepoProjectKind
  initializeGitOnAdd: boolean
  disabled?: boolean
  showInitializeGit?: boolean
  workspaceDir?: string | null
  onProjectKindChange: (kind: AddRepoProjectKind) => void
  onInitializeGitOnAddChange: (enabled: boolean) => void
}

export function AddRepoProjectModeControl({
  projectKind,
  initializeGitOnAdd,
  disabled = false,
  showInitializeGit = true,
  workspaceDir = null,
  onProjectKindChange,
  onInitializeGitOnAddChange
}: AddRepoProjectModeControlProps): React.JSX.Element {
  const initializeCheckboxId = useId()
  const initializeDisabled = disabled || projectKind !== 'git'
  const gitDescription = workspaceDir
    ? translate(
        'auto.components.sidebar.AddRepoProjectModeControl.gitDescriptionWithPath',
        'Worktrees will be created in {{workspaceDir}}.',
        { workspaceDir }
      )
    : translate(
        'auto.components.sidebar.AddRepoProjectModeControl.gitDescription',
        'Branch worktrees are created in this project directory.'
      )

  return (
    <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.sidebar.AddRepoProjectModeControl.modeLabel', 'Project mode')}
        </p>
        <ToggleGroup
          type="single"
          value={projectKind}
          variant="outline"
          size="sm"
          disabled={disabled}
          className="grid w-full grid-cols-2 overflow-hidden border border-border bg-background"
          onValueChange={(value) => {
            if (value === 'git' || value === 'folder') {
              onProjectKindChange(value)
            }
          }}
        >
          <ToggleGroupItem
            value="git"
            className="h-8 w-full justify-center gap-1.5 border-0 bg-background data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-ring dark:data-[state=on]:bg-accent dark:data-[state=on]:text-accent-foreground"
          >
            <GitBranch className="size-3.5" />
            {translate(
              'auto.components.sidebar.AddRepoProjectModeControl.gitBranches',
              'Git branches'
            )}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="folder"
            className="h-8 w-full justify-center gap-1.5 border-0 bg-background data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-ring dark:data-[state=on]:bg-accent dark:data-[state=on]:text-accent-foreground"
          >
            <Folder className="size-3.5" />
            {translate('auto.components.sidebar.AddRepoProjectModeControl.folder', 'Folder')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] leading-4 text-muted-foreground">
        <p className="break-words" title={workspaceDir ?? undefined}>
          {gitDescription}
        </p>
        <p>
          {translate(
            'auto.components.sidebar.AddRepoProjectModeControl.folderDescription',
            'Opens the selected path directly.'
          )}
        </p>
      </div>

      {showInitializeGit ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs',
            initializeDisabled ? 'text-muted-foreground opacity-60' : 'text-foreground'
          )}
        >
          <Checkbox
            id={initializeCheckboxId}
            className="mt-0.5"
            checked={initializeGitOnAdd}
            disabled={initializeDisabled}
            onCheckedChange={(checked) => onInitializeGitOnAddChange(checked === true)}
          />
          <Label
            htmlFor={initializeCheckboxId}
            className="min-w-0 flex-1 cursor-pointer text-xs font-normal leading-normal"
          >
            <span className="block font-medium">
              {translate(
                'auto.components.sidebar.AddRepoProjectModeControl.initializeGit',
                'Initialize Git here'
              )}
            </span>
            <span className="block text-[11px] leading-4 text-muted-foreground">
              {translate(
                'auto.components.sidebar.AddRepoProjectModeControl.initializeGitDescription',
                'Use the selected folder as its own repository.'
              )}
            </span>
          </Label>
        </div>
      ) : null}
    </div>
  )
}
