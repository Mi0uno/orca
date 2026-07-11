# Fork Development and Release Workflow

This document captures the maintainer workflow for the `Mi0uno/orca` fork. It is
separate from the upstream contributor release notes in `.github/CONTRIBUTING.md`
because this fork intentionally ships a Windows-first updater channel.

## Repository Topology

- `origin`: `https://github.com/Mi0uno/orca.git`
- `upstream`: `https://github.com/stablyai/orca.git`
- Development happens on the fork's `main` branch after syncing any release
  commits that GitHub Actions generated.

Always sync `origin/main` first. The release workflow can fast-forward `main`
with a `release: vX.Y.Z...` version-bump commit when the release `ref` is the
tip of `main`.

```powershell
git fetch origin main --tags
git pull --rebase origin main
```

## Pulling Official Updates

Use a normal rebase of fork work on top of upstream. Resolve conflicts by
preserving fork-specific release and updater behavior unless the upstream change
explicitly replaces it.

```powershell
git fetch upstream main
git rebase upstream/main
pnpm run typecheck:web
git push origin main
```

If the rebase includes risky renderer, Git, terminal, updater, or release
changes, run the focused test files for the touched area before pushing.

## Local Development

Use Node 24, matching `package.json`:

```powershell
node --version
pnpm install
pnpm dev
```

For UI debugging with browser automation, run the dev app with a remote debugging
port:

```powershell
pnpm dev --remote-debugging-port=9335
```

Use focused verification while iterating:

```powershell
pnpm exec vitest run --config config/vitest.config.ts <test-file>
pnpm exec oxlint <changed-file>
pnpm run typecheck:web
```

For broad release-sensitive changes, use the wider checks that match the touched
surface:

```powershell
pnpm test
pnpm run typecheck
pnpm run build:win
```

## Commit and Push

Keep fork feature commits separate from release commits. Before committing:

```powershell
git status --short
git diff --check
```

Then commit and push:

```powershell
git add <changed-files>
git commit -m "<area>: <summary>"
git push origin main
```

A plain push does not publish a release. The release workflow is manually
dispatched.

## Windows-First Release

Cut RC releases from GitHub Actions or `gh`:

```powershell
gh workflow run release-cut.yml --repo Mi0uno/orca -f kind=rc -f ref=main -f dry_run=false
```

`release-cut.yml` is `workflow_dispatch`-driven. It computes the next version,
updates `package.json`, creates the tag, and publishes release assets. When the
release `ref` is the current tip of `main`, it also pushes the version-bump
commit back to `main`.

After the workflow starts or finishes, sync the generated release commit:

```powershell
git fetch origin main --tags
git pull --rebase origin main
```

Fork release behavior differs from the official repository:

- `release-cut.yml` allows release cuts for `Mi0uno/orca` and `stablyai/orca`.
- In this fork, `ORCA_REQUIRED_RELEASE_PLATFORMS` resolves to `windows`; the
  official repository requires all platforms.
- Non-Windows release builds and some release-evidence jobs are best-effort in
  the fork, so a macOS or Linux failure should not block a Windows installer
  release.
- If SignPath or Slack secrets are absent, fork CI publishes unsigned Windows
  artifacts and the packager avoids embedding the official SignPath publisher
  requirement.
- `homebrew-bump.yml` targets `stablyai/homebrew-orca` through the
  `BUFO_BOT_PRIVATE_KEY` GitHub App secret. Fork runs can fail there after the
  GitHub Release has already been published.

Verify the published release before treating the run as successful:

```powershell
gh release view v0.0.1-rc.6 --repo Mi0uno/orca --json tagName,isDraft,isPrerelease,url,assets
```

The Windows updater channel needs at least these assets:

- `latest.yml`
- `orca-windows-setup.exe`
- `orca-windows-setup.exe.blockmap`

## Updater Channel

The fork is configured to check `Mi0uno/orca` releases:

- `src/main/updater-prerelease-feed.ts` reads release feed and manifests from
  `https://github.com/Mi0uno/orca`.
- `config/dev-app-update.yml` points dev updater metadata at `Mi0uno/orca`.
- `config/electron-builder.config.cjs` publishes to `ORCA_RELEASE_OWNER` /
  `ORCA_RELEASE_REPO`, then `GITHUB_REPOSITORY`, then falls back to
  `Mi0uno/orca`.

Packaged builds only auto-update when the relevant release manifest and
referenced installer asset are present on GitHub. If a release action is red but
the GitHub Release is public and the Windows manifest plus installer assets are
present, the Windows update channel can still be valid; inspect the failed job to
distinguish a post-publish Homebrew failure from a missing installer.
