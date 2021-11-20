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
