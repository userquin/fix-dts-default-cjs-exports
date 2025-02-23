import type { InputPluginOption } from 'rollup'
import { FixDtsDefaultCjsExportsPlugin } from '../src/rollup'

export function prepareDtsPlugins(
  plugins: InputPluginOption[],
  warn: (msg: string) => void,
): InputPluginOption[] {
  const result = plugins.filter((p) => {
    if (!p || typeof p === 'string' || Array.isArray(p) || !('name' in p))
      return true

    return p.name !== 'fix-dts-default-cjs-exports-plugin'
      && p.name !== 'unbuild-fix-cjs-export-type'
  })
  result.push(FixDtsDefaultCjsExportsPlugin({ warn }))
  return result
}
