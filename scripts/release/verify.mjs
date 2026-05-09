import { execFileSync as defaultExecFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkGitTagAbsent as defaultCheckGitTagAbsent } from './git.mjs'
import { assertTrustedPublishEnvironment as defaultAssertTrustedPublishEnvironment } from './publish.mjs'
import { checkNpmVersionAbsent as defaultCheckNpmVersionAbsent } from './registry.mjs'
import { validateStagedPackage as defaultValidateStagedPackage } from './stage-package.mjs'
import { assertAllowedBump, assertAllowedTargetVersion, computeTargetVersion, readPackage, stripArgSeparator } from './version.mjs'

export function buildReleaseGatePlan(bump) {
  assertAllowedBump(bump)
  return [
    'pnpm install --frozen-lockfile',
    'release preflight',
    'write package version',
    'pnpm test',
    'pnpm typecheck',
    'pnpm build',
    'stage package',
    'release postbuild verification',
    'create release commit and tag',
    'git push',
    'npm publish',
  ]
}

export function validateStagedPackDryRun(options = {}) {
  const stagedDir = options.stagedDir
  const targetVersion = options.targetVersion
  const execFileSync = options.execFileSync ?? defaultExecFileSync
  defaultValidateStagedPackage({ stagedDir, targetVersion })
  const npmCache = mkdtempSync(join(tmpdir(), 'subscription-auth-pack-cache-'))
  try {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: stagedDir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_cache: npmCache,
      },
    })
    const parsed = JSON.parse(output)
    const files = parsed[0]?.files?.map(file => file.path) ?? []
    for (const file of ['package.json', 'README.md', 'LICENSE.md', 'NOTICE.md', 'dist/index.js']) {
      if (!files.includes(file)) throw new Error(`npm pack must include ${file}`)
    }
  } finally {
    rmSync(npmCache, { recursive: true, force: true })
  }
}

export async function runReleaseVerification(options = {}) {
  const stage = options.stage
  const rootDir = options.rootDir ?? process.cwd()
  if (stage === 'preflight') {
    const bump = options.bump
    const pkg = options.readPackage?.() ?? readPackage(rootDir)
    const targetVersion = options.targetVersion
      ? assertAllowedTargetVersion(options.targetVersion)
      : computeTargetVersion(pkg.version, bump)
    if (!options.allowExistingTag) {
      await (options.checkGitTagAbsent ?? defaultCheckGitTagAbsent)(targetVersion, options)
    }
    await (options.checkNpmVersionAbsent ?? defaultCheckNpmVersionAbsent)(pkg.name, targetVersion, options)
    return { targetVersion }
  }
  if (stage === 'postbuild') {
    const targetVersion = options.targetVersion
    const stagedDir = options.stagedDir
    if (!targetVersion) throw new Error('missing postbuild --target-version')
    if (!stagedDir) throw new Error('missing postbuild --staged-dir')
    ;(options.validateStagedPackage ?? defaultValidateStagedPackage)({ stagedDir, targetVersion })
    ;(options.validateStagedPackDryRun ?? validateStagedPackDryRun)({
      stagedDir,
      targetVersion,
      execFileSync: options.execFileSync,
    })
    const env = options.env ?? process.env
    const shouldCheckTrustedPublishing = Boolean(options.assertTrustedPublishEnvironment) || env.GITHUB_ACTIONS === 'true'
    if (shouldCheckTrustedPublishing) {
      ;(options.assertTrustedPublishEnvironment ?? defaultAssertTrustedPublishEnvironment)({
        env,
        npmVersion: options.npmVersion ?? (options.execFileSync ?? defaultExecFileSync)('npm', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim(),
      })
    }
    return { targetVersion, stagedDir }
  }
  throw new Error(`invalid args: --stage ${stage}`)
}

export function parseVerifyArgs(argv = []) {
  const args = stripArgSeparator(argv)
  let bump
  let stage
  let targetVersion
  let stagedDir
  let allowExistingTag = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--bump') {
      bump = args[index + 1]
      index += 1
    } else if (arg === '--target-version') {
      targetVersion = args[index + 1]
      index += 1
    } else if (arg === '--stage') {
      stage = args[index + 1]
      index += 1
    } else if (arg === '--staged-dir') {
      stagedDir = args[index + 1]
      index += 1
    } else if (arg === '--allow-existing-tag') {
      allowExistingTag = true
    } else {
      throw new Error(`invalid args: ${args.join(' ')}`)
    }
  }
  if (stage === 'preflight') {
    if (bump && targetVersion) throw new Error('use either --bump or --target-version, not both')
    if (!bump && !targetVersion) throw new Error('missing --bump or --target-version')
    if (bump) assertAllowedBump(bump)
    if (targetVersion) assertAllowedTargetVersion(targetVersion)
    if (allowExistingTag && !targetVersion) throw new Error('--allow-existing-tag requires --target-version')
    return { ...(bump ? { bump } : {}), ...(targetVersion ? { targetVersion } : {}), ...(allowExistingTag ? { allowExistingTag } : {}), stage }
  }
  if (stage === 'postbuild') {
    if (!targetVersion) throw new Error('missing --target-version')
    if (!stagedDir) throw new Error('missing --staged-dir')
    return { stage, targetVersion, stagedDir }
  }
  throw new Error(`invalid args: --stage ${stage}`)
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseVerifyArgs(argv)
  return runReleaseVerification({ ...options, ...parsed })
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
