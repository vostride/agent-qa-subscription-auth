import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflowPath = join(rootDir, '.github/workflows/release.yml')

function readWorkflow() {
  assert.ok(existsSync(workflowPath), 'Release workflow file is missing: .github/workflows/release.yml')
  return readFileSync(workflowPath, 'utf8')
}

function assertIncludes(text, expected) {
  assert.ok(text.includes(expected), `Expected workflow to contain: ${expected}`)
}

function assertBefore(text, before, after) {
  const beforeIndex = text.indexOf(before)
  const afterIndex = text.indexOf(after)
  assert.notEqual(beforeIndex, -1, `Expected workflow to contain: ${before}`)
  assert.notEqual(afterIndex, -1, `Expected workflow to contain: ${after}`)
  assert.ok(beforeIndex < afterIndex, `Expected "${before}" before "${after}"`)
}

test('release workflow is manual-only with patch/minor bump choices', () => {
  const workflow = readWorkflow()

  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|release|schedule):/m)
  assert.match(workflow, /bump:/)
  assert.match(workflow, /type:\s*choice/)
  assert.match(workflow, /-\s+patch\b/)
  assert.match(workflow, /-\s+minor\b/)
  assert.doesNotMatch(workflow, /-\s+major\b/)
})

test('release workflow uses trusted publishing prerequisites without npm tokens', () => {
  const workflow = readWorkflow()

  assert.match(workflow, /permissions:/)
  assert.match(workflow, /contents:\s*write/)
  assert.match(workflow, /id-token:\s*write/)
  assert.match(workflow, /runs-on:\s*ubuntu-latest/)
  assertIncludes(workflow, "node-version: '24'")
  assertIncludes(workflow, "registry-url: 'https://registry.npmjs.org'")
  assert.doesNotMatch(workflow, /NPM_TOKEN/)
})

test('release workflow verifies, builds, stages, tags, pushes, and publishes in order', () => {
  const workflow = readWorkflow()
  const orderedCommands = [
    'pnpm install --frozen-lockfile',
    'pnpm run release:verify -- --bump "${{ inputs.bump }}" --stage preflight',
    'pnpm run release:version -- --bump "${{ inputs.bump }}" --write',
    'pnpm test',
    'pnpm typecheck',
    'pnpm build',
    'pnpm run release:stage -- --target-version "${{ steps.version.outputs.version }}" --out .release/package',
    'pnpm run release:verify -- --stage postbuild --target-version "${{ steps.version.outputs.version }}" --staged-dir .release/package',
    'pnpm exec node scripts/release/git.mjs --commit-tag',
    'git push origin HEAD:${{ github.ref_name }} --follow-tags',
    'pnpm run release:publish -- --staged-dir .release/package',
  ]

  for (const command of orderedCommands) assertIncludes(workflow, command)
  for (let index = 0; index < orderedCommands.length - 1; index += 1) {
    assertBefore(workflow, orderedCommands[index], orderedCommands[index + 1])
  }
})
