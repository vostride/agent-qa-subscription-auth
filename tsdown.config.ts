import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { sourcemap: false },
  sourcemap: true,
  clean: true,
  target: 'node24',
  platform: 'node',
  fixedExtension: false,
  deps: { neverBundle: ['@vostride/agent-qa-core'] },
  publint: true,
  attw: { profile: 'esm-only', level: 'error' },
})
