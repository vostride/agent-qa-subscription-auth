import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  parseStageArgs,
  runCli,
  sanitizePackageManifest,
  stagePackage,
  validateStagedPackage,
} from '../release/stage-package.mjs'

const pluginManifest = { plugin: { kind: 'model-auth', runs: 'in-process', entry: './dist/index.js' } }

async function fixtureRoot(overrides = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'subscription-auth-stage-'))
  await mkdir(join(rootDir, 'dist'), { recursive: true })
  await writeFile(join(rootDir, 'dist/index.js'), 'export default function plugin() {}\n')
  await writeFile(join(rootDir, 'dist/index.d.ts'), 'export default function plugin(): void\n')
  await writeFile(join(rootDir, 'README.md'), '# docs\n')
  await writeFile(join(rootDir, 'LICENSE.md'), '# license\n')
  await writeFile(join(rootDir, 'NOTICE.md'), '# notice\n')
  const manifest = {
    name: '@vostride/agent-qa-subscription-auth',
    version: '0.1.0',
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    files: ['dist', 'LICENSE.md', 'NOTICE.md'],
    devDependencies: { '@vostride/agent-qa-core': 'link:../agent-qa/packages/core' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    license: 'FSL-1.1-ALv2',
    'agent-qa': pluginManifest,
    ...overrides,
  }
  await writeFile(join(rootDir, 'package.json'), JSON.stringify(manifest, null, 2))
  return rootDir
}

test('sanitizes publish manifest and rejects local dependency ranges', () => {
  const sanitized = sanitizePackageManifest({
    name: '@vostride/agent-qa-subscription-auth',
    version: '0.1.0',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    devDependencies: { '@vostride/agent-qa-core': 'link:../agent-qa/packages/core' },
    'agent-qa': pluginManifest,
  }, '0.1.1')

  assert.equal(sanitized.version, '0.1.1')
  assert.equal(sanitized.main, './dist/index.js')
  assert.equal(sanitized.types, './dist/index.d.ts')
  assert.deepEqual(sanitized['agent-qa'], pluginManifest)
  assert.equal('devDependencies' in sanitized, false)
  assert.throws(() => sanitizePackageManifest({ dependencies: { bad: 'workspace:*' } }, '0.1.1'), /unsafe local dependency range/)
  assert.throws(() => sanitizePackageManifest({ optionalDependencies: { bad: 'file:../bad' } }, '0.1.1'), /unsafe local dependency range/)
})

test('stages package files and validates required publish contents', async () => {
  const rootDir = await fixtureRoot()
  try {
    const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    const record = validateStagedPackage({ stagedDir, targetVersion: '0.1.1' })

    assert.equal(record.pkg.name, '@vostride/agent-qa-subscription-auth')
    assert.equal(record.pkg.version, '0.1.1')
    assert.equal(record.pkg.main, './dist/index.js')
    assert.equal(record.pkg.types, './dist/index.d.ts')
    assert.equal(record.pkg.license, 'FSL-1.1-ALv2')
    assert.deepEqual(record.pkg['agent-qa'], pluginManifest)
    assert.equal(existsSync(join(stagedDir, 'NOTICE.md')), true)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('a staged package without the agent-qa plugin manifest is refused', async () => {
  const rootDir = await fixtureRoot({ 'agent-qa': undefined })
  try {
    const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    assert.throws(
      () => validateStagedPackage({ stagedDir, targetVersion: '0.1.1' }),
      /staged package must declare the agent-qa model-auth plugin manifest/,
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('staging refuses a source manifest that depends on an agent-qa package', async () => {
  const declared = [
    ['peerDependencies', '@vostride/agent-qa-core', '>=0.1.0'],
    ['dependencies', 'agent-qa', '0.1.1'],
    ['optionalDependencies', '@vostride/agent-qa-runner', '0.1.1'],
  ]
  for (const [blockName, name, range] of declared) {
    const rootDir = await fixtureRoot({ [blockName]: { [name]: range } })
    const refusal = { message: `package.json must not depend on an agent-qa package: ${blockName}.${name}` }
    try {
      await assert.rejects(stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' }), refusal)
      await assert.rejects(
        runCli(['--target-version', '0.1.1', '--out', '.release/package'], { rootDir, output: {} }),
        refusal,
      )
      assert.equal(existsSync(join(rootDir, '.release')), false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  }
})

test('a staged package that depends on an agent-qa package is refused', async () => {
  const declared = [
    ['peerDependencies', '@vostride/agent-qa-core'],
    ['dependencies', 'agent-qa'],
  ]
  for (const [blockName, name] of declared) {
    const rootDir = await fixtureRoot()
    try {
      const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
      const stagedManifest = join(stagedDir, 'package.json')
      const pkg = JSON.parse(await readFile(stagedManifest, 'utf8'))
      pkg[blockName] = { [name]: '0.1.1' }
      await writeFile(stagedManifest, JSON.stringify(pkg, null, 2))
      assert.throws(() => validateStagedPackage({ stagedDir, targetVersion: '0.1.1' }), {
        message: `staged package must not depend on an agent-qa package: ${blockName}.${name}`,
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  }
})

test('staged dist may name only source maps it ships', async () => {
  const rootDir = await fixtureRoot()
  try {
    await writeFile(join(rootDir, 'dist/index.js'), 'export default 1\n//# sourceMappingURL=index.js.map')
    await writeFile(join(rootDir, 'dist/index.js.map'), '{}')
    const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    validateStagedPackage({ stagedDir, targetVersion: '0.1.1' })

    await writeFile(join(rootDir, 'dist/index.d.ts'), 'export {}\n//# sourceMappingURL=index.d.ts.map')
    const danglingDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    assert.throws(
      () => validateStagedPackage({ stagedDir: danglingDir, targetVersion: '0.1.1' }),
      /staged dist\/index\.d\.ts points at source map index\.d\.ts\.map, which is not emitted/,
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('a staged build may import agent-qa types in its declaration but not an agent-qa package in its JavaScript', async () => {
  const rootDir = await fixtureRoot()
  try {
    await writeFile(
      join(rootDir, 'dist/index.d.ts'),
      'import type { AuthProvider } from "@vostride/agent-qa-core"\nexport default function plugin(): AuthProvider[]\n',
    )
    const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    validateStagedPackage({ stagedDir, targetVersion: '0.1.1' })

    await writeFile(
      join(rootDir, 'dist/index.js'),
      'import { createAuthFetch, generatePKCE, generateState } from "@vostride/agent-qa-core"\nexport default function plugin() {}\n',
    )
    const importingDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    assert.throws(
      () => validateStagedPackage({ stagedDir: importingDir, targetVersion: '0.1.1' }),
      /staged dist\/index\.js imports an agent-qa package/,
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('a staged .cjs file that requires an agent-qa package is refused', async () => {
  const sources = [
    'const core = require("@vostride/agent-qa-core")\n',
    "const cli = __require('agent-qa')\n",
    'module.exports = require.resolve("@vostride/agent-qa-core/package.json")\n',
  ]
  for (const source of sources) {
    const rootDir = await fixtureRoot()
    try {
      await writeFile(join(rootDir, 'dist/interop.cjs'), source)
      const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
      assert.throws(
        () => validateStagedPackage({ stagedDir, targetVersion: '0.1.1' }),
        /staged dist\/interop\.cjs imports an agent-qa package/,
        source,
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  }
})

test('a staged build that loads an agent-qa package by a dynamic import is refused', async () => {
  const sources = [
    'export default () => import("@vostride/agent-qa-core")\n',
    'export default () => import(`@vostride/agent-qa-core/auth`)\n',
    'export default () => import(/* @vite-ignore */ "@vostride/agent-qa-core")\n',
    'export default () => import.meta.resolve("@vostride/agent-qa-core")\n',
  ]
  for (const source of sources) {
    const rootDir = await fixtureRoot()
    try {
      await writeFile(join(rootDir, 'dist/index.js'), source)
      const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
      assert.throws(
        () => validateStagedPackage({ stagedDir, targetVersion: '0.1.1' }),
        /staged dist\/index\.js imports an agent-qa package/,
        source,
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  }
})

test('staged JavaScript that only names agent-qa in a string is accepted', async () => {
  const rootDir = await fixtureRoot()
  try {
    await writeFile(
      join(rootDir, 'dist/index.js'),
      [
        'import { createServer } from "node:http"',
        `export const hint = "copy it from 'agent-qa' docs"`,
        `export const install = 'Add "@vostride/agent-qa-core" with npx agent-qa plugins add, then import "agent-qa" settings'`,
        'export default function plugin() {}',
        '',
      ].join('\n'),
    )
    const stagedDir = await stagePackage({ rootDir, targetVersion: '0.1.1', outDir: '.release/package' })
    validateStagedPackage({ stagedDir, targetVersion: '0.1.1' })
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('the published manifest declares the FSL licence and no agent-qa package', () => {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))

  assert.equal(pkg.license, 'FSL-1.1-ALv2')
  assert.equal('peerDependencies' in pkg, false)
  const names = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap(block =>
    Object.keys(pkg[block] ?? {}),
  )
  assert.deepEqual(names.filter(name => name === 'agent-qa' || name.startsWith('@vostride/agent-qa-')), [])
  assert.equal(sanitizePackageManifest(pkg, pkg.version).license, 'FSL-1.1-ALv2')
})

test('parseStageArgs tolerates pnpm run -- separator', () => {
  assert.deepEqual(parseStageArgs(['--', '--target-version', '0.1.1', '--out', '.release/package']), {
    targetVersion: '0.1.1',
    outDir: '.release/package',
  })
})
