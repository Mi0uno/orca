import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../shared/pairing'
import { listEphemeralVmRuntimes } from '../shared/ephemeral-vm-runtime-store'
import {
  cleanupEphemeralVmRuntime,
  provisionEphemeralVmRuntime
} from './ephemeral-vm-runtime-service'
import type { OrcaVmRecipe } from '../shared/types'

vi.mock('../shared/secure-file', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  const writeSecureFile = vi.fn((targetPath: string, contents: string) => {
    mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
    writeFileSync(targetPath, contents, { encoding: 'utf-8', mode: 0o600 })
  })
  return {
    hardenExistingSecureFile: vi.fn(),
    hardenSecurePath: vi.fn(),
    writeSecureFile,
    writeSecureJsonFile: vi.fn((targetPath: string, value: unknown) => {
      writeSecureFile(targetPath, JSON.stringify(value, null, 2))
    })
  }
})

const tempDirs: string[] = []

afterEach(() => {
  for (const root of tempDirs.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function makePairingCode(): string {
  return encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint: 'wss://sandbox.example.com',
    deviceToken: 'token',
    publicKeyB64: 'public-key'
  })
}

function nodeCommand(scriptPath: string): string {
  return `"${process.execPath}" "${scriptPath}"`
}

describe('ephemeral VM runtime service', () => {
  it('persists a successful recipe-created runtime and cleans it up', async () => {
    const userDataPath = makeDir('orca-ephemeral-vm-service-user-data-')
    const repoPath = makeDir('orca-ephemeral-vm-service-repo-')
    const startPath = join(repoPath, 'start.js')
    const cleanupPath = join(repoPath, 'cleanup.js')
    writeFileSync(
      startPath,
      [
        'console.log(JSON.stringify({',
        '  schemaVersion: 1,',
        `  pairingCode: ${JSON.stringify(makePairingCode())},`,
        "  projectRoot: '/workspace/repo',",
        '  userData: { providerResourceId: process.env.ORCA_VM_INSTANCE_ID }',
        '}))'
      ].join('\n')
    )
    writeFileSync(
      cleanupPath,
      [
        "let input = ''",
        "process.stdin.on('data', (chunk) => { input += chunk })",
        "process.stdin.on('end', () => {",
        '  const payload = JSON.parse(input)',
        '  if (payload.recipeResult.projectRoot !== "/workspace/repo") process.exit(12)',
        '  if (!payload.recipeResult.userData.providerResourceId) process.exit(13)',
        '  console.error(`cleanup:${payload.instanceId}`)',
        '})'
      ].join('\n')
    )
    const recipe: OrcaVmRecipe = {
      id: 'cloud-sandbox',
      name: 'Cloud Sandbox',
      create: nodeCommand(startPath),
      destroy: nodeCommand(cleanupPath)
    }

    const provisioned = await provisionEphemeralVmRuntime({
      userDataPath,
      repoPath,
      recipe,
      repoId: 'repo-1',
      projectId: 'project-1',
      workspaceName: 'Fix Login Race',
      now: 1_000
    })

    expect(provisioned.ok).toBe(true)
    if (!provisioned.ok) {
      throw new Error(provisioned.start.error)
    }
    expect(provisioned.runtime).toMatchObject({
      id: provisioned.start.context.instanceId,
      recipeId: 'cloud-sandbox',
      repoId: 'repo-1',
      projectId: 'project-1',
      workspaceName: 'Fix Login Race',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1_000,
      updatedAt: 1_000
    })
    expect(listEphemeralVmRuntimes(userDataPath)).toEqual([provisioned.runtime])

    const cleanup = await cleanupEphemeralVmRuntime({
      userDataPath,
      repoPath,
      recipe,
      runtimeId: provisioned.runtime.id,
      now: 2_000
    })

    expect(cleanup).toMatchObject({
      ok: true,
      skipped: false,
      runtime: {
        id: provisioned.runtime.id,
        status: 'cleaned',
        cleanupStatus: 'succeeded',
        cleanupLastAttemptAt: 2_000
      }
    })
  })

  it('does not persist a runtime when recipe output cannot be parsed', async () => {
    const userDataPath = makeDir('orca-ephemeral-vm-service-user-data-')
    const repoPath = makeDir('orca-ephemeral-vm-service-repo-')
    const startPath = join(repoPath, 'start.js')
    writeFileSync(startPath, "console.log('not json')\n")

    const provisioned = await provisionEphemeralVmRuntime({
      userDataPath,
      repoPath,
      recipe: {
        id: 'cloud-sandbox',
        name: 'Cloud Sandbox',
        create: nodeCommand(startPath)
      }
    })

    expect(provisioned).toMatchObject({
      ok: false,
      start: {
        error: 'Recipe stdout must be one JSON object.'
      }
    })
    expect(listEphemeralVmRuntimes(userDataPath)).toEqual([])
  })
})
