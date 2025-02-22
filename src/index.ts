import type { Options } from './utils'
import fs from 'node:fs/promises'
import { findStaticImports, parseStaticImport } from 'mlly'
import { internalFixDefaultCJSExports } from './utils'

export type { Options }

export async function FixDtsDefaultCJSExports(
  dtsPath: string,
  options: Options,
): Promise<string | undefined> {
  const code = await fs.readFile(dtsPath, 'utf-8')
  // todo: convert these import to RollupChunk.imports
  const imports = findStaticImports(code).map(i => parseStaticImport(i))
  // eslint-disable-next-line no-console
  console.log(imports)
  return internalFixDefaultCJSExports(code, {
    fileName: dtsPath,
    imports: [],
  }, options)
}
