/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../src/contracts/IExperimentationFilterProvider.js';

export class ExperimentationFilterProviderMock implements IExperimentationFilterProvider {
    public readonly filters: Map<string, unknown>;

    constructor(entries: Iterable<readonly [string, unknown]> = []) {
        this.filters = new Map(entries);
    }

    public getFilters(): Map<string, unknown> {
        return new Map(this.filters);
    }
}
