import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function read(path) {
  return readFileSync(join(rootDir, path), 'utf8')
}

test('README installs through init, shows the plugins entry and signs in with auth login', () => {
  const readme = read('README.md')

  assert.match(readme, /@vostride\/agent-qa-subscription-auth/)
  assert.match(readme, /npx agent-qa@latest init/)
  assert.match(readme, /name: subscription/)
  assert.match(readme, /package: "@vostride\/agent-qa-subscription-auth"/)
  assert.match(readme, /npx agent-qa auth login --config/)
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
