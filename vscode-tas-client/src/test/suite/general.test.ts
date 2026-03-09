/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    VSCodeFilterProvider,
    TargetPopulation,
    Filters,
} from '../../vscode-tas-client/VSCodeFilterProvider';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('General Tests', () => {
    test('Should provide default filters for tas client', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            'extension_version',
            TargetPopulation.Internal,
        );
        const filters = filterProvider.getFilters();
        const greaterThanZero = filters.size > 0;
        assert.equal(greaterThanZero, true);
    });

    test('Should remove tag suffix for extension version', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            '1.2.3-dev',
            TargetPopulation.Internal,
        );
        const filter = filterProvider.getFilterValue(Filters.ExtensionVersion);
        assert.equal(filter, '1.2.3');
    });

    test('Should return extension version as-is if it has no suffix', async () => {
        const filterProvider = new VSCodeFilterProvider(
            'extension_name',
            '1.2.3',
            TargetPopulation.Internal,
        );
        const filter = filterProvider.getFilterValue(Filters.ExtensionVersion);
        assert.equal(filter, '1.2.3');
    });
});

suite('Package.json validation', () => {
    const packageDir = path.resolve(__dirname, '../../..');
    const pkgJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'));
    const tsconfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'tsconfig.json'), 'utf-8'));
    const outDir = (tsconfig.compilerOptions?.outDir ?? '.')
        .replace(/^\.\//, '')
        .replace(/\/$/, '');
    const rootDir = tsconfig.compilerOptions?.rootDir ?? '.';

    test('main field should point into tsconfig outDir', () => {
        const normalizedMain = pkgJson.main.replace(/^\.\//, '');
        assert.ok(
            normalizedMain.startsWith(outDir + '/'),
            `package.json "main" ("${pkgJson.main}") must start with tsconfig outDir ("${outDir}/")`,
        );
    });

    test('main field should have a corresponding source file', () => {
        const normalizedMain = pkgJson.main.replace(/^\.\//, '');
        const relativeToOutDir = normalizedMain.slice(outDir.length + 1);
        const sourcePath = path.join(packageDir, rootDir, relativeToOutDir.replace(/\.js$/, '.ts'));
        assert.ok(
            fs.existsSync(sourcePath),
            `Source file "${sourcePath}" does not exist for "main": "${pkgJson.main}"`,
        );
    });

    test('types field should point into tsconfig outDir', () => {
        if (!pkgJson.types) {
            return;
        }
        const normalizedTypes = pkgJson.types.replace(/^\.\//, '');
        assert.ok(
            normalizedTypes.startsWith(outDir + '/'),
            `package.json "types" ("${pkgJson.types}") must start with tsconfig outDir ("${outDir}/")`,
        );
    });

    test('types field should have a corresponding source file', () => {
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
        assert.ok(
            fs.existsSync(sourcePath),
            `Source file "${sourcePath}" does not exist for "types": "${pkgJson.types}"`,
        );
    });
});
