import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildReleaseDryRunPlan,
  parseDryRunArgs,
  runCli as runDryRunCli,
} from '../release/dry-run.mjs'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('builds a non-mutating patch release dry-run plan', () => {
  const plan = buildReleaseDryRunPlan({ rootDir, bump: 'patch' })

  assert.equal(plan.dryRun, true)
  assert.equal(plan.mutatesExternalState, false)
  assert.equal(plan.currentVersion, '0.1.1')
  assert.equal(plan.targetVersion, '0.1.2')
  assert.ok(plan.releaseGatePlan.includes('npm publish'))
  assert.equal(plan.npm.trustedPublishing, true)
  assert.equal(plan.npm.usesNpmToken, false)
  assert.equal(plan.npm.publishCommand.package, '@vostride/agent-qa-subscription-auth')
  assert.equal(plan.npm.publishCommand.command, 'npm publish --access public')
  assert.equal(plan.package, '@vostride/agent-qa-subscription-auth')
})

test('parseDryRunArgs tolerates pnpm run -- separator', () => {
  assert.deepEqual(parseDryRunArgs(['--', '--bump', 'patch', '--json']), {
    bump: 'patch',
    json: true,
  })
  assert.throws(() => parseDryRunArgs([]), /missing --bump/)
})

test('CLI renders JSON dry-run output', async () => {
  let jsonOutput = ''
  await runDryRunCli(['--bump', 'patch', '--json'], {
    rootDir,
    output: { write: chunk => { jsonOutput += chunk } },
  })
  const parsed = JSON.parse(jsonOutput)
  assert.equal(parsed.targetVersion, '0.1.2')
  assert.equal(parsed.mutatesExternalState, false)
  assert.equal(parsed.package, '@vostride/agent-qa-subscription-auth')
})
