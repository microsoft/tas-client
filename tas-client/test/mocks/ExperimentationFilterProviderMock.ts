/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../src/contracts/IExperimentationFilterProvider';

export class ExperimentationFilterProviderMock implements IExperimentationFilterProvider {
    public getFilters() {
        return new Map<string, any>();
    }
}

export class ExperimentationFilterProviderOneFilterMock implements IExperimentationFilterProvider {
    public getFilters(): Map<string, any> {
        const filters = new Map<string, any>();
        filters.set('joker', true);
        return filters;
    }
}

export class ExperimentationFilterProviderTwoFilterMock implements IExperimentationFilterProvider {
    public getFilters(): Map<string, any> {
        const filters = new Map<string, any>();
        filters.set('lucario', true);
        filters.set('wario', false);
        return filters;
    }
}
