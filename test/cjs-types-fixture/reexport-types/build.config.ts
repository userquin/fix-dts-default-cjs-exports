import { defineBuildConfig } from 'unbuild'
import { FixDtsDefaultCjsExportsPlugin } from '../../../src/rollup'

export default defineBuildConfig({
  entries: ['./index.ts', './types.ts', './all.ts'],
  declaration: true,
  clean: true,
  // avoid exit code 1 on warnings
  failOnWarn: false,
  rollup: {
    emitCJS: true,
  },
  hooks: {
    'rollup:dts:options': (ctx, options) => {
      options.plugins = options.plugins.filter((p) => {
        if (!p || typeof p === 'string' || Array.isArray(p) || !('name' in p))
          return true

        return p.name !== 'fix-dts-default-cjs-exports-plugin'
          && p.name !== 'unbuild-fix-cjs-export-type'
      })
      options.plugins.push(FixDtsDefaultCjsExportsPlugin({
        warn: message => ctx.warnings.add(message),
      }))
    },
  },
})
