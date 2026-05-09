import { execFileSync as defaultExecFileSync } from 'node:child_process'

export async function checkNpmVersionAbsent(name, version, options = {}) {
  const execFileSync = options.execFileSync ?? defaultExecFileSync
  const spec = `${name}@${version}`
  try {
    execFileSync('npm', ['view', spec, 'version', '--json'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    throw new Error(`npm version already published: ${spec}`)
  } catch (error) {
    if (error.message?.startsWith('npm version already published:')) throw error
    const text = `${error.stderr ?? ''}\n${error.message ?? ''}`
    if (/E404|404|Not Found/i.test(text)) return
    throw new Error(`could not verify npm version absence for ${spec}`)
  }
}
