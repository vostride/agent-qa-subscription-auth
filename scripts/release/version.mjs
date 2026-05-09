import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/

export function stripArgSeparator(argv = []) {
  return argv[0] === '--' ? argv.slice(1) : [...argv]
}

export function assertAllowedBump(bump) {
  if (bump !== 'patch' && bump !== 'minor') {
    throw new Error('Release bump must be patch or minor')
  }
  return bump
}

export function computeTargetVersion(currentVersion, bump) {
  assertAllowedBump(bump)
  const match = versionPattern.exec(currentVersion)
  if (!match) throw new Error(`invalid package version: ${currentVersion}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const targetVersion = bump === 'patch' ? `${major}.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`
  if (!targetVersion.startsWith('0.')) throw new Error('Release target left the 0.x.x line')
  return targetVersion
}

export function assertAllowedTargetVersion(version) {
  const targetVersion = String(version ?? '')
  if (!versionPattern.test(targetVersion)) throw new Error(`invalid target version: ${targetVersion}`)
  if (!targetVersion.startsWith('0.')) throw new Error('Release target left the 0.x.x line')
  return targetVersion
}

export function readPackage(rootDir = process.cwd()) {
  return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
}

export function writePackageVersion(rootDir, version) {
  const manifestPath = join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
  pkg.version = version
  writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  return pkg
}

export function parseVersionArgs(argv = []) {
  const args = stripArgSeparator(argv)
  let bump
  let targetVersion
  let write = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--bump') {
      bump = args[index + 1]
      index += 1
    } else if (arg === '--target-version') {
      targetVersion = args[index + 1]
      index += 1
    } else if (arg === '--write') {
      write = true
    } else {
      throw new Error(`invalid args: ${args.join(' ')}`)
    }
  }
  if (bump && targetVersion) throw new Error('use either --bump or --target-version, not both')
  if (!bump && !targetVersion) throw new Error('missing --bump or --target-version')
  if (bump) assertAllowedBump(bump)
  if (targetVersion) assertAllowedTargetVersion(targetVersion)
  return { bump, targetVersion, write }
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const { bump, targetVersion: explicitTargetVersion, write } = parseVersionArgs(argv)
  const rootDir = options.rootDir ?? process.cwd()
  const current = readPackage(rootDir).version
  const targetVersion = explicitTargetVersion ?? computeTargetVersion(current, bump)
  if (write) writePackageVersion(rootDir, targetVersion)
  const output = options.output ?? process.stdout
  output.write?.(`${targetVersion}\n`)
  const githubOutput = options.env?.GITHUB_OUTPUT ?? process.env.GITHUB_OUTPUT
  if (githubOutput) appendFileSync(githubOutput, `version=${targetVersion}\n`, 'utf8')
  return targetVersion
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
