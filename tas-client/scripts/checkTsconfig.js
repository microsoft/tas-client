/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const requiredTsconfigFiles = ['tsconfig.json'];
const publishedFiles = new Set(packageJson.files ?? []);

for (const file of requiredTsconfigFiles) {
    if (!existsSync(join(root, file))) {
        throw new Error(`Missing required TypeScript configuration: ${file}`);
    }

    if (!publishedFiles.has(file)) {
        throw new Error(`TypeScript configuration is not included in the package: ${file}`);
    }
}
