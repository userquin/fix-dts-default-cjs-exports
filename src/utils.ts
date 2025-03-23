import type { ESMExport, ParsedStaticImport } from 'mlly'
import type { Span } from 'oxc-parser'
import { readFile, writeFile } from 'node:fs/promises'
import MagicString from 'magic-string'
import { findExports, findStaticImports, parseStaticImport } from 'mlly'
import { parseSync } from 'oxc-parser'

export interface CodeInfo {
  fileName: string
  imports: string[]
}

export interface Options {
  warn?: (message: string) => void
}

export function internalFixDefaultCJSExports(
  code: string,
  info: CodeInfo,
  options: Options,
): string | undefined {
  const parsedExports = extractExports(code, info, options)
  if (!parsedExports) {
    return
  }

  if (parsedExports.defaultExport.specifier) {
    const imports: ParsedStaticImport[] = []
    for (const imp of findStaticImports(code)) {
      // don't add empty imports like import 'pathe';
      if (!imp.imports) {
        continue
      }
      imports.push(parseStaticImport(imp))
    }
    const specifier = parsedExports.defaultExport.specifier
    const defaultImport = imports.find(i => i.specifier === specifier)
    return parsedExports.defaultExport._type === 'named'
    // export { resolve as default } from "pathe";
    // or (handleDefaultNamedCJSExport will call handleDefaultCJSExportAsDefault)
    // export { default } from "magic-string";
      ? handleDefaultNamedCJSExport(
          code,
          info,
          parsedExports,
          imports,
          options,
          defaultImport,
        )
    // export { default } from "magic-string";
    // or
    // import MagicString from 'magic-string';
    // export default MagicString;
      : handleDefaultCJSExportAsDefault(
        code,
        parsedExports,
        imports,
        info,
        options,
        defaultImport,
      ) || handleNoSpecifierDefaultCJSExport(code, info, parsedExports, options)
  }

  // export { xxx as default };
  return handleNoSpecifierDefaultCJSExport(code, info, parsedExports, options)
}

interface ParsedExports {
  defaultExport: ESMExport
  defaultAlias: string
  exports: string[]
}

function extractExports(
  code: string,
  info: CodeInfo,
  options: Options,
): ParsedExports | undefined {
  const defaultExport = findExports(code).find(e =>
    e.names.includes('default'),
  )

  if (!defaultExport) {
    options.warn?.(
      /* c8 ignore next */
      `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
    )
    return
  }

  const match = defaultExport.code.match(/export\s*\{([^}]*)\}/)
  /* c8 ignore next */
  if (!match?.length) {
    options.warn?.(
      `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
    )
    return
  }

  let defaultAlias: string | undefined
  const exportsEntries: string[] = []
  for (const exp of match[1].split(',').map(e => e.trim())) {
    if (exp === 'default') {
      defaultAlias = exp
      continue
    }
    const m = exp.match(/\s*as\s+default\s*/)
    if (m) {
      defaultAlias = exp.replace(m[0], '')
    }
    else {
      exportsEntries.push(exp)
    }
  }

  if (!defaultAlias) {
    options.warn?.(
      `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
    )
    return
  }

  return {
    defaultExport,
    defaultAlias,
    exports: exportsEntries,
  }
}

// export { default } from "magic-string";
// or
// import MagicString from 'magic-string';
// export default MagicString;
function handleDefaultCJSExportAsDefault(
  code: string,
  { defaultExport, exports }: ParsedExports,
  imports: ParsedStaticImport[],
  info: CodeInfo,
  options: Options,
  defaultImport?: ParsedStaticImport,
): string | undefined {
  if (defaultImport) {
    return exports.length === 0
      ? code.replace(
          defaultExport.code,
          `export = ${defaultImport.defaultImport}`,
        )
      : createCjsNamespace(
          code,
          code.replace(
            defaultExport.code,
            `// @ts-ignore
export = ${defaultImport.defaultImport};
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
          ),
          info,
          options,
        )
  }
  else {
    const magicString = new MagicString(code)
    // add the import after last import in the code
    const lastImportPosition
            = imports.length > 0 ? imports.at(-1)?.end || 0 : 0
    if (lastImportPosition > 0) {
      magicString.appendRight(
        lastImportPosition,
        `\nimport _default from '${defaultExport.specifier}';\n`,
      )
    }
    else {
      magicString.prepend(
        `import _default from '${defaultExport.specifier}';\n`,
      )
    }

    return exports.length > 0
      ? createCjsNamespace(
          code,
          magicString
            .replace(
              defaultExport.code,
              `// @ts-ignore
export = _default;
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
            )
            .toString(),
          info,
          options,
        )
      : magicString.replace(defaultExport.code, 'export = _default').toString()
  }
}

// export { resolve as default } from "pathe";
function handleDefaultNamedCJSExport(
  code: string,
  info: CodeInfo,
  parsedExports: ParsedExports,
  imports: ParsedStaticImport[],
  options: Options,
  defaultImport?: ParsedStaticImport | undefined,
): string | undefined {
  const { defaultAlias, defaultExport, exports } = parsedExports

  // export { default } from "magic-string";
  if (defaultAlias === 'default') {
    // mlly parsing with _type='named', but always as default
    // {
    //   type: 'default',
    //   exports: ' default',
    //   specifier: 'magic-string',
    //   names: [ 'default' ],
    //   name: 'default',
    //   _type: 'named'
    // }

    // doesn't matter the type, it's always default (maybe mlly bug?)

    // export { resolve as default } from 'pathe';
    // {
    //   type: 'default',
    //   exports: ' resolve as default',
    //   specifier: 'pathe',
    //   names: [ 'default' ],
    //   name: 'default',
    //   _type: 'named'
    // }

    // prevent calling handleDefaultCJSExportAsDefault
    // since we don't have the import name for the default export
    // defaultImport should be undefined
    if (defaultImport && !defaultImport.defaultImport) {
      options.warn?.(
        `Cannot parse default export name from ${defaultImport.specifier} import at ${info.fileName}!.`,
      )
      return
    }

    return handleDefaultCJSExportAsDefault(
      code,
      parsedExports,
      imports,
      info,
      options,
      defaultImport,
    )
  }

  if (defaultImport) {
    // we need to add the named import to the default import
    const namedExports = defaultImport.namedImports
    if (namedExports?.[defaultAlias] === defaultAlias) {
      return exports.length === 0
        ? code.replace(defaultExport.code, `export = ${defaultAlias}`)
        : createCjsNamespace(
            code,
            code.replace(
              defaultExport.code,
              `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(', ')} }`,
            ),
            info,
            options,
          )
    }
    else {
      options.warn?.(
        `Cannot parse "${defaultAlias}" named export from ${defaultImport.specifier} import at ${info.fileName}!.`,
      )
      return undefined
    }
  }

  // we need to add the import
  const magicString = new MagicString(code)
  // add the import after last import in the code
  const lastImportPosition = imports.length > 0 ? imports.at(-1)?.end || 0 : 0
  if (lastImportPosition > 0) {
    magicString.appendRight(
      lastImportPosition,
      `\nimport { ${defaultAlias} } from '${defaultExport.specifier}';\n`,
    )
  }
  else {
    magicString.prepend(
      `import { ${defaultAlias} } from '${defaultExport.specifier}';\n`,
    )
  }

  return exports.length > 0
    ? createCjsNamespace(
        code,
        magicString
          .replace(
            defaultExport.code,
            `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
          )
          .toString(),
        info,
        options,
      )
    : magicString
        .replace(defaultExport.code, `export = ${defaultAlias}`)
        .toString()
}

// export { xxx as default };
function handleNoSpecifierDefaultCJSExport(
  code: string,
  info: CodeInfo,
  { defaultAlias, defaultExport, exports }: ParsedExports,
  options: Options,
): string | undefined {
  let exportStatement = exports.length > 0 ? undefined : ''

  // replace export { type A, type B, type ... } with export type { A, B, ... }
  // that's, if all remaining exports are type exports, replace export {} with export type {}
  if (exportStatement === undefined) {
    let someExternalExport = false
    const typeExportRegexp = /\s*type\s+/
    const allRemainingExports = exports.map((exp) => {
      if (someExternalExport) {
        return [exp, ''] as const
      }
      if (!info.imports.includes(exp)) {
        const m = exp.match(typeExportRegexp)
        if (m) {
          const name = exp.replace(m[0], '').trim()
          if (!info.imports.includes(name)) {
            return [exp, name] as const
          }
        }
      }
      someExternalExport = true
      return [exp, ''] as const
    })
    exportStatement = someExternalExport
      ? `;\nexport { ${allRemainingExports.map(([e, _]) => e).join(', ')} }`
      : `;\nexport type { ${allRemainingExports.map(([_, t]) => t).join(', ')} }`
  }

  return exportStatement.length === 0
    ? code.replace(defaultExport.code, `export = ${defaultAlias}`)
    : createCjsNamespace(
        code,
        `// @ts-ignore\n${defaultAlias}${exportStatement}`,
        info,
        options,
      )
}

interface Decl extends Span {
  declare: boolean
  isClass?: boolean
  isVariable?: boolean
}

interface DefaultExport extends Span {
  local: string
}
interface Export {
  type: boolean
}

type Declaration =
  | import('oxc-parser').VariableDeclaration
  | import('oxc-parser').Function
  | import('oxc-parser').Class
  | import('oxc-parser').TSTypeAliasDeclaration
  | import('oxc-parser').TSInterfaceDeclaration
  | import('oxc-parser').TSEnumDeclaration

function prepareDeclaration(
  decls: Map<string, Decl>,
  decl: Declaration,
  unnamed: () => string,
) {
  // VariableDeclaration
  if ('declarations' in decl && decl.declarations.length > 0) {
    const id = decl.declarations[0].id
    if (id.type === 'Identifier') {
      decls.set(id.name, {
        start: decl.start,
        end: decl.end,
        declare: decl.declare === true,
        isVariable: true,
      })
      return
    }
  }

  // TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration, Function and Class
  if ('id' in decl && decl.id && decl.id.type === 'Identifier') {
    const name = decl.id.name
    decls.set(name, {
      start: decl.start,
      end: decl.end,
      declare: decl.declare === true,
      isClass: decl.type === 'ClassDeclaration',
    })

    return
  }

  decls.set(unnamed(), {
    start: decl.start,
    end: decl.end,
    declare: decl.declare === true,
  })
}

function createCjsNamespace(
  code: string,
  transformedCode: string,
  info: CodeInfo,
  options: Options,
): string {
  const parsed = parseSync(info.fileName, code, {
    lang: 'ts',
    astType: 'ts',
    sourceType: 'module',
  })

  const declarations = new Map<string, Decl>()
  let defaultExport: DefaultExport | undefined
  const exports = new Map<string, Export>()
  const program = parsed.program
  let unnamed = 0
  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      for (const exp of node.specifiers) {
        if (exp.exported.type === 'Identifier') {
          if (exp.exported.name === 'default') {
            if (exp.local.type === 'Identifier') {
              defaultExport = { local: exp.local.name, start: exp.start, end: exp.end }
            }
          }
          else {
            if (exp.exported.type === 'Identifier') {
              exports.set(exp.exported.name, { type: exp.exportKind === 'type' })
            }
          }
        }
      }
    }
    else {
      // todo: we need to review the types here since we need to write the original declarations
      switch (node.type) {
        // almost type Declaration: omit TSModuleDeclaration and TSImportEqualsDeclaration
        case 'VariableDeclaration':
        case 'FunctionDeclaration':
        case 'TSDeclareFunction':
        case 'ClassDeclaration':
        case 'TSTypeAliasDeclaration':
        case 'TSInterfaceDeclaration':
        case 'TSEnumDeclaration':
          prepareDeclaration(declarations, node, () => `__unnamed_${unnamed++}$$`)
          break
        case 'TSModuleDeclaration':
        case 'ImportDeclaration':
        case 'TSImportEqualsDeclaration':
          declarations.set(`__unnamed_${unnamed++}$$`, {
            start: node.start,
            end: node.end,
            declare: false,
          })
          break
      }
    }
  }
  if (!defaultExport) {
    options.warn?.(`Cannot infer default export from the file: ${info.fileName}`)
    return transformedCode
  }

  const defaultLocalExport = declarations.get(defaultExport.local)

  if (!defaultLocalExport) {
    options.warn?.(`Cannot infer default export from the file: ${info.fileName}`)
    return code
  }

  if (defaultLocalExport.isVariable) {
    options.warn?.(`Cannot use default export with a variable: ${code.slice(defaultLocalExport.start, defaultLocalExport.end)}`)
    return code
  }

  // when using export default with a class we need to add the name as prefix in the options:
  // declare class SomeClass { parent: SomeClass, b: OtherType, ... }
  // becomes:
  // declare class SomeClass { parent: SomeClass.SomeClass, b: SomeClass.OtherType, ... }
  // where SomeClass is the namespace:
  // declare namespace SomeClass {
  //   export interface OtherType { ... }
  //   import default SomeClass;
  //   export { _default as default };
  // }
  // export = SomeClass;
  const classDeclarationRegexp = defaultLocalExport.isClass
    ? new RegExp(`\\s*${defaultLocalExport.declare ? 'declare\\s+' : ''}class\\s+${defaultExport.local}\\s+{\\s+`)
    : undefined
  const useExports: string[] = []
  for (const name of exports.keys()) {
    // exclude the default export from the useExports to avoid replacing
    // its declaration with the namespace prefix
    if (name === defaultExport.local) {
      continue
    }
    useExports.push(name)
  }
  const replaceRegExp = new RegExp(`(${useExports.join('|')})`, 'g')

  const applyReplacements = (text: string) => {
    const classDeclaration = classDeclarationRegexp?.exec(text)
    let prefix: string | undefined
    let useText = text
    if (classDeclaration?.length) {
      prefix = text.slice(0, classDeclaration[0].length)
      useText = text.slice(classDeclaration[0].length)
    }
    useText = useText.replace(replaceRegExp, `${defaultExport.local}.$1`)
    if (prefix)
      useText = `${prefix}${useText}`

    return useText
  }

  // write the default export declaration applying the replacements with available declarations
  const ms = new MagicString(
    `${applyReplacements(code.slice(defaultLocalExport.start, defaultLocalExport.end))}
declare namespace ${defaultExport.local} {
`,
  )
  // write the declarations
  for (const [name, decl] of declarations.entries()) {
    if (name === defaultExport.local) {
      continue
    }
    const chunk = code.slice(decl.start, decl.end)
    ms.append('    ')
    // replace declare with export
    if (decl.declare) {
      ms.append(chunk.replace('declare', 'export').replaceAll('    ', '        ').replace('}', '    }'))
    }
    else {
      ms.append(`export ${chunk}`.replaceAll('    ', '        ').replace('}', '    }'))
    }
    ms.append('\n')
  }
  // include the default export to allow use default export or the declaration
  ms.append(`    import _default = ${defaultExport.local};\n    export { _default as default };\n`)
  ms.append(`}\nexport = ${defaultExport.local};\n`)
  return ms.toString()
}

async function main(files: string[]) {
  for (const file of files) {
    const code = await readFile(file, 'utf-8')
    console.log(`****************${file}****************`)
    const result = internalFixDefaultCJSExports(code, {
      fileName: file,
      imports: [],
    }, {
      warn(message) {
        console.warn(message)
      },
    })
    if (result) {
      await writeFile(file, result, 'utf-8')
    }
  }
}

main([
  '../test/fixtures/mixed-declarations/dist/index.d.ts',
  '../test/fixtures/mixed-declarations/dist/index.d.cts',
  '../test/fixtures/mixed-declarations/dist/defaultclass.d.ts',
  '../test/fixtures/mixed-declarations/dist/defaultclass.d.cts',
  '../test/fixtures/mixed-declarations/dist/defaultconst.d.ts',
  '../test/fixtures/mixed-declarations/dist/defaultconst.d.cts',
  // '../test/fixtures/reexport-default/dist/asdefault.d.ts',
  // '../test/fixtures/reexport-default/dist/defaultclass.d.ts',
  // '../test/fixtures/reexport-default/dist/index.d.ts',
  // '../test/fixtures/reexport-default/dist/magicstringasdefault.d.ts',
  // '../test/fixtures/reexport-default/dist/resolveasdefault.d.ts',
])
