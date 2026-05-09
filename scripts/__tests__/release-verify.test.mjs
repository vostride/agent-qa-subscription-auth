import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReleaseGatePlan,
  parseVerifyArgs,
  runReleaseVerification,
} from '../release/verify.mjs'

test('builds release gates in mutation-safe order', () => {
  assert.deepEqual(buildReleaseGatePlan('patch'), [
    'pnpm install --frozen-lockfile',
    'release preflight',
    'write package version',
    'pnpm test',
    'pnpm typecheck',
    'pnpm build',
    'stage package',
    'release postbuild verification',
    'create release commit and tag',
    'git push',
    'npm publish',
  ])
})

test('parseVerifyArgs tolerates pnpm run -- separator', () => {
  assert.deepEqual(parseVerifyArgs(['--', '--bump', 'patch', '--stage', 'preflight']), {
    bump: 'patch',
    stage: 'preflight',
  })
  assert.deepEqual(parseVerifyArgs(['--target-version', '0.1.1', '--stage', 'preflight']), {
    targetVersion: '0.1.1',
    stage: 'preflight',
  })
  assert.deepEqual(parseVerifyArgs(['--stage', 'postbuild', '--target-version', '0.1.1', '--staged-dir', '.release/package']), {
    stage: 'postbuild',
    targetVersion: '0.1.1',
    stagedDir: '.release/package',
  })
  assert.throws(() => parseVerifyArgs(['--stage', 'publish']), /invalid args/)
})

test('preflight accepts explicit target version from agent-qa release', async () => {
  const calls = []
  await runReleaseVerification({
    stage: 'preflight',
    targetVersion: '0.1.1',
    readPackage: () => ({ name: '@vostride/agent-qa-subscription-auth', version: '0.1.1' }),
    checkGitTagAbsent: version => calls.push(['git', version]),
    checkNpmVersionAbsent: (name, version) => calls.push(['npm', name, version]),
  })

  assert.deepEqual(calls, [
    ['git', '0.1.1'],
    ['npm', '@vostride/agent-qa-subscription-auth', '0.1.1'],
  ])
})

test('preflight checks package version, git tag, and npm registry absence', async () => {
  const calls = []
  await runReleaseVerification({
    stage: 'preflight',
    bump: 'patch',
    readPackage: () => ({ name: '@vostride/agent-qa-subscription-auth', version: '0.1.0' }),
    checkGitTagAbsent: version => calls.push(['git', version]),
    checkNpmVersionAbsent: (name, version) => calls.push(['npm', name, version]),
  })

  assert.deepEqual(calls, [
    ['git', '0.1.1'],
    ['npm', '@vostride/agent-qa-subscription-auth', '0.1.1'],
  ])
})

test('postbuild validates staged package and trusted publish environment', async () => {
  const calls = []
  await runReleaseVerification({
    stage: 'postbuild',
    targetVersion: '0.1.1',
    stagedDir: '.release/package',
    env: { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token' },
    npmVersion: '11.6.1',
    validateStagedPackage: args => calls.push(['stage', args.stagedDir, args.targetVersion]),
    validateStagedPackDryRun: args => calls.push(['pack', args.stagedDir, args.targetVersion]),
    assertTrustedPublishEnvironment: args => calls.push(['trusted', args.npmVersion]),
  })

  assert.deepEqual(calls, [
    ['stage', '.release/package', '0.1.1'],
    ['pack', '.release/package', '0.1.1'],
    ['trusted', '11.6.1'],
  ])
})
