import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// DSH client-modules loads a lazy CommonJS factory; React remains the shell's
// singleton, not a second bundled runtime. No Vite/replacement Web server.
await build({
  absWorkingDir: root,
  entryPoints: ['src/client.js'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  external: ['react'],
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-executor-model", factory: (require) => { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
  legalComments: 'none',
});
console.log('Built dsh-executor-model/lib/client.js');
