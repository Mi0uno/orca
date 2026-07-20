export function shouldAutoCreateInitialTerminal(
  renderableTabCount: number,
  initialTerminalAlreadyApplied: boolean
): boolean {
  // Why: only a never-seeded empty worktree needs a fallback; the persisted guard preserves deliberate last-tab closure.
  return renderableTabCount === 0 && !initialTerminalAlreadyApplied
}
