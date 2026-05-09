import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const workspacePath = join(rootDir, 'pnpm-workspace.yaml')

test('pnpm build policy allows esbuild install scripts for CI installs', () => {
  assert.equal(existsSync(workspacePath), true)
  const config = readFileSync(workspacePath, 'utf8')

  assert.match(config, /^allowBuilds:\n/m)
  assert.match(config, /^\s+esbuild:\s+true$/m)
})
