import type { ESMExport, StaticImport } from 'mlly'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  findExports,
  findStaticImports,
  findTypeExports,
  parseStaticImport,
} from 'mlly'
import { resolve } from 'pathe'
import { build } from 'unbuild'
import { describe, expect, it } from 'vitest'

describe('node10 and Node16 Default Exports Types', () => {
  const dtsFiles = /\.d\.c?ts$/

  async function readDtsFiles(
    dist: string,
  ): Promise<
      [
      name: string,
      types: ESMExport[],
      exports: ESMExport[],
      content: string,
      imports: StaticImport[],
      ][]
    > {
    const files = await readdir(dist).then(files =>
      files.filter(f => dtsFiles.test(f)).map(f => [f, resolve(dist, f)]),
    )
    return await Promise.all(
      files.map(async ([name, path]) => {
        const content = await readFile(path, 'utf8')
        return [
          name,
          findTypeExports(content),
          findExports(content),
          content,
          findStaticImports(content),
        ]
      }),
    )
  }

  it('mixed Declaration Types', async () => {
    const root = resolve(
      fileURLToPath(import.meta.url),
      '../fixtures/mixed-declarations',
    )
    await build(root, false)
    const files = await readDtsFiles(resolve(root, 'dist'))
    expect(files).toHaveLength(2)
    for (const [name, types, exports] of files) {
      expect(exports).toHaveLength(0)
      expect(types).toHaveLength(1)
      expect(
        types.find(e => e.names.includes('default')),
        `${name} should not have a default export`,
      ).toBeUndefined()
    }
    expect(files).toMatchSnapshot()
  })

  it('re-Export Types', async () => {
    const warnings: string[] = []
    const root = resolve(
      fileURLToPath(import.meta.url),
      '../fixtures/reexport-types',
    )
    await build(root, false, {
      hooks: {
        'rollup:options': (_, options) => {
          const _onwarn = options.onwarn
          options.onwarn = (warning, handler) => {
            if (warning.code === 'EMPTY_BUNDLE') {
              warnings.push(warning.message)
              return
            }
            return _onwarn?.(warning, handler)
          }
        },
      },
    })
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toBe('Generated an empty chunk: "types".')
    expect(warnings[1]).toBe('Generated an empty chunk: "types".')
    const files = await readDtsFiles(resolve(root, 'dist'))
    expect(files).toHaveLength(6)
    for (const [name, types, exports, content, imports] of files) {
      if (name.startsWith('types')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(1)
        expect(
          types.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
      }
      else if (name.startsWith('index')) {
        expect(exports).toHaveLength(2)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        expect(content).toMatch('export = plugin')
      }
      else if (name.startsWith('all')) {
        expect(exports).toHaveLength(2)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.defaultImport).toBe('_default')
        expect(content).toMatch(`export = ${defaultImport.defaultImport}`)
      }
    }
    expect(files).toMatchSnapshot()
  })

  it('re-Export as default', async () => {
    const root = resolve(
      fileURLToPath(import.meta.url),
      '../fixtures/reexport-default',
    )
    await build(root, false)
    const files = await readDtsFiles(resolve(root, 'dist'))
    expect(files).toHaveLength(10)
    for (const [name, types, exports, content, imports] of files) {
      if (name.startsWith('asdefault')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          types.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.namedImports?.resolve).toBeDefined()
        expect(content).toMatch(`export = resolve`)
      }
      else if (name.startsWith('index')) {
        expect(exports).toHaveLength(1)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.defaultImport).toBe('MagicString')
        expect(content).toMatch(`export = ${defaultImport.defaultImport}`)
      }
      else if (name.startsWith('magicstringasdefault')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(0)
        expect(imports.filter(i => !!i.imports)).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.defaultImport).toBe('_default')
        expect(content).toMatch(`export = ${defaultImport.defaultImport}`)
      }
      else if (name.startsWith('resolvedasdefault')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(0)
        expect(imports.filter(i => !!i.imports)).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.defaultImport).toBe('resolve')
        expect(content).toMatch(`export = ${defaultImport.defaultImport}`)
      }
      else if (name.startsWith('defaultclass')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(0)
        expect(imports.filter(i => !!i.imports)).toHaveLength(0)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        expect(content).toMatch(`export = DefaultClass`)
      }
    }
    expect(files).toMatchSnapshot()
  })
})
