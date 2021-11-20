/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FilteredFeatureProvider } from "../../src/tas-client/FeatureProvider/FilteredFeatureProvider";
import { FeatureData } from "../../src/tas-client/FeatureProvider/IFeatureProvider";

export class MockFilteredFeatureProvider extends FilteredFeatureProvider {
    
    public fetch(): Promise<FeatureData> {
        const filters = this.getFilters();
        const headers: any = {};

        // Filters are handled using Map<string,any> therefore we need to
        // convert these filters into something axios can take as headers.
        for (let key of filters.keys()) {
            const filterValue = filters.get(key);
            headers[key] = filterValue;
        }

        this.PostEventToTelemetry(headers);

        return Promise.resolve({ features: [], assignmentContext: '', configs: [] });
    }

}