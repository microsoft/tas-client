/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function bundle() {
    const outDir = join(root, 'dist');
    mkdirSync(outDir, { recursive: true });

    // Build minified bundle
    const result = await build({
        entryPoints: [join(root, 'src', 'index.ts')],
        bundle: true,
        format: 'iife',
        globalName: '__TasClientExports',
        target: 'es2022',
        metafile: true,
        banner: {
            js: `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else {
        root.TasClient = factory();
    }
}(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this, function () {`
        },
        footer: {
            js: `return __TasClientExports;
}));`
        },
        external: ['http', 'https'],
        outfile: join(outDir, 'tas-client.min.js'),
        sourcemap: true,
        minify: true
    });

    const meta = result.metafile;
    const outputs = Object.keys(meta.outputs);
    const mainOutput = outputs.find(o => o.endsWith('tas-client.min.js'));
    if (mainOutput) {
        const size = meta.outputs[mainOutput].bytes;
        console.log(`✓ Minified bundle created: ${mainOutput} (${(size / 1024).toFixed(2)} KB)`);
    }

    // Copy type declarations from out to dist
    try {
        copyFileSync(join(root, 'out', 'src', 'index.d.ts'), join(outDir, 'tas-client.d.ts'));
        console.log('✓ Type declarations copied to dist/tas-client.d.ts');
    } catch (err) {
        console.warn('Warning: Could not copy type declarations. Make sure to run `npm run compile` first.');
    }
}

bundle().catch(err => {
    console.error('Bundle failed:', err);
    process.exit(1);
});
