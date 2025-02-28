import type { ESMExport, StaticImport } from 'mlly'
import { lstat, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { findExports, findStaticImports, findTypeExports, parseStaticImport } from 'mlly'
import { describe, expect, it } from 'vitest'
import { defaultLocalImportsTransformer, transformDtsDefaultCJSExports } from '../src'

type CodeInfo = [
  name: string,
  types: ESMExport[],
  exports: ESMExport[],
  content: string,
  imports: StaticImport[],
]

describe('api: node10 and Node16 Default Exports Types', () => {
  const root = resolve('./test/fixtures')
  function resolveFile(name: string) {
    return resolve(root, name)
  }
  function extractInfo(content: string, name: string): CodeInfo {
    return [
      name,
      findTypeExports(content),
      findExports(content),
      content,
      findStaticImports(content),
    ]
  }

  async function awaitDistFile(path: string) {
    while (!(await lstat(path).then(s => s.isFile()).catch(() => false))) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  async function awaitDist(path: string) {
    await Promise.race([
      awaitDistFile(path),
      new Promise((_, reject) => setTimeout(() => {
        reject(new Error(`Timeout waiting for ${path}`))
      }, 20_000)),
    ])
  }

  it('api: mixed declarations', async () => {
    const mts = 'index.d.mts'
    const file = resolveFile(`mixed-declarations/dist/${mts}`)
    await awaitDist(file)
    const code = await readFile(file, 'utf-8')
    let content = transformDtsDefaultCJSExports(code, mts)
    expect(content).toBeDefined()
    content = defaultLocalImportsTransformer(
      content!,
      mts,
      mts.replace(/\.d\.mts$/, '.d.cts'),
    )
    expect(content).toMatchSnapshot()
    const [name, types, exports] = extractInfo(content!, 'mixed-declarations')
    expect(exports).toHaveLength(0)
    expect(types).toHaveLength(1)
    expect(
      types.find(e => e.names.includes('default')),
      `${name} should not have a default export`,
    ).toBeUndefined()
  })
  it('api: re-Export Types', async () => {
    const files = await Promise.all([
      'all',
      'index',
      'types',
    ].map(async (name) => {
      name = resolveFile(`reexport-types/dist/${name}.d.mts`)
      await awaitDist(name)
      const content = await readFile(name, 'utf8')
      const transformed = transformDtsDefaultCJSExports(content, name)
      // types.d.mts should not be transformed
      return [
        name,
        transformed,
        defaultLocalImportsTransformer(
          transformed ?? content,
          basename(name),
          basename(name).replace(/\.d\.mts$/, '.d.cts'),
        ),
      ] as const
    }))
    for (const file of files) {
      const [name, transformed, useContent] = file
      expect(useContent, `${name} content should be defined`).toBeDefined()
      if (name.endsWith('types.d.mts')) {
        expect(transformed, `${name} transform should be undefined`).toBeUndefined()
      }
      else {
        expect(transformed, `${name} transform should be defined`).toBeDefined()
      }
      expect(useContent).toMatchSnapshot()
      const [_name, types, exports, _content, imports] = extractInfo(useContent, name)
      if (name.endsWith('types.d.mts')) {
        expect(exports).toHaveLength(0)
        expect(types).toHaveLength(1)
        expect(
          types.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
      }
      else if (name.endsWith('index.d.mts')) {
        expect(exports).toHaveLength(2)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        expect(useContent).toMatch('export = plugin')
      }
      else if (name.endsWith('all.d.mts')) {
        expect(exports).toHaveLength(2)
        expect(types).toHaveLength(0)
        expect(imports).toHaveLength(1)
        expect(
          exports.find(e => e.names.includes('default')),
          `${name} should not have a default export`,
        ).toBeUndefined()
        const defaultImport = parseStaticImport(imports[0])
        expect(defaultImport.defaultImport).toBe('_default')
        expect(useContent).toMatch(`export = ${defaultImport.defaultImport}`)
      }
    }
  })
  it('api: re-Export as default', async () => {
    const files = await Promise.all([
      'asdefault',
      'defaultclass',
      'index',
      'magicstringasdefault',
      'resolveasdefault',
    ].map(async (name) => {
      name = resolveFile(`reexport-default/dist/${name}.d.mts`)
      await awaitDist(name)
      const content = await readFile(name, 'utf8')
      const transformed = transformDtsDefaultCJSExports(content, name)
      return [
        name,
        transformed,
        defaultLocalImportsTransformer(
          transformed ?? content,
          basename(name),
          basename(name).replace(/\.d\.mts$/, '.d.cts'),
        ),
      ] as const
    }))
    for (const file of files) {
      const [name, content, useContent] = file
      expect(content, `${name} transform should be defined`).toBeDefined()
      expect(useContent).toMatchSnapshot()
      const [_name, types, exports, _content, imports] = extractInfo(useContent, name)
      if (name.match(/[\\/]asdefault.d.mts$/)) {
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
      else if (name.endsWith('index.d.mts')) {
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
      else if (name.endsWith('magicstringasdefault.d.mts')) {
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
      else if (name.endsWith('resolvedasdefault.d.mts')) {
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
      else if (name.endsWith('defaultclass.d.mts')) {
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
  })
})
