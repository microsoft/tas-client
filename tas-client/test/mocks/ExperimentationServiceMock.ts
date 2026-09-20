/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationServiceConfig } from '../../src/contracts/ExperimentationServiceConfig.js';
import { ExperimentationServiceBase } from '../../src/tas-client/ExperimentationServiceBase.js';
import { IFeatureProvider } from '../../src/tas-client/FeatureProvider/IFeatureProvider.js';
import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock.js';

type ServiceOptions = Partial<
    Pick<ExperimentationServiceConfig, 'telemetry' | 'keyValueStorage' | 'storageKey'>
>;

// Exposes the base service's protected refresh operation without starting background work.
export class ExperimentationServiceMock extends ExperimentationServiceBase {
    constructor(providers?: IFeatureProvider[], options: ServiceOptions = {}) {
        super(
            options.telemetry ?? new ExperimentationTelemetryMock(),
            'assignmentContext',
            'query-expfeature',
            options.storageKey,
            options.keyValueStorage,
        );
        if (providers) {
            this.featureProviders = [];
            this.addFeatureProvider(...providers);
        }
    }

    protected init(): void {}

    public refresh(overrideInMemoryFeatures = false) {
        return this.getFeaturesAsync(overrideInMemoryFeatures);
    }

    public get cacheStorage() {
        return this.storage;
    }
}
