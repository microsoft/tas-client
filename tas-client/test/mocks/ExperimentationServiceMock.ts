/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock.js';
import { ExperimentationFilterProviderMock } from './ExperimentationFilterProviderMock.js';
import { KeyValueStorageMock } from './KeyValueStorageMock.js';
import { FetchResolver } from './FetchResolver.js';
import { BaseFeatureProviderMock } from './BaseFeatureProviderMock.js';
import { ExperimentationServiceAutoPolling } from '../../src/tas-client/ExperimentationServiceAutoPolling.js';
import { IExperimentationTelemetry } from '../../src/contracts/IExperimentationTelemetry.js';
import { IKeyValueStorage } from '../../src/contracts/IKeyValueStorage.js';
import { IFeatureProvider } from '../../src/tas-client/FeatureProvider/IFeatureProvider.js';

export class ExperimentationServiceMock extends ExperimentationServiceAutoPolling {
    constructor(
        protected featureProviders: IFeatureProvider[] = [],
        private testSpecs: FeatureProviderTestSpec[] = [],
        private pollingInterval: number = 1000,
        experimentationTelemetry?: IExperimentationTelemetry,
        keyValueStorage?: IKeyValueStorage
    ) {
        super(
            experimentationTelemetry || new ExperimentationTelemetryMock(),
            [new ExperimentationFilterProviderMock()],
            pollingInterval,
            'AssignmentContextTelemetryEventName',
            'TelemetryName',
            'StorageKey',
            keyValueStorage || new KeyValueStorageMock(),
        );
        this.invokeInit();
    }

    protected init(): void {
        for (let spec of this.testSpecs) {
            this.addFeatureProvider(
                new BaseFeatureProviderMock(this.telemetry, spec.fetchResolver, spec.fetchDelay),
            );
        }

        if (this.assignmentContextTelemetryPropertyName == null) {
            this.assignmentContextTelemetryPropertyName = 'MockAssignmentContextTelemetryProperty';
        }

        super.init();
    }
}

export interface FeatureProviderTestSpec {
    fetchDelay: number;
    fetchResolver: FetchResolver;
}
