import assert from 'node:assert/strict'
import test from 'node:test'
import { checkNpmVersionAbsent } from '../release/registry.mjs'

function npmError(message, stderr = message) {
  const error = new Error(message)
  error.stderr = stderr
  return error
}

test('treats successful npm view output as a published version collision', async () => {
  await assert.rejects(
    checkNpmVersionAbsent('@vostride/agent-qa-subscription-auth', '0.1.1', {
      execFileSync: () => '"0.1.1"',
    }),
    /npm version already published: @vostride\/agent-qa-subscription-auth@0\.1\.1/,
  )
})

test('treats npm E404 as version absence', async () => {
  const calls = []
  await checkNpmVersionAbsent('@vostride/agent-qa-subscription-auth', '0.1.1', {
    execFileSync: (cmd, args) => {
      calls.push([cmd, args])
      throw npmError('npm ERR! code E404', 'npm ERR! 404 Not Found')
    },
  })

  assert.deepEqual(calls, [['npm', ['view', '@vostride/agent-qa-subscription-auth@0.1.1', 'version', '--json']]])
})

test('fails closed for ambiguous npm registry errors', async () => {
  await assert.rejects(
    checkNpmVersionAbsent('@vostride/agent-qa-subscription-auth', '0.1.1', {
      execFileSync: () => {
        throw npmError('network failed', 'ECONNRESET')
      },
    }),
    /could not verify npm version absence for @vostride\/agent-qa-subscription-auth@0\.1\.1/,
  )
})
