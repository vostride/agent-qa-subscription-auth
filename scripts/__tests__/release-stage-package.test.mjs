import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  parseStageArgs,
  sanitizePackageManifest,
  stagePackage,
  validateStagedPackage,
} from '../release/stage-package.mjs'

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
    peerDependencies: { '@vostride/agent-qa-core': '>=0.1.0' },
    devDependencies: { '@vostride/agent-qa-core': 'link:../agent-qa/packages/core' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
    license: 'SEE LICENSE IN LICENSE.md',
    ...overrides,
  }
  await writeFile(join(rootDir, 'package.json'), JSON.stringify(manifest, null, 2))
  return rootDir
}

test('sanitizes publish manifest and rejects local dependency ranges', () => {
  const sanitized = sanitizePackageManifest({
    name: '@vostride/agent-qa-subscription-auth',
    version: '0.1.0',
    devDependencies: { '@vostride/agent-qa-core': 'link:../agent-qa/packages/core' },
    peerDependencies: { '@vostride/agent-qa-core': '>=0.1.0' },
  }, '0.1.1')

  assert.equal(sanitized.version, '0.1.1')
  assert.equal(sanitized.main, undefined)
  assert.equal(sanitized.types, undefined)
  assert.equal(sanitized.peerDependencies['@vostride/agent-qa-core'], '>=0.1.0')
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
    assert.equal(record.pkg.peerDependencies['@vostride/agent-qa-core'], '>=0.1.0')
    assert.equal(existsSync(join(stagedDir, 'NOTICE.md')), true)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('parseStageArgs tolerates pnpm run -- separator', () => {
  assert.deepEqual(parseStageArgs(['--', '--target-version', '0.1.1', '--out', '.release/package']), {
    targetVersion: '0.1.1',
    outDir: '.release/package',
  })
})
