import { rename, rm } from 'node:fs/promises'
import { build } from 'esbuild'
import ts from 'typescript'

await rm('dist', { recursive: true, force: true })

await Promise.all([
  build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/yhub.js',
    bundle: true,
    format: 'iife',
    globalName: 'YhubSDK',
    target: ['es2020'],
    minify: true,
    banner: { js: '/*! @yhub-cloud/sdk v1.0.0 */' },
    footer: { js: 'globalThis.yhub=YhubSDK.yhub;' },
  }),
  build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/yhub.esm.js',
    bundle: true,
    format: 'esm',
    target: ['es2020'],
    minify: true,
    banner: { js: '/*! @yhub-cloud/sdk v1.0.0 */' },
  }),
])

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), {
  emitDeclarationOnly: true,
})
const program = ts.createProgram(parsed.fileNames.filter(file => file.includes('/src/')), parsed.options)
const emit = program.emit()
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics]

if (diagnostics.length > 0) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }))
}

await rename('dist/index.d.ts', 'dist/yhub.d.ts')
