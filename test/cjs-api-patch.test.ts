import { cp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultLocalImportsTransformer,
  fixDtsFileDefaultCJSExports,
  transformDtsDefaultCJSExports,
  transformESMDtsToCJSDts,
} from '../src'

describe('api: test patching dts files', () => {
  const dMts = resolve(`./test/fixtures/patch-dts/index.d.mts`)
  const dTs = resolve(`./test/fixtures/patch-dts/index.d.ts`)
  it('patching and generating works', async () => {
    const dcts = resolve(`./test/fixtures/patch-dts/index-patched.d.cts`)
    const dts = resolve(`./test/fixtures/patch-dts/index-patched.d.ts`)
    await Promise.all([
      rm(dcts, { force: true }),
      rm(dts, { force: true }),
    ])
    await cp(dMts, dcts)
    await fixDtsFileDefaultCJSExports(dcts)
    let content = await readFile(dcts, 'utf-8')
    expect(content).toContain('export = resolve')
    await transformESMDtsToCJSDts(
      dMts,
      dts,
    )
    content = await readFile(dts, 'utf-8')
    expect(content).toContain('export = resolve')
    expect(content).toContain('export type * from \'./types.js\'')
    content = transformDtsDefaultCJSExports(
      await readFile(dTs, 'utf-8'),
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
    const dts = resolve(`./test/fixtures/patch-dts/no-transform.d.ts`)
    const content = await readFile(dts, 'utf-8')
    const transformed = transformDtsDefaultCJSExports(content, dts)
    expect(transformed).toBeUndefined()
  })
  it ('no file transform when there is no default export', async () => {
    const dts = resolve(`./test/fixtures/patch-dts/no-transform.d.ts`)
    const result = resolve(`./test/fixtures/patch-dts/no-transform-patched.d.cts`)
    await rm(result, { force: true })
    await transformESMDtsToCJSDts(
      dts,
      result,
    )
    const content = await readFile(result, 'utf-8')
    expect(content).toContain('export { plugin }')
  })
})
