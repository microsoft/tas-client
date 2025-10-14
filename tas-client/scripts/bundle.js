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
        platform: 'neutral',
        format: 'iife',
        globalName: '__TasClientExports',
        target: 'es2022',
        metafile: true,
        logLevel: 'info',
        banner: {
            js: `(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else if (typeof exports === 'object' && typeof module !== 'undefined') {
        // CommonJS
        module.exports = factory();
    } else {
        // Browser globals
        root.TasClient = factory();
    }
}(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this, function () {`
        },
        footer: {
            js: `return __TasClientExports;
}));`
        },
        external: ['http', 'https']
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
