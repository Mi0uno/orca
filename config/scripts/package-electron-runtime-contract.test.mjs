import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const {
  createPackagedRuntimeNodeModuleResources,
  isPackagedExternalSpecifier
} = require('../packaged-runtime-node-modules.cjs')
const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))

describe('Electron runtime package contract', () => {
  it('keeps shared WebGL atlas invalidation reproducible from vendored source', () => {
    const patch = readFileSync(
      join(projectDir, 'config/patches/@xterm__addon-webgl@0.20.0-beta.286.patch'),
      'utf8'
    )

    expect(patch).toContain('diff --git a/src/Types.ts b/src/Types.ts')
    expect(patch).toContain('readonly clearModelGeneration: number')
    expect(patch).toContain('const generation = this._atlas.clearModelGeneration')
    expect(patch).toContain('this.clearModelGeneration++')
    expect(patch).toContain('this._atlas._clearModelGeneration||0')
  })

  it('keeps root postinstall as the single Electron binary install owner', () => {
    expect(packageJson.scripts.postinstall).toBe('node config/scripts/rebuild-native-deps.mjs')
    expect(packageJson.pnpm.onlyBuiltDependencies).not.toContain('electron')
  })

  it('treats Electron-only Node builtins as packaged builtins', () => {
    expect(isPackagedExternalSpecifier('node:sqlite')).toBe(false)
  })

  it('keeps the native Windows registry addon optional and platform-gated', () => {
    const rebuildScript = readFileSync(
      join(projectDir, 'config/scripts/rebuild-native-deps.mjs'),
      'utf8'
    )
    const ensureScript = readFileSync(
      join(projectDir, 'config/scripts/ensure-native-runtime.mjs'),
      'utf8'
    )
    expect(packageJson.optionalDependencies['windows-native-registry']).toBe('3.2.2')
    // Why: pnpm installs optional target architectures on every host; the root
    // Windows-only rebuild owns this addon so macOS/Linux never run node-gyp for it.
    expect(packageJson.pnpm.onlyBuiltDependencies).not.toContain('windows-native-registry')
    expect(rebuildScript).toContain(
      "rebuildPlatform === 'win32' ? ['windows-native-registry'] : []"
    )
    expect(ensureScript).toContain(
      "process.platform === 'win32' ? ['windows-native-registry'] : []"
    )
    const packageTargets = {
      win32: createPackagedRuntimeNodeModuleResources('win32'),
      darwin: createPackagedRuntimeNodeModuleResources('darwin'),
      linux: createPackagedRuntimeNodeModuleResources('linux')
    }
    expect(packageTargets.win32).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: join('node_modules', 'windows-native-registry') }),
        expect.objectContaining({ to: join('node_modules', 'node-addon-api') })
      ])
    )
    for (const platform of ['darwin', 'linux']) {
      expect(packageTargets[platform]).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: join('node_modules', 'windows-native-registry') })
        ])
      )
    }
  })

  it('guards package scripts that launch Electron tooling', () => {
    const scripts = packageJson.scripts
    const guardedScripts = [
      'start',
      'dev',
      'dev-stable-name',
      'build:unpack',
      'build:win',
      'build:mac',
      'build:mac:release',
      'build:linux',
      'test:e2e',
      'test:e2e:terminal-rendering-golden',
      'test:e2e:terminal-rendering-release-evidence',
      'test:e2e:headful'
    ]

    for (const scriptName of guardedScripts) {
      expect(scripts[scriptName], scriptName).toContain('pnpm run ensure:electron-runtime &&')
    }
  })

  it('keeps Windows and Linux package builds off the macOS native helper build', () => {
    const scripts = packageJson.scripts

    expect(scripts['build:desktop']).not.toContain('build:computer-macos')
    expect(scripts['build:win']).toContain('pnpm run build:desktop')
    expect(scripts['build:win']).not.toContain('pnpm run build ')
    expect(scripts['build:win']).not.toContain('build:computer-macos')
    expect(scripts['build:linux']).toContain('pnpm run build:desktop')
    expect(scripts['build:linux']).not.toContain('pnpm run build ')
    expect(scripts['build:linux']).not.toContain('build:computer-macos')
    expect(scripts['build:mac']).toContain('pnpm run build:computer-macos')
    expect(scripts['build:release']).toContain('pnpm run build:native')
    expect(scripts['build:release']).not.toContain('build:computer-macos')
  })

  it('runs the web build through the heap-sized Vite wrapper', () => {
    expect(packageJson.scripts['build:web']).toContain('node config/scripts/run-vite-web-build.mjs')
    expect(packageJson.scripts['build:web']).toContain('node config/scripts/verify-web-build.mjs')
  })

  it('guards release publishing before electron-builder runs', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const macWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-mac-build.yml'), 'utf8')
    )
    const releaseCommands = new Map(
      parsedWorkflow.jobs.build.strategy.matrix.include.map(({ platform, release_command }) => [
        platform,
        release_command
      ])
    )
    const macReleaseCommands = macWorkflow.jobs['build-mac'].steps
      .filter((step) => step.name?.includes('release artifacts (macOS)'))
      .map((step) => step.with.command)

    expect([...releaseCommands.keys()].sort()).toEqual(['linux-arm64', 'linux-x64', 'win'])
    expect(macReleaseCommands).toHaveLength(2)
    for (const command of [...releaseCommands.values(), ...macReleaseCommands]) {
      expect(command).toContain('node config/scripts/ensure-native-runtime.mjs --runtime=electron')
      expect(command).toContain('electron-builder')
      expect(command.indexOf('ensure-native-runtime')).toBeLessThan(
        command.indexOf('electron-builder')
      )
    }
    expect(macReleaseCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(' && ORCA_MAC_RELEASE=1 '),
        expect.stringContaining('CSC_IDENTITY_AUTO_DISCOVERY=false')
      ])
    )
    expect(releaseCommands.get('linux-x64')).toContain(' && pnpm exec electron-builder ')
    expect(releaseCommands.get('linux-x64')).toContain('--linux AppImage deb rpm --x64')
    expect(releaseCommands.get('linux-arm64')).toContain('ORCA_LINUX_ARM64_RELEASE=1')
    expect(releaseCommands.get('linux-arm64')).toContain('--linux AppImage deb rpm --arm64')
    expect(releaseCommands.get('win')).toContain(
      '; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm exec electron-builder '
    )
  })

  it('blocks Linux and macOS release packaging on watcher process fault recovery', () => {
    const releaseWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const macWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-mac-build.yml'), 'utf8')
    )
    const assertFaultGate = (steps, publishStepName, expectedCondition) => {
      const names = steps.map((step) => step.name)
      const gate = steps.find((step) => step.name === 'Gate runtime file-watcher process isolation')
      const publishIndexes = names
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => name?.includes(publishStepName))
        .map(({ index }) => index)

      expect(gate.if).toBe(expectedCondition)
      expect(gate['continue-on-error']).toBeUndefined()
      expect(gate.run).toContain('node config/scripts/runtime-file-watcher-fault-harness.mjs')
      expect(gate.run).toContain('ELECTRON_RUN_AS_NODE=1 pnpm exec electron')
      expect(names.indexOf('Build app')).toBeLessThan(names.indexOf(gate.name))
      expect(publishIndexes.length).toBeGreaterThan(0)
      for (const publishIndex of publishIndexes) {
        expect(names.indexOf(gate.name)).toBeLessThan(publishIndex)
      }
    }

    assertFaultGate(
      releaseWorkflow.jobs.build.steps,
      'Publish release artifacts (Linux)',
      "runner.os == 'Linux'"
    )
    assertFaultGate(macWorkflow.jobs['build-mac'].steps, 'release artifacts (macOS)', undefined)
  })

  it('packages and release-gates the SSH relay watcher child', () => {
    const relayBuild = readFileSync(join(projectDir, 'config/scripts/build-relay.mjs'), 'utf8')
    const builderConfig = readFileSync(
      join(projectDir, 'config/electron-builder.config.cjs'),
      'utf8'
    )
    const remoteCommands = readFileSync(
      join(projectDir, 'src/main/ssh/ssh-remote-commands.ts'),
      'utf8'
    )
    const releaseWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const macWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-mac-build.yml'), 'utf8')
    )

    expect(relayBuild).toContain("'parcel-watcher-process-entry.ts'")
    expect(relayBuild).toContain("outfile: join(outDir, 'relay-watcher.js')")
    expect(relayBuild).toContain("readFileSync(join(outDir, 'relay-watcher.js'))")
    expect(builderConfig).toContain("from: 'out/relay'")
    expect(remoteCommands).toContain("joinRemotePath(host, remoteRelayDir, 'relay-watcher.js')")

    const assertRelayGate = (steps, publishStepName) => {
      const names = steps.map((step) => step.name)
      const gate = steps.find((step) => step.name === 'Gate SSH relay watcher process isolation')
      const publishIndexes = names
        .map((name, index) => ({ name, index }))
        .filter(({ name }) => name?.includes(publishStepName))
        .map(({ index }) => index)
      expect(gate['continue-on-error']).toBeUndefined()
      expect(gate.run).toContain('node config/scripts/relay-watcher-fault-harness.mjs')
      expect(names.indexOf('Build app')).toBeLessThan(names.indexOf(gate.name))
      expect(publishIndexes.length).toBeGreaterThan(0)
      for (const publishIndex of publishIndexes) {
        expect(names.indexOf(gate.name)).toBeLessThan(publishIndex)
      }
    }

    assertRelayGate(releaseWorkflow.jobs.build.steps, 'Publish release artifacts (Linux)')
    assertRelayGate(macWorkflow.jobs['build-mac'].steps, 'release artifacts (macOS)')
    const releaseNames = releaseWorkflow.jobs.build.steps.map((step) => step.name)
    expect(releaseNames.indexOf('Gate SSH relay watcher process isolation')).toBeLessThan(
      releaseNames.indexOf('Build Windows release artifacts')
    )
  })

  it('packages and verifies the Windows SSH node-pty console-list fallback', () => {
    const relayBuild = readFileSync(join(projectDir, 'config/scripts/build-relay.mjs'), 'utf8')
    const relayDeploy = readFileSync(join(projectDir, 'src/main/ssh/ssh-relay-deploy.ts'), 'utf8')
    const patchAsset = readFileSync(
      join(projectDir, 'config/relay-assets/node-pty-1.1.0-console-list-agent-patch.cjs'),
      'utf8'
    )

    expect(relayBuild).toContain('copyFileSync(')
    expect(relayBuild).toContain('hash.update(readFileSync')
    expect(relayBuild).toContain('node-pty-1.1.0-console-list-agent-patch.cjs')
    expect(relayDeploy).toContain('assertPatchedNodePtyConsoleListAgent')
    expect(relayDeploy.match(/\$\{windowsNodePtyPatchCommand\(nodePath\)\}/g)).toHaveLength(2)
    expect(patchAsset).toContain('consoleProcessList = [shellPid];')
    expect(patchAsset).toContain('packageJson.version !== EXPECTED_NODE_PTY_VERSION')
  })

  it('pins the Windows release builder to the VS 2022 runner image', () => {
    const releaseWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const windowsReleaseEntry = releaseWorkflow.jobs.build.strategy.matrix.include.find(
      ({ platform }) => platform === 'win'
    )

    expect(windowsReleaseEntry.os).toBe('windows-2022')
  })

  it('keeps release-cut signing provenance on GitHub-hosted runners', () => {
    const releaseWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const buildMatrixRunners = releaseWorkflow.jobs.build.strategy.matrix.include.map(
      ({ os }) => os
    )
    const releaseWorkflowText = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const macDispatchStep = releaseWorkflow.jobs['build-mac'].steps.find(
      (step) => step.name === 'Run isolated macOS release build'
    )

    expect(releaseWorkflowText).not.toContain('blacksmith-')
    expect(releaseWorkflow.jobs['build-mac']['runs-on']).toBe('ubuntu-latest')
    expect(releaseWorkflow.jobs['build-mac'].permissions.actions).toBe('write')
    expect(macDispatchStep.run).toBe('node config/scripts/run-release-mac-build-workflow.mjs')
    expect(macDispatchStep.env.RELEASE_MAC_BUILD_WORKFLOW).toBe('release-mac-build.yml')
    expect(macDispatchStep.env.RELEASE_MAC_BUILD_TAG).toBe('${{ needs.cut.outputs.tag }}')
    expect(buildMatrixRunners).not.toContain('blacksmith-6vcpu-macos-15')
    expect(releaseWorkflow.jobs['publish-release'].needs).toContain('build')
    expect(releaseWorkflow.jobs['publish-release'].needs).toContain('build-mac')
    expect(releaseWorkflow.jobs.build['continue-on-error']).toBe(
      "${{ github.repository != 'stablyai/orca' && matrix.platform != 'win' }}"
    )
    expect(releaseWorkflow.jobs['build-mac']['continue-on-error']).toBe(
      "${{ github.repository != 'stablyai/orca' }}"
    )
  })

  it('runs the macOS release build in an isolated Blacksmith workflow', () => {
    const releaseMacWorkflowText = readFileSync(
      join(projectDir, '.github/workflows/release-mac-build.yml'),
      'utf8'
    )
    const releaseMacWorkflow = parse(releaseMacWorkflowText)
    const buildMacJob = releaseMacWorkflow.jobs['build-mac']
    const checkoutStep = buildMacJob.steps.find((step) => step.name === 'Checkout')
    const signedPublishStep = buildMacJob.steps.find(
      (step) => step.name === 'Publish signed release artifacts (macOS)'
    )
    const unsignedPublishStep = buildMacJob.steps.find(
      (step) => step.name === 'Publish unsigned release artifacts (macOS)'
    )

    expect(releaseMacWorkflow['run-name']).toBe(
      'Mac release build ${{ inputs.tag }} (${{ inputs.release_run_id }})'
    )
    expect(releaseMacWorkflow.on.workflow_dispatch.inputs.tag.required).toBe(true)
    expect(releaseMacWorkflow.on.workflow_dispatch.inputs.release_run_id.required).toBe(true)
    expect(buildMacJob['runs-on']).toBe(
      "${{ github.repository == 'stablyai/orca' && 'blacksmith-6vcpu-macos-15' || 'macos-15' }}"
    )
    expect(checkoutStep.with.ref).toBe('refs/tags/${{ inputs.tag }}')
    expect(signedPublishStep.with.command).toContain('ORCA_MAC_RELEASE=1')
    expect(signedPublishStep.with.command).toContain('electron-builder')
    expect(signedPublishStep.with.command).toContain('--mac --publish always')
    expect(unsignedPublishStep.with.command).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
    expect(unsignedPublishStep.with.command).toContain('--mac --publish always')
    expect(releaseMacWorkflowText).not.toContain('signpath/')
    expect(releaseMacWorkflowText).not.toContain('SIGNPATH_')
  })

  it('preflights SignPath module install before Windows signing side effects', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const steps = parsedWorkflow.jobs.build.steps
    const stepNames = steps.map((step) => step.name)
    const installStepIndexes = stepNames.flatMap((name, index) =>
      name === 'Install SignPath PowerShell module' ? [index] : []
    )
    const buildIndex = stepNames.indexOf('Build Windows release artifacts')
    const verifyNodePtyIndex = stepNames.indexOf('Verify Windows node-pty ConPTY runtime')
    const resolveSigningIndex = stepNames.indexOf('Resolve Windows signing mode')
    const uploadIndex = stepNames.indexOf('Upload unsigned Windows installer for SignPath')
    const downloadIndex = stepNames.indexOf('Download signed Windows installer from SignPath')

    expect(verifyNodePtyIndex).toBe(buildIndex + 1)
    expect(resolveSigningIndex).toBe(verifyNodePtyIndex + 1)
    expect(installStepIndexes).toEqual([resolveSigningIndex + 1])
    expect(installStepIndexes[0]).toBeLessThan(uploadIndex)

    expect(steps[verifyNodePtyIndex].run).toContain(
      'dist/win-unpacked/resources/node_modules/node-pty/build/Release'
    )
    expect(steps[verifyNodePtyIndex].run).toContain('conpty/conpty.dll')

    const uploadThroughDownloadScript = steps
      .slice(uploadIndex, downloadIndex + 1)
      .map((step) => step.run ?? '')
      .join('\n')

    expect(uploadThroughDownloadScript).not.toContain('Install-Module -Name SignPath')

    const installStep = steps[installStepIndexes[0]]
    const installRun = installStep.run
    const sleepSeconds = [...installRun.matchAll(/Start-Sleep -Seconds (\d+)/g)].map(
      ([, seconds]) => seconds
    )

    expect(installStep.if).toBe(
      "matrix.platform == 'win' && steps.windows-signing-mode.outputs.enabled == 'true'"
    )
    expect(installStep.shell).toBe('pwsh')
    expect(installRun).toContain(
      'if ($null -eq (Get-PSRepository -Name PSGallery -ErrorAction SilentlyContinue))'
    )
    expect(installRun).toContain('Register-PSRepository -Default -InstallationPolicy Trusted')
    expect(installRun).toContain('Set-PSRepository -Name PSGallery -InstallationPolicy Trusted')
    expect(installRun).toMatch(/\$env:PSModulePath -split \[System\.IO\.Path\]::PathSeparator/)
    expect(installRun).toContain(
      "$signPathModulePath = Join-Path -Path $currentUserModuleRoot -ChildPath 'SignPath'"
    )
    expect(installRun).toMatch(/for \(\$attempt = 1; \$attempt -le 3; \$attempt\+\+\)/)
    expect(sleepSeconds).toEqual(['15', '30'])
    expect(installRun).toContain(
      'Install-Module -Name SignPath -Repository PSGallery -MinimumVersion 4.0.0 -MaximumVersion 4.999.999 -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop'
    )
    expect(installRun).toContain('Import-Module SignPath')
    expect(installRun).toContain(
      'Get-Command -Name Get-SignedArtifact -Module SignPath -ErrorAction Stop'
    )
    expect(installRun).toContain('Remove-Item -LiteralPath $signPathModulePath -Recurse -Force')
    expect(installRun).not.toContain('SignPath*')
    expect(installRun.indexOf('if ($attempt -eq 3)')).toBeLessThan(
      installRun.indexOf('Remove-Item -LiteralPath $signPathModulePath')
    )
    expect(installRun).toMatch(/if \(\$attempt -eq 3\) {\s+throw\s+}/)
    expect(installRun).not.toMatch(/throw\s+\$_/)
  })

  it('verifies Windows inner binary signatures fail-open before publishing', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const steps = parsedWorkflow.jobs.build.steps
    const stepNames = steps.map((step) => step.name)
    const outerVerifyIndex = stepNames.indexOf('Verify signed Windows installer')
    const innerVerifyIndex = stepNames.indexOf('Verify Windows inner binary signatures')
    const unsignedVerifyIndex = stepNames.indexOf('Verify unsigned Windows release assets')
    const evidenceIndex = stepNames.indexOf('Upload Windows inner signing evidence')
    const publishIndex = stepNames.indexOf('Publish Windows release artifacts')

    expect(outerVerifyIndex).toBeGreaterThan(-1)
    expect(innerVerifyIndex).toBe(outerVerifyIndex + 1)
    expect(unsignedVerifyIndex).toBe(innerVerifyIndex + 1)
    expect(evidenceIndex).toBe(unsignedVerifyIndex + 1)
    expect(publishIndex).toBe(evidenceIndex + 1)

    // Why fail-open: unsigned inner binaries must warn, not block, until the
    // flow is proven on a real release (issue #7785). Flip this to 'true'
    // together with the workflow env to make the gate required.
    expect(steps[innerVerifyIndex].env.ORCA_WINDOWS_INNER_SIGNATURE_REQUIRED).toBe('false')

    // Why: every step in the inner-signing chain must be unable to fail the
    // release — a SignPath outage or timeout falls through to today's
    // unsigned-inner flow instead of blocking the cut.
    const innerChainStepNames = [
      'Stage unsigned inner PE files for signing',
      'Upload unsigned inner binaries for SignPath',
      'Submit inner binaries signing request',
      'Notify Slack that inner-binary signing is waiting for approval',
      'Download signed inner binaries from SignPath',
      'Restore signed inner binaries into unpacked app',
      'Replace cached elevate.exe with the signed copy',
      'Rebuild NSIS installer from signed unpacked app'
    ]
    for (const stepName of innerChainStepNames) {
      const step = steps[stepNames.indexOf(stepName)]
      expect(step, stepName).toBeDefined()
      expect(step['continue-on-error'], stepName).toBe(true)
    }
  })

  it('publishes both Linux release matrix entries', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const publishLinuxStep = parsedWorkflow.jobs.build.steps.find(
      (step) => step.name === 'Publish release artifacts (Linux)'
    )

    expect(publishLinuxStep.if).toContain("matrix.platform == 'linux-x64'")
    expect(publishLinuxStep.if).toContain("matrix.platform == 'linux-arm64'")
    expect(publishLinuxStep.with.command).toBe('${{ matrix.release_command }}')
  })

  it('keeps Linux postinstall repairing Chromium sandbox permissions', () => {
    const afterInstallScript = readFileSync(
      join(projectDir, 'resources/linux/packaging/after-install.sh'),
      'utf8'
    )

    expect(afterInstallScript).toContain('chrome-sandbox')
    expect(afterInstallScript).toContain('chmod 4755 "$sandbox"')
    expect(afterInstallScript).not.toContain('chmod 0755 "$sandbox"')
  })

  it('keeps release-cut version commits skill-independent and taggable on retries', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const checkoutStep = parsedWorkflow.jobs.cut.steps.find((step) => step.name === 'Checkout ref')
    const bumpStep = parsedWorkflow.jobs.cut.steps.find(
      (step) => step.name === 'Bump package.json and tag'
    )

    const bumpIndex = bumpStep.run.indexOf(
      'npm version "$VERSION" --no-git-tag-version --allow-same-version'
    )
    const stageIndex = bumpStep.run.indexOf('git add package.json')
    expect(checkoutStep.with['fetch-depth']).toBe(0)
    expect(bumpIndex).toBeGreaterThanOrEqual(0)
    expect(stageIndex).toBeGreaterThan(bumpIndex)
    // Why: version-only cuts must not mutate content-addressed skill artifacts.
    expect(bumpStep.run).not.toContain('generate-skill-bundle-manifest')
    expect(bumpStep.run).not.toContain('resources/skills')
    expect(bumpStep.run).toContain('git diff --cached --quiet')
    expect(bumpStep.run).toContain('git commit --allow-empty -m "$commit_message"')
  })

  it('keeps release-cut RC retries monotonic across stale attempts', () => {
    const releaseWorkflow = readFileSync(
      join(projectDir, '.github/workflows/release-cut.yml'),
      'utf8'
    )
    const parsedWorkflow = parse(releaseWorkflow)
    const versionStep = parsedWorkflow.jobs.cut.steps.find(
      (step) => step.name === 'Compute next version'
    )

    expect(versionStep.run).toContain('node config/scripts/release-rc-history.mjs "$1"')
    expect(versionStep.run).toContain('tag_matches_current_ref')
    expect(versionStep.run).toContain('cutting the next version instead of reusing stale artifacts')
    expect(versionStep.run).toContain('git rev-parse "$existing_rc_tag"')
  })

  it('bumps separate Homebrew casks for stable and RC desktop tags', () => {
    const releaseWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )
    const homebrewWorkflow = parse(
      readFileSync(join(projectDir, '.github/workflows/homebrew-bump.yml'), 'utf8')
    )

    expect(releaseWorkflow.jobs['homebrew-bump'].if).toContain(
      "startsWith(needs.cut.outputs.tag, 'v')"
    )
    expect(releaseWorkflow.jobs['homebrew-bump'].if).not.toContain('-rc.')
    expect(releaseWorkflow.jobs['homebrew-bump-published-rc-draft'].with.tag).toBe(
      '${{ needs.cut.outputs.latest_published_rc_tag }}'
    )

    const resolveCaskStep = homebrewWorkflow.jobs['bump-cask'].steps.find(
      (step) => step.name === 'Resolve cask target'
    )
    const renderStep = homebrewWorkflow.jobs['bump-cask'].steps.find(
      (step) => step.name === 'Render updated cask file'
    )
    const copyStep = homebrewWorkflow.jobs['bump-cask'].steps.find(
      (step) => step.name === 'Copy cask into tap and open PR'
    )

    expect(resolveCaskStep.run).toContain('token="orca@rc"')
    expect(resolveCaskStep.run).toContain('token="orca"')
    expect(renderStep.env.CASK_PATH).toBe('${{ steps.cask.outputs.path }}')
    expect(copyStep.run).toContain('cp "$CASK_PATH" "tap/$CASK_PATH"')
    expect(copyStep.run).toContain('git add "$CASK_PATH"')
  })

  it('installs the Electron package binary in PR checks without changing native module ABI', () => {
    const prWorkflow = readFileSync(join(projectDir, '.github/workflows/pr.yml'), 'utf8')
    const parsedWorkflow = parse(prWorkflow)
    const installStep = parsedWorkflow.jobs.verify.steps.find(
      (step) => step.name === 'Install Electron package binary for tests'
    )

    expect(installStep.run).toBe('node config/scripts/install-electron-package-binary.mjs')
  })

  it('smokes the packaged CLI from outside the checkout in PR checks', () => {
    const prWorkflow = readFileSync(join(projectDir, '.github/workflows/pr.yml'), 'utf8')
    const parsedWorkflow = parse(prWorkflow)
    const smokeStep = parsedWorkflow.jobs.verify.steps.find(
      (step) => step.name === 'Smoke packaged CLI'
    )

    expect(smokeStep.run).toBe(
      'node config/scripts/smoke-packaged-cli.mjs --app-dir=dist/linux-unpacked'
    )
  })
})
