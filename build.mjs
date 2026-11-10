// Bundles the plugin with esbuild.
//   node build.mjs          dist/code.js (main thread) and dist/ui.html (panel, script inlined)
//   node build.mjs --watch  same, rebuilding on change
//   node build.mjs --core   out/core.mjs, the editor-independent code, for the unit tests
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const args = new Set(process.argv.slice(2));

if (args.has('--core')) {
  await esbuild.build({
    entryPoints: ['src/core/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: 'out/core.mjs',
    logLevel: 'warning',
  });
} else {
  // The plugin sandbox is not a browser and not Node: one classic script, ES2017 syntax to be safe.
  const code = {
    entryPoints: ['src/plugin/code.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2017',
    outfile: 'dist/code.js',
    logLevel: 'warning',
  };
  // The panel is one HTML file: Figma loads `ui` as a string, so the script is inlined.
  const inlineUi = {
    name: 'inline-ui',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return;
        const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
        const html = fs.readFileSync('src/ui/ui.html', 'utf8').replace('<script>/*UI_SCRIPT*/</script>', () => `<script>\n${js}</script>`);
        fs.mkdirSync('dist', { recursive: true });
        fs.writeFileSync('dist/ui.html', html);
      });
    },
  };
  const ui = {
    entryPoints: ['src/ui/ui.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    outfile: 'dist/ui.js',
    logLevel: 'warning',
    plugins: [inlineUi],
  };
  if (args.has('--watch')) {
    for (const opts of [code, ui]) await (await esbuild.context(opts)).watch();
    console.log('watching src/ ...');
  } else {
    await Promise.all([esbuild.build(code), esbuild.build(ui)]);
  }
}
