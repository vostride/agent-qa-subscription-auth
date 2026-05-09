import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function read(path) {
  return readFileSync(join(rootDir, path), 'utf8')
}

test('README documents install, plugin config, dashboard auth, and compatibility', () => {
  const readme = read('README.md')

  assert.match(readme, /@vostride\/agent-qa-subscription-auth/)
  assert.match(readme, /"devDependencies"/)
  assert.match(readme, /<agent-qa version>/)
  assert.match(readme, /plugins\.auth/)
  assert.match(readme, /agent-qa dashboard/)
  assert.match(readme, /path:\s*"\.\.\/agent-qa-subscription-auth\/dist\/index\.js"/)
  assert.match(readme, /@vostride\/agent-qa-core >=0\.1\.0/)
  assert.match(readme, /RELEASE\.md/)
})

test('release guide documents trusted publishing setup and workflow operation', () => {
  const release = read('RELEASE.md')

  assert.match(release, /pnpm run release:dry-run -- --bump patch/)
  assert.match(release, /trusted publishing/i)
  assert.match(release, /@vostride\/agent-qa-subscription-auth/)
  assert.match(release, /vostride\/agent-qa-subscription-auth/)
  assert.match(release, /vostride\/agent-qa/)
  assert.match(release, /SUBSCRIPTION_AUTH_RELEASE_TOKEN/)
  assert.match(release, /\.github\/workflows\/release\.yml/)
  assert.match(release, /No NPM_TOKEN/)
  assert.match(release, /workflow_dispatch/)
  assert.match(release, /patch/)
  assert.match(release, /minor/)
  assert.match(release, /npm publish --access public/)
  assert.match(release, /npm provenance/)
  assert.match(release, /partial publish/)
  assert.match(release, /never overwrite or unpublish\/reuse/)
})
