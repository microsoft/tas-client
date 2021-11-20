/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../contracts/IExperimentationFilterProvider';
import { BaseFeatureProvider } from './BaseFeatureProvider';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry';

/**
 * Feature provider implementation that handles filters.
 */
export abstract class FilteredFeatureProvider extends BaseFeatureProvider {
    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
    ) {
        super(telemetry);
    }
    
    private cachedTelemetryEvents: any[] = [];

    protected getFilters(): Map<string, any> {
        // We get the filters that will be sent as headers.
        let filters: Map<string, any> = new Map<string, any>();
        for (let filter of this.filterProviders) {
            let filterHeaders = filter.getFilters();
            for (let key of filterHeaders.keys()) {
                // Headers can be overridden by custom filters.
                // That's why a check isn't done to see if the header already exists, the value is just set.
                let filterValue = filterHeaders.get(key);
                filters.set(key, filterValue);
            }
        }
        return filters;
    }

    protected PostEventToTelemetry(headers: any) {
        /**
         * If these headers have already been posted, we skip from posting them again..
         */
        if (this.cachedTelemetryEvents.includes(headers)) {
            return;
        }

        const jsonHeaders = JSON.stringify(headers);

        this.telemetry.postEvent(
            'report-headers',
            new Map<string, string>([['ABExp.headers', jsonHeaders]]),
        );

        /**
         * We cache the flight so we don't post it again.
         */
        this.cachedTelemetryEvents.push(headers);
    }
}
