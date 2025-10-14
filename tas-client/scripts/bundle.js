import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function bundle() {
    const outDir = join(root, 'dist');
    mkdirSync(outDir, { recursive: true });

    const commonOptions = {
        entryPoints: [join(root, 'src', 'index.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'es2022',
        metafile: true,
        logLevel: 'info'
    };

    // Build non-minified bundle
    const result = await build({
        ...commonOptions,
        outfile: join(outDir, 'tas-client.js'),
        sourcemap: true,
        minify: false,
        keepNames: true
    });

    const meta = result.metafile;
    const outputs = Object.keys(meta.outputs);
    const mainOutput = outputs.find(o => o.endsWith('tas-client.js'));
    if (mainOutput) {
        const size = meta.outputs[mainOutput].bytes;
        console.log(`✓ Bundle created: ${mainOutput} (${(size / 1024).toFixed(2)} KB)`);
    }

    // Build minified bundle
    const minResult = await build({
        ...commonOptions,
        outfile: join(outDir, 'tas-client.min.js'),
        sourcemap: true,
        minify: true
    });

    const minMeta = minResult.metafile;
    const minOutputs = Object.keys(minMeta.outputs);
    const minOutput = minOutputs.find(o => o.endsWith('tas-client.min.js'));
    if (minOutput) {
        const size = minMeta.outputs[minOutput].bytes;
        console.log(`✓ Minified bundle created: ${minOutput} (${(size / 1024).toFixed(2)} KB)`);
    }
}

bundle().catch(err => {
    console.error('Bundle failed:', err);
    process.exit(1);
});
