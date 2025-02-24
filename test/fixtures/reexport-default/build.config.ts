import { defineBuildConfig } from 'unbuild'
import { prepareDtsPlugins } from '../../prepare-dts-plugins'

export default defineBuildConfig({
  entries: [
    './index.ts',
    './asdefault.ts',
    './defaultclass.ts',
    './magicstringasdefault.ts',
    './resolveasdefault.ts',
  ],
  declaration: true,
  clean: true,
  // avoid exit code 1 on warnings
  failOnWarn: false,
  externals: ['magic-string', 'pathe'],
  rollup: {
    emitCJS: true,
    dts: {
      respectExternal: true,
      compilerOptions: {
        composite: false,
        preserveSymlinks: false,
        module: 200,
        moduleResolution: 100,
      },
    },
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
