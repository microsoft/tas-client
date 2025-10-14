/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';

const sharedConfig = {
	entryPoints: ['./out/src/index.js'],
	bundle: true,
	sourcemap: true,
	platform: 'node',
	target: 'es2022',
	external: [],
};

// Build CommonJS bundle
await esbuild.build({
	...sharedConfig,
	format: 'cjs',
	outfile: './dist/index.cjs',
});

// Build ESM bundle
await esbuild.build({
	...sharedConfig,
	format: 'esm',
	outfile: './dist/index.mjs',
});

console.log('Bundle created successfully!');
