import { defineConfig, type Rolldown } from 'tsdown'

// The declaration ships without a map, but rolldown-plugin-dts leaves it pointing at the
// map it dropped.
const withoutDeclarationMapUrls: Rolldown.Plugin = {
  name: 'without-declaration-map-urls',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'chunk' || !/\.d\.[cm]?ts$/.test(file.fileName)) continue
      if (`${file.fileName}.map` in bundle) continue
      file.code = file.code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '')
    }
  },
}

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
  plugins: [withoutDeclarationMapUrls],
  publint: true,
  attw: { profile: 'esm-only', level: 'error' },
})
