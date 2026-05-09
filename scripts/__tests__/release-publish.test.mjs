import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertTrustedPublishEnvironment,
  createPublishCommand,
  parsePublishArgs,
  publishPackage,
} from '../release/publish.mjs'

test('requires GitHub OIDC trusted publishing and rejects npm tokens', () => {
  assert.doesNotThrow(() => assertTrustedPublishEnvironment({
    env: { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token' },
    npmVersion: '11.5.1',
  }))
  assert.throws(() => assertTrustedPublishEnvironment({ env: { GITHUB_ACTIONS: 'true' }, npmVersion: '11.5.1' }), /ACTIONS_ID_TOKEN_REQUEST_TOKEN/)
  assert.throws(() => assertTrustedPublishEnvironment({ env: { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token' }, npmVersion: '11.4.0' }), /npm CLI >=11\.5\.1/)
  assert.throws(() => assertTrustedPublishEnvironment({ env: { ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token' }, npmVersion: '11.5.1' }), /GitHub Actions/)
  assert.throws(() => assertTrustedPublishEnvironment({ env: { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token', NPM_TOKEN: 'token' }, npmVersion: '11.5.1' }), /NPM_TOKEN/)
})

test('creates a public npm publish command in the staged package directory', () => {
  const command = createPublishCommand({ stagedDir: '.release/package' })
  assert.equal(command.command, 'npm')
  assert.deepEqual(command.args, ['publish', '--access', 'public'])
  assert.equal(command.cwd, '.release/package')
  assert.equal(JSON.stringify(command).includes('NPM_TOKEN'), false)
})

test('parsePublishArgs tolerates pnpm run -- separator and publish strips provenance override', async () => {
  assert.deepEqual(parsePublishArgs(['--', '--staged-dir', '.release/package']), { stagedDir: '.release/package' })
  assert.throws(() => parsePublishArgs([]), /missing --staged-dir/)

  const calls = []
  await publishPackage({
    stagedDir: '.release/package',
    env: { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token', NPM_CONFIG_PROVENANCE: 'false' },
    npmVersion: '11.6.1',
    execFileSync: (cmd, args, options) => calls.push([cmd, args, options.cwd, options.env]),
  })

  assert.deepEqual(calls[0][0], 'npm')
  assert.deepEqual(calls[0][1], ['publish', '--access', 'public'])
  assert.equal(calls[0][2], '.release/package')
  assert.equal('NPM_CONFIG_PROVENANCE' in calls[0][3], false)
})
