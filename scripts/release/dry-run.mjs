import { createPublishCommand } from './publish.mjs'
import { validateStagedPackage } from './stage-package.mjs'
import { assertAllowedBump, computeTargetVersion, readPackage, stripArgSeparator } from './version.mjs'
import { buildReleaseGatePlan } from './verify.mjs'

export function buildReleaseDryRunPlan(options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const bump = options.bump
  assertAllowedBump(bump)
  const pkg = readPackage(rootDir)
  const targetVersion = computeTargetVersion(pkg.version, bump)
  const publishCommand = createPublishCommand({ stagedDir: '.release/package' })
  return {
    dryRun: true,
    mutatesExternalState: false,
    writesFiles: false,
    package: pkg.name,
    currentVersion: pkg.version,
    targetVersion,
    releaseGatePlan: buildReleaseGatePlan(bump),
    localValidation: [
      `pnpm run release:stage -- --target-version ${targetVersion} --out .release/package`,
      `pnpm run release:verify -- --stage postbuild --target-version ${targetVersion} --staged-dir .release/package`,
    ],
    npm: {
      trustedPublishing: true,
      usesNpmToken: false,
      publishCommand: {
        package: pkg.name,
        command: `${publishCommand.command} ${publishCommand.args.join(' ')}`,
        cwd: publishCommand.cwd,
      },
    },
    compatibility: {
      peerDependency: '@vostride/agent-qa-core >=0.1.0',
    },
  }
}

export function parseDryRunArgs(argv = []) {
  const args = stripArgSeparator(argv)
  let bump
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--bump') {
      bump = args[index + 1]
      index += 1
    } else if (arg === '--json') {
      json = true
    } else {
      throw new Error(`invalid args: ${args.join(' ')}`)
    }
  }
  if (!bump) throw new Error('missing --bump')
  assertAllowedBump(bump)
  return { bump, json }
}

function renderText(plan) {
  return [
    'subscription-auth release dry-run',
    `Package: ${plan.package}`,
    `Target version: ${plan.targetVersion}`,
    'Mutates external state: no',
    `Publish command: ${plan.npm.publishCommand.command}`,
    `Publish cwd: ${plan.npm.publishCommand.cwd}`,
    `Compatibility: ${plan.compatibility.peerDependency}`,
    '',
  ].join('\n')
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseDryRunArgs(argv)
  const plan = buildReleaseDryRunPlan({ ...options, bump: parsed.bump })
  const output = options.output ?? process.stdout
  output.write?.(parsed.json ? `${JSON.stringify(plan, null, 2)}\n` : renderText(plan))
  return plan
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
