import type { InputPluginOption } from 'rollup'
// import { FixDtsDefaultCjsExportsPlugin } from '../src/rollup'

export function prepareDtsPlugins(
  plugins: InputPluginOption[],
  _warn: (msg: string) => void,
): InputPluginOption[] {
  const result = plugins.filter((p) => {
    if (!p || typeof p === 'string' || Array.isArray(p) || !('name' in p))
      return true

    return p.name !== 'fix-dts-default-cjs-exports-plugin'
      && p.name !== 'unbuild-fix-cjs-export-type'
  })
  // no idea why unbuild failing when adding the plugin
  // the error when running build:mixed-declarations from root:
  // [Error: ENOENT: no such file or directory, open 'D:\work\userquin\test\fixtures\mixed-declarations\dist\index.d.ts']
  // result.push(FixDtsDefaultCjsExportsPlugin({ warn }))
  return result
}
