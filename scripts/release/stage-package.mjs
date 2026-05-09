import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { stripArgSeparator } from './version.mjs'

const dependencyBlocks = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const copiedFiles = ['README.md', 'LICENSE.md', 'NOTICE.md']

function assertNoLocalRanges(pkg) {
  for (const blockName of dependencyBlocks) {
    const block = pkg[blockName]
    if (!block || typeof block !== 'object') continue
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === 'string' && /^(link:|file:|workspace:)/.test(range)) {
        throw new Error(`unsafe local dependency range in staged manifest: ${blockName}.${name}=${range}`)
      }
    }
  }
}

export function sanitizePackageManifest(pkg, targetVersion) {
  const allowed = [
    'name',
    'version',
    'private',
    'type',
    'description',
    'engines',
    'main',
    'types',
    'exports',
    'files',
    'publishConfig',
    'peerDependencies',
    'license',
    'homepage',
    'bugs',
    'repository',
  ]
  const sanitized = {}
  for (const key of allowed) {
    if (pkg[key] !== undefined) sanitized[key] = JSON.parse(JSON.stringify(pkg[key]))
  }
  sanitized.version = targetVersion
  assertNoLocalRanges(sanitized)
  for (const blockName of ['dependencies', 'optionalDependencies']) {
    if (pkg[blockName]) {
      sanitized[blockName] = JSON.parse(JSON.stringify(pkg[blockName]))
    }
  }
  assertNoLocalRanges(sanitized)
  return sanitized
}

export async function stagePackage(options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const targetVersion = options.targetVersion
  const outDir = options.outDir ?? '.release/package'
  if (!targetVersion) throw new Error('missing targetVersion')
  const stagedDir = resolve(rootDir, outDir)
  const sourcePkg = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8'))
  const stagedPkg = sanitizePackageManifest(sourcePkg, targetVersion)

  await rm(stagedDir, { recursive: true, force: true })
  await mkdir(stagedDir, { recursive: true })
  await cp(join(rootDir, 'dist'), join(stagedDir, 'dist'), { recursive: true })
  for (const file of copiedFiles) {
    await cp(join(rootDir, file), join(stagedDir, file))
  }
  await writeFile(join(stagedDir, 'package.json'), `${JSON.stringify(stagedPkg, null, 2)}\n`, 'utf8')
  return stagedDir
}

export function validateStagedPackage(options = {}) {
  const stagedDir = options.stagedDir
  const targetVersion = options.targetVersion
  if (!stagedDir) throw new Error('missing stagedDir')
  if (!targetVersion) throw new Error('missing targetVersion')
  const pkgPath = join(stagedDir, 'package.json')
  if (!existsSync(pkgPath)) throw new Error(`staged package is missing package.json: ${stagedDir}`)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (pkg.name !== '@vostride/agent-qa-subscription-auth') throw new Error('staged package name mismatch')
  if (pkg.version !== targetVersion) throw new Error(`staged package version must be ${targetVersion}`)
  if (pkg.publishConfig?.access !== 'public') throw new Error('staged package publishConfig.access must be public')
  if (pkg.main !== './dist/index.js') throw new Error('staged package main must be ./dist/index.js')
  if (pkg.types !== './dist/index.d.ts') throw new Error('staged package types must be ./dist/index.d.ts')
  if (pkg.peerDependencies?.['@vostride/agent-qa-core'] !== '>=0.1.0') {
    throw new Error('staged package must declare @vostride/agent-qa-core >=0.1.0 peer dependency')
  }
  assertNoLocalRanges(pkg)
  for (const file of ['README.md', 'LICENSE.md', 'NOTICE.md', 'dist/index.js', 'package.json']) {
    if (!existsSync(join(stagedDir, file))) throw new Error(`staged package must include ${file}`)
  }
  return { dir: stagedDir, pkg }
}

export function parseStageArgs(argv = []) {
  const args = stripArgSeparator(argv)
  let targetVersion
  let outDir
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--target-version') {
      targetVersion = args[index + 1]
      index += 1
    } else if (arg === '--out') {
      outDir = args[index + 1]
      index += 1
    } else {
      throw new Error(`invalid args: ${args.join(' ')}`)
    }
  }
  if (!targetVersion) throw new Error('missing --target-version')
  if (!outDir) throw new Error('missing --out')
  return { targetVersion, outDir }
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const parsed = parseStageArgs(argv)
  const stagedDir = await stagePackage({ ...options, ...parsed })
  validateStagedPackage({ stagedDir, targetVersion: parsed.targetVersion })
  const output = options.output ?? process.stdout
  output.write?.(`${stagedDir}\n`)
  return stagedDir
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
