import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  checkGitTagAbsent,
  createReleaseCommitAndTag,
  parseGitArgs,
  runCli as runGitCli,
} from '../release/git.mjs'

test('checks v-prefixed release tags and fails closed', () => {
  const calls = []
  assert.doesNotThrow(() => checkGitTagAbsent('0.1.1', {
    execFileSync: (cmd, args) => {
      calls.push([cmd, args])
      const error = new Error('missing ref')
      error.status = 1
      throw error
    },
  }))
  assert.deepEqual(calls[0], ['git', ['show-ref', '--verify', '--quiet', 'refs/tags/v0.1.1']])

  assert.throws(() => checkGitTagAbsent('0.1.1', { execFileSync: () => '' }), /git tag already exists: v0\.1\.1/)
})

test('creates deterministic release commit and annotated tag', () => {
  const calls = []
  createReleaseCommitAndTag('0.1.1', {
    execFileSync: (cmd, args) => calls.push([cmd, args]),
  })

  assert.deepEqual(calls.at(-3), ['git', ['add', '--', 'package.json']])
  assert.deepEqual(calls.at(-2), ['git', ['commit', '-m', 'release: subscription-auth v0.1.1']])
  assert.deepEqual(calls.at(-1), ['git', ['tag', '-a', 'v0.1.1', '-m', 'subscription-auth v0.1.1']])
})

test('parseGitArgs tolerates pnpm run -- separator and dispatches CLI', async () => {
  assert.deepEqual(parseGitArgs(['--', '--commit-tag']), { mode: 'commit-tag' })
  assert.throws(() => parseGitArgs(['--commit-tag', '--push']), /invalid args/)

  const rootDir = await mkdtemp(join(tmpdir(), 'subscription-auth-git-cli-'))
  try {
    await writeFile(join(rootDir, 'package.json'), JSON.stringify({ version: '0.1.1' }))
    const calls = []
    const version = await runGitCli(['--commit-tag'], {
      rootDir,
      execFileSync: (cmd, args) => calls.push([cmd, args]),
    })
    assert.equal(version, '0.1.1')
    assert.deepEqual(calls.at(-2), ['git', ['commit', '-m', 'release: subscription-auth v0.1.1']])
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
