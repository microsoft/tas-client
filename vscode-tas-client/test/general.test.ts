/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vi, describe, it, expect } from 'vitest';

vi.mock('vscode', () => ({
    version: '1.85.0',
    env: {
        appName: 'Visual Studio Code',
        machineId: 'test-machine-id',
        language: 'en',
    },
}));

import {
    VSCodeFilterProvider,
    TargetPopulation,
    Filters,
} from '../src/vscode-tas-client/VSCodeFilterProvider';
import * as fs from 'fs';
import * as path from 'path';

describe('General Tests', () => {
    it('Should provide default filters for tas client', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            'extension_version',
            TargetPopulation.Internal,
        );
        const filters = filterProvider.getFilters();
        expect(filters.size).toBeGreaterThan(0);
    });

    it('Should remove tag suffix for extension version', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            '1.2.3-dev',
            TargetPopulation.Internal,
        );
        const filter = filterProvider.getFilterValue(Filters.ExtensionVersion);
        expect(filter).toBe('1.2.3');
    });

    it('Should return extension version as-is if it has no suffix', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            '1.2.3',
            TargetPopulation.Internal,
        );
        const filter = filterProvider.getFilterValue(Filters.ExtensionVersion);
        expect(filter).toBe('1.2.3');
    });
});

describe('Package.json validation', () => {
    const packageDir = path.resolve(__dirname, '..');
    const pkgJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'));
    const tsconfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'tsconfig.json'), 'utf-8'));
    const outDir = (tsconfig.compilerOptions?.outDir ?? '.')
        .replace(/^\.\//, '')
        .replace(/\/$/, '');
    const rootDir = tsconfig.compilerOptions?.rootDir ?? '.';

    it('main field should point into tsconfig outDir', () => {
        const normalizedMain = pkgJson.main.replace(/^\.\//, '');
        expect(normalizedMain.startsWith(outDir + '/')).toBe(true);
    });

    it('main field should have a corresponding source file', () => {
        const normalizedMain = pkgJson.main.replace(/^\.\//, '');
        const relativeToOutDir = normalizedMain.slice(outDir.length + 1);
        const sourcePath = path.join(packageDir, rootDir, relativeToOutDir.replace(/\.js$/, '.ts'));
        expect(fs.existsSync(sourcePath)).toBe(true);
    });

    it('types field should point into tsconfig outDir', () => {
        if (!pkgJson.types) {
            return;
        }
        const normalizedTypes = pkgJson.types.replace(/^\.\//, '');
        expect(normalizedTypes.startsWith(outDir + '/')).toBe(true);
    });

    it('types field should have a corresponding source file', () => {
        if (!pkgJson.types) {
            return;
        }
        const normalizedTypes = pkgJson.types.replace(/^\.\//, '');
        const relativeToOutDir = normalizedTypes.slice(outDir.length + 1);
        const sourcePath = path.join(
            packageDir,
            rootDir,
            relativeToOutDir.replace(/\.d\.ts$/, '.ts'),
        );
        expect(fs.existsSync(sourcePath)).toBe(true);
    });
});
