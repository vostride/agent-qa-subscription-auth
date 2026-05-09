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

test('release workflow is manual-only with patch/minor bump choices and exact version dispatch', () => {
  const workflow = readWorkflow()

  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /run-name:\s*Release subscription auth/)
  assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|release|schedule):/m)
  assert.match(workflow, /bump:/)
  assert.match(workflow, /type:\s*choice/)
  assert.match(workflow, /default:\s*patch/)
  assert.match(workflow, /-\s+patch\b/)
  assert.match(workflow, /-\s+minor\b/)
  assert.match(workflow, /target_version:/)
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
    'repository: vostride/agent-qa',
    'path: agent-qa',
    'path: agent-qa-subscription-auth',
    'git rev-parse -q --verify "refs/tags/v$SUBSCRIPTION_AUTH_TARGET_VERSION"',
    'pnpm install --frozen-lockfile',
    'pnpm --filter @vostride/agent-qa-ids build',
    'pnpm --filter @vostride/agent-qa-core build',
    'working-directory: agent-qa-subscription-auth\n        run: pnpm install --frozen-lockfile',
    'args=(--target-version "$SUBSCRIPTION_AUTH_TARGET_VERSION" --stage preflight)',
    'args+=(--allow-existing-tag)',
    'pnpm run release:verify -- "${args[@]}"',
    'pnpm run release:verify -- --bump "$SUBSCRIPTION_AUTH_BUMP" --stage preflight',
    'pnpm run release:version -- --target-version "$SUBSCRIPTION_AUTH_TARGET_VERSION" --write',
    'pnpm run release:version -- --bump "$SUBSCRIPTION_AUTH_BUMP" --write',
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
  assert.match(workflow, /if:\s*\$\{\{ steps\.release-tag\.outputs\.exists != 'true' \}\}/)
  for (let index = 0; index < orderedCommands.length - 1; index += 1) {
    assertBefore(workflow, orderedCommands[index], orderedCommands[index + 1])
  }
})
