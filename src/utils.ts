import type { ESMExport, ParsedStaticImport } from 'mlly'
import MagicString from 'magic-string'
import { findExports, findStaticImports, parseStaticImport } from 'mlly'

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
        defaultImport,
      ) || handleNoSpecifierDefaultCJSExport(code, info, parsedExports)
  }

  // export { xxx as default };
  return handleNoSpecifierDefaultCJSExport(code, info, parsedExports)
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
  defaultImport?: ParsedStaticImport,
): string | undefined {
  if (defaultImport) {
    return exports.length === 0
      ? code.replace(
          defaultExport.code,
          `export = ${defaultImport.defaultImport}`,
        )
      : code.replace(
          defaultExport.code,
          `// @ts-ignore
export = ${defaultImport.defaultImport};
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
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
      ? magicString
          .replace(
            defaultExport.code,
            `// @ts-ignore
export = _default;
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
          )
          .toString()
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
      defaultImport,
    )
  }

  if (defaultImport) {
    // we need to add the named import to the default import
    const namedExports = defaultImport.namedImports
    if (namedExports?.[defaultAlias] === defaultAlias) {
      return exports.length === 0
        ? code.replace(defaultExport.code, `export = ${defaultAlias}`)
        : code.replace(
            defaultExport.code,
            `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(', ')} }`,
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
    ? magicString
        .replace(
          defaultExport.code,
          `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(', ')} } from '${defaultExport.specifier}'`,
        )
        .toString()
    : magicString
        .replace(defaultExport.code, `export = ${defaultAlias}`)
        .toString()
}

// export { xxx as default };
function handleNoSpecifierDefaultCJSExport(
  code: string,
  info: CodeInfo,
  { defaultAlias, defaultExport, exports }: ParsedExports,
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

  return code.replace(
    defaultExport.code,
    `${exportStatement.length > 0 ? '// @ts-ignore\n' : ''}export = ${defaultAlias}${exportStatement}`,
  )
}
