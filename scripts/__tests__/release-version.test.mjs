import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAllowedTargetVersion,
  assertAllowedBump,
  computeTargetVersion,
  parseVersionArgs,
} from '../release/version.mjs'

test('allows only patch and minor bumps on the v0 release line', () => {
  assert.equal(assertAllowedBump('patch'), 'patch')
  assert.equal(assertAllowedBump('minor'), 'minor')
  assert.throws(() => assertAllowedBump('major'), /Release bump must be patch or minor/)

  assert.equal(computeTargetVersion('0.1.0', 'patch'), '0.1.1')
  assert.equal(computeTargetVersion('0.1.0', 'minor'), '0.2.0')
  assert.equal(assertAllowedTargetVersion('0.1.1'), '0.1.1')
  assert.throws(() => computeTargetVersion('1.0.0', 'patch'), /Release target left the 0\.x\.x line/)
  assert.throws(() => assertAllowedTargetVersion('1.0.0'), /Release target left the 0\.x\.x line/)
})

test('parseVersionArgs tolerates pnpm run -- separator', () => {
  assert.deepEqual(parseVersionArgs(['--', '--bump', 'patch']), { bump: 'patch', targetVersion: undefined, write: false })
  assert.deepEqual(parseVersionArgs(['--bump', 'minor', '--write']), { bump: 'minor', targetVersion: undefined, write: true })
  assert.deepEqual(parseVersionArgs(['--target-version', '0.1.1', '--write']), { bump: undefined, targetVersion: '0.1.1', write: true })
  assert.throws(() => parseVersionArgs(['--bump', 'major']), /Release bump must be patch or minor/)
  assert.throws(() => parseVersionArgs(['--bump', 'patch', '--target-version', '0.1.1']), /either --bump or --target-version/)
})
