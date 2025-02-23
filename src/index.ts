import type { Options } from './utils'
import fs from 'node:fs/promises'
import { internalFixDefaultCJSExports } from './utils'

export type { Options }

export function transformDtsDefaultCJSExports(
  code: string,
  fileName: string,
  options: Options = {},
): string | undefined {
  return internalFixDefaultCJSExports(code, {
    fileName,
    // we don't need the imports (used only for exporting types optimization)
    imports: [],
  }, options)
}

export async function fixDtsFileDefaultCJSExports(
  dtsPath: string,
  options: Options = {},
): Promise<boolean> {
  const result = transformDtsDefaultCJSExports(
    await fs.readFile(dtsPath, 'utf-8'),
    dtsPath,
    options,
  )
  if (result) {
    await fs.writeFile(dtsPath, result, 'utf8')
  }
  return !!result
}

/**
 * Given a `d.mts` file, transform it to a `d.ts` or `d.cts` file fixing CJS default exports.
 * @param dtsPath The source `.d.mts` file path.
 * @param dtsDestPath The destination `.d.ts` or `.d.cts` file path.
 * @param options The options to use.
 */
export async function transformMtsDtsToCjsDts(
  dtsPath: string,
  dtsDestPath: string,
  options: Options = {},
): Promise<void> {
  const code = await fs.readFile(dtsPath, 'utf-8')
  const result = transformDtsDefaultCJSExports(
    code,
    dtsPath,
    options,
  ) ?? code
  // todo: we need to replace local imports extension to the correspondind one
  // todo: `import { foo } from './foo.mjs'` -> `import { foo } from './foo.c?js'`
  // todo: use dtsDestPath extension to replace local imports
  await fs.writeFile(dtsDestPath, result, 'utf8')
}
