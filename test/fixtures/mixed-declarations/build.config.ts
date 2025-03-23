import { defineBuildConfig } from 'unbuild'
import { prepareDtsPlugins } from '../../prepare-dts-plugins'

export default defineBuildConfig({
  entries: ['./index.ts', './defaultclass.ts', './defaultconst.ts'],
  declaration: true,
  clean: false,
  // avoid exit code 1 on warnings
  failOnWarn: false,
  rollup: {
    emitCJS: true,
  },
  hooks: {
    'rollup:dts:options': (ctx, options) => {
      options.plugins = prepareDtsPlugins(
        options.plugins,
        {
          warn: message => ctx.warnings.add(message),
        },
      )
    },
  },
})
