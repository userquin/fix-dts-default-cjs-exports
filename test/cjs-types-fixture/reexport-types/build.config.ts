import { defineBuildConfig } from 'unbuild'
import { prepareDtsPlugins } from '../../prepare-dts-plugins'

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
      options.plugins = prepareDtsPlugins(
        options.plugins,
        message => ctx.warnings.add(message),
      )
    },
  },
})
