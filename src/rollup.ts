import type { Plugin, RenderedChunk } from 'rollup'
import { internalFixDefaultCJSExports } from './utils'

export interface PluginOptions {
  warn?: (message: string) => void
  matcher?: (info: RenderedChunk) => boolean
}

export function cjsExportsDtsMatcher(info: RenderedChunk): boolean {
  return info.type === 'chunk'
    && info.exports?.length > 0
    && info.exports.includes('default')
    && /\.d\.c?ts$/.test(info.fileName)
}

export function defaultCjsExportsDtsMatcher(info: RenderedChunk): boolean {
  return cjsExportsDtsMatcher(info) && info.isEntry
}

export function FixDtsDefaultCjsExportsPlugin(options: PluginOptions = {}): Plugin {
  const { matcher = defaultCjsExportsDtsMatcher } = options

  return {
    name: 'fix-dts-default-cjs-exports-plugin',
    renderChunk(code, info) {
      return matcher(info)
        ? internalFixDefaultCJSExports(code, info, options)
        : undefined
    },
  } satisfies Plugin
}
