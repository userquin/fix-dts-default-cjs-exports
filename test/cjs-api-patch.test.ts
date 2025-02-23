import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultLocalImportsTransformer,
  fixDtsFileDefaultCJSExports,
  transformDtsDefaultCJSExports,
  transformESMDtsToCJSDts,
} from '../src'

describe('api: test patching dts files', () => {
  const dMts = path.resolve(`./test/cjs-types-fixture/patch-dts/index.d.mts`)
  const dTs = path.resolve(`./test/cjs-types-fixture/patch-dts/index.d.ts`)
  it('patching and generating works', async () => {
    const dcts = path.resolve(`./test/cjs-types-fixture/patch-dts/index-patched.d.cts`)
    const dts = path.resolve(`./test/cjs-types-fixture/patch-dts/index-patched.d.ts`)
    await Promise.all([
      fs.rm(dcts, { force: true }),
      fs.rm(dts, { force: true }),
    ])
    await fs.cp(dMts, dcts)
    await fixDtsFileDefaultCJSExports(dcts)
    let content = await fs.readFile(dcts, 'utf-8')
    expect(content).toContain('export = resolve')
    await transformESMDtsToCJSDts(
      dMts,
      dts,
    )
    content = await fs.readFile(dts, 'utf-8')
    expect(content).toContain('export = resolve')
    expect(content).toContain('export type * from \'./types.js\'')
    content = transformDtsDefaultCJSExports(
      await fs.readFile(dTs, 'utf-8'),
      dcts,
    )!
    content = defaultLocalImportsTransformer(
      content,
      dTs,
      dcts,
    )
    expect(content).toContain('export = resolve')
    expect(content).toContain('export type * from \'./types.cjs\'')
  })
  it ('transformESMDtsToCJSDts should throw if dtsPath and dtsDestPath are the same', async () => {
    await expect(transformESMDtsToCJSDts(dMts, dMts)).rejects.toThrowError()
  })
  it ('no transform when there is no default export', async () => {
    const dts = path.resolve(`./test/cjs-types-fixture/patch-dts/no-transform.d.ts`)
    const content = await fs.readFile(dts, 'utf-8')
    const transformed = transformDtsDefaultCJSExports(content, dts)
    expect(transformed).toBeUndefined()
  })
  it ('no file transform when there is no default export', async () => {
    const dts = path.resolve(`./test/cjs-types-fixture/patch-dts/no-transform.d.ts`)
    const result = path.resolve(`./test/cjs-types-fixture/patch-dts/no-transform-patched.d.cts`)
    await fs.rm(result, { force: true })
    await transformESMDtsToCJSDts(
      dts,
      result,
    )
    const content = await fs.readFile(result, 'utf-8')
    expect(content).toContain('export { plugin }')
  })
})
