/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bundle Tests', () => {
	it('ESM bundle should export ExperimentationService', async () => {
		const esmPath = path.resolve(__dirname, '../dist/index.mjs');
		const { ExperimentationService } = await import(esmPath);
		expect(ExperimentationService).toBeDefined();
		expect(typeof ExperimentationService).toBe('function');
	});

	it('CommonJS bundle should export ExperimentationService', async () => {
		const cjsPath = path.resolve(__dirname, '../dist/index.cjs');
		const module = await import(cjsPath);
		expect(module.ExperimentationService).toBeDefined();
		expect(typeof module.ExperimentationService).toBe('function');
	});
});
