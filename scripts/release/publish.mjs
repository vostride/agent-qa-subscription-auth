import { execFileSync as defaultExecFileSync } from 'node:child_process'
import { stripArgSeparator } from './version.mjs'

function parseNpmVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? ''))
  return match ? match.slice(1).map(Number) : null
}

function npmVersionGte(value, minimum) {
  const current = parseNpmVersion(value)
  const min = parseNpmVersion(minimum)
  if (!current || !min) return false
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > min[index]) return true
    if (current[index] < min[index]) return false
  }
  return true
}

export function assertTrustedPublishEnvironment(options = {}) {
  const env = options.env ?? process.env
  const npmVersion = options.npmVersion
  if (env.NPM_TOKEN) throw new Error('NPM_TOKEN is not allowed for trusted publishing')
  if (env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions trusted publishing environment is required')
  if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('ACTIONS_ID_TOKEN_REQUEST_TOKEN is required for npm trusted publishing')
  if (!npmVersionGte(npmVersion, '11.5.1')) throw new Error('npm CLI >=11.5.1 is required for trusted publishing')
}

export function createPublishCommand(options = {}) {
  const stagedDir = options.stagedDir ?? '.release/package'
  return {
    package: '@vostride/agent-qa-subscription-auth',
    command: 'npm',
    args: ['publish', '--access', 'public'],
    cwd: stagedDir,
  }
}

function readNpmVersion(execFileSync) {
  return execFileSync('npm', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim()
}

export async function publishPackage(options = {}) {
  const execFileSync = options.execFileSync ?? defaultExecFileSync
  const env = options.env ?? process.env
  const npmVersion = options.npmVersion ?? readNpmVersion(execFileSync)
  assertTrustedPublishEnvironment({ env, npmVersion })
  const command = createPublishCommand({ stagedDir: options.stagedDir })
  const publishEnv = { ...env }
  delete publishEnv.NPM_CONFIG_PROVENANCE
  execFileSync(command.command, command.args, {
    cwd: command.cwd,
    env: publishEnv,
    stdio: options.stdio ?? 'inherit',
  })
  return command
}

export function parsePublishArgs(argv = []) {
  const args = stripArgSeparator(argv)
  if (args.length === 0) throw new Error('missing --staged-dir')
  if (args.length !== 2 || args[0] !== '--staged-dir' || !args[1]) {
    throw new Error('invalid args: node scripts/release/publish.mjs --staged-dir .release/package')
  }
  return { stagedDir: args[1] }
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parsePublishArgs(argv)
  return publishPackage({ ...options, stagedDir: parsed.stagedDir })
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
