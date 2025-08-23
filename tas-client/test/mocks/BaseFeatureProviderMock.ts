/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../src/contracts/IExperimentationFilterProvider.js';
import { BaseFeatureProvider } from '../../src/tas-client/FeatureProvider/BaseFeatureProvider.js';
import { FetchResolver } from './FetchResolver.js';
import { IExperimentationTelemetry } from '../../src/contracts/IExperimentationTelemetry.js';
import { FilteredFeatureProvider } from '../../src/tas-client/FeatureProvider/FilteredFeatureProvider.js';
import { FeatureData } from '../../src/tas-client/FeatureProvider/IFeatureProvider.js';
import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock.js';

/**
 * If there's no cached data (which there isn't) an initial fetch will be executed.
 */
export class BaseFeatureProviderMock extends BaseFeatureProvider {
    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected resolver: FetchResolver,
        protected fetchDelay: number = 200,
    ) {
        super(telemetry);
    }

    protected fetch(): Promise<FeatureData> {
        return new Promise((resolve) => {
            setTimeout(() => resolve(this.resolver.nextResult()), this.fetchDelay);
        });
    }
}

export class ThrowFeatureProvider extends BaseFeatureProvider {
    constructor(
        protected fetchDelay: number = 200,
    ) {
        super(new ExperimentationTelemetryMock());
    }

    protected fetch(): Promise<FeatureData> {
        return new Promise((resolve, reject) => {
            setTimeout(() => reject('Error'), this.fetchDelay);
        });
    }
}

export class FilteredFeatureProviderMock extends FilteredFeatureProvider {
    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
    ) {
        super(telemetry, filterProviders);
    }

    public lastFilters: Map<string, any> | undefined;

    protected fetch(): Promise<FeatureData> {
        this.lastFilters = this.getFilters();
        return Promise.resolve({ features: [], assignmentContext: '', configs: [] });
    }
}
