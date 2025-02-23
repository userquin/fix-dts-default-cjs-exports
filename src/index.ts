import type { Options } from './utils'
import fs from 'node:fs/promises'
import { internalFixDefaultCJSExports } from './utils'

export type { Options }

/**
 * Fix default exports.
 *
 * **WARNING**: this function doesn't handle local imports/exports transformations.
 *
 * @param code The code to transform.
 * @param fileName The file name.
 * @param options The options to be used.
 * @return The transformed code or `undefined` if no transformation was needed.
 */
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

/**
 * Fix default exports in the file and writes the changes to the file when needed, otherwise the files remains untouched.
 *
 * @param dtsPath The path to the file to fix.
 * @param options The path
 */
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

export interface TransformOptions {
  warn?: (message: string) => void
  transformLocalImports?: (
    code: string,
    dtsPath: string,
    dtsDestPath: string,
  ) => string
}

/**
 * Given an `ESM` dts file, transform it to a `d.ts` or `d.cts` file fixing CJS default exports changing the import/exports when needed.
 *
 * @param dtsPath The source `ESM` (`d.ts` or `.d.mts`) file path.
 * @param dtsDestPath The destination `.d.ts` or `.d.cts` file path.
 * @param options The options to use.
 * @see {@link defaultLocalImportsTransformer}
 */
export async function transformESMDtsToCJSDts(
  dtsPath: string,
  dtsDestPath: string,
  options: TransformOptions = {},
): Promise<void> {
  if (dtsPath === dtsDestPath) {
    throw new Error(`dtsPath and dtsDestPath should be different: ${dtsPath}`)
  }
  const code = await fs.readFile(dtsPath, 'utf-8')
  const result = transformDtsDefaultCJSExports(
    code,
    dtsPath,
    options,
  ) ?? code

  const { transformLocalImports = defaultLocalImportsTransformer } = options

  await fs.writeFile(
    dtsDestPath,
    transformLocalImports(result, dtsPath, dtsDestPath),
    'utf8',
  )
}

/**
 * Given an `ESM` dts file, transform it to a `d.ts` or `d.cts` file fixing CJS default exports.
 *
 * **NOTE**: local imports/exports will be replaced with the corresponding extension using source and destination files:
 * - when `dtsPath` is a `.d.ts` and `dtsDestPath` is a `d.cts`: `import { foo } from './foo.js'` -> `import { foo } from './foo.cjs'`
 * - when `dtsPath` is a `.d.mts` and `dtsDestPath` is a `d.ts`: `import { foo } from './foo.mjs'` -> `import { foo } from './foo.js'`
 * - when `dtsPath` is a `.d.mts` and `dtsDestPath` is a `d.cts`: `import { foo } from './foo.mjs'` -> `import { foo } from './foo.cjs'`
 *
 * @param code The code to transform.
 * @param dtsPath The source `ESM` (`d.ts` or `.d.mts`) file path.
 * @param dtsDestPath The destination `.d.ts` or `.d.cts` file path.
 * @return The transformed code.
 */
export function defaultLocalImportsTransformer(
  code: string,
  dtsPath: string,
  dtsDestPath: string,
): string {
  // import { foo } from './foo.m?js'
  // import { foo } from '../foo.m?js'
  // export { foo } from './foo.m?js'
  // export { foo } from '../foo.m?js'
  const from = dtsPath.endsWith('.d.mts')
    ? /\s+(from\s+["'].\.?\/.*(\.mjs)["'];?)\s+/g
    : /\s+(from\s+["'].\.?\/.*(\.js)["'];?)\s+/g
  let matcher = from.exec(code)
  if (!matcher) {
    return code
  }
  const extension = dtsDestPath.endsWith('d.ts') ? '.js' : '.cjs'
  while (matcher) {
    code = code.replaceAll(matcher[1], matcher[1].replace(matcher[2], extension))
    matcher = from.exec(code)
  }
  return code
}
