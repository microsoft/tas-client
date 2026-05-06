/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { build } from 'esbuild';
import { mkdirSync, copyFileSync, globSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function bundle() {
    const outDir = join(root, 'dist');
    mkdirSync(outDir, { recursive: true });

    const copyright = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/`;

    // Build ESM bundle
    const esmResult = await build({
        entryPoints: [join(root, 'src', 'index.ts')],
        bundle: true,
        target: 'es2022',
        metafile: true,
        external: ['http', 'https'],
        sourcemap: true,
        minify: true,
        format: 'esm',
        banner: { js: copyright },
        outfile: join(outDir, 'tas-client.min.js'),
    });

    const esmOutputs = Object.keys(esmResult.metafile.outputs);
    const esmOutput = esmOutputs.find(o => o.endsWith('tas-client.min.js'));
    if (esmOutput) {
        const size = esmResult.metafile.outputs[esmOutput].bytes;
        console.log(`✓ ESM bundle created: ${esmOutput} (${(size / 1024).toFixed(2)} KB)`);
    }

    // Copy type declarations from out to dist
    try {
        copyFileSync(join(root, 'out', 'src', 'index.d.ts'), join(outDir, 'tas-client.d.ts'));
        console.log('✓ Type declarations copied to dist/tas-client.d.ts');
        
        // Copy other declaration files which `tas-client.d.ts` may also reference.
        const outSrcDir = join(root, 'out', 'src');
        const dtsFiles = globSync('**/*.d.ts', { 
            cwd: outSrcDir,
            ignore: 'index.d.ts'
        });
        
        for (const file of dtsFiles) {
            const srcPath = join(outSrcDir, file);
            const destPath = join(outDir, file);
            mkdirSync(dirname(destPath), { recursive: true });
            copyFileSync(srcPath, destPath);
        }
        
        if (dtsFiles.length > 0) {
            console.log(`✓ Copied ${dtsFiles.length} supporting type declaration files to dist/`);
        }
    } catch (err) {
        console.warn('Warning: Could not copy type declarations. Make sure to run `npm run compile` first.');
        console.warn(err);
    }
}

bundle().catch(err => {
    console.error('Bundle failed:', err);
    process.exit(1);
});
