// Optional hardening: bundle genlayer-js into public/vendor/genlayer.js so the site never loads
// code from a CDN. The app tries /vendor/genlayer.js first and falls back to esm.sh.
//
//   npm install && npm run vendor
// Then you can drop https://esm.sh from script-src in public/_headers.
import { build } from 'esbuild';

await build({
  stdin: {
    contents: "export { createClient, createAccount } from 'genlayer-js';\nexport { studionet } from 'genlayer-js/chains';",
    resolveDir: process.cwd(), loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
  outfile: 'public/vendor/genlayer.js',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
});
console.log('wrote public/vendor/genlayer.js');
