/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock';
import { ExperimentationFilterProviderMock } from './ExperimentationFilterProviderMock';
import { KeyValueStorageMock } from './KeyValueStorageMock';
import { FetchResolver } from './FetchResolver';
import { BaseFeatureProviderMock } from './BaseFeatureProviderMock';
import { ExperimentationServiceAutoPolling } from '../../src/tas-client/ExperimentationServiceAutoPolling';
import { IExperimentationTelemetry } from '../../src/contracts/IExperimentationTelemetry';
import { IKeyValueStorage } from '../../src/contracts/IKeyValueStorage';
import { IFeatureProvider } from '../../src/tas-client/FeatureProvider/IFeatureProvider';

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
            'FeaturesTelemetryEventName',
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

        if (this.featuresTelemetryPropertyName == null) {
            this.featuresTelemetryPropertyName = 'MockFeaturesTelemetryProperty';
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
