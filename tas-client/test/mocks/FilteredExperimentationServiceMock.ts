/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock.js';
import {
    ExperimentationFilterProviderOneFilterMock,
    ExperimentationFilterProviderTwoFilterMock,
} from './ExperimentationFilterProviderMock.js';
import { KeyValueStorageMock } from './KeyValueStorageMock.js';
import { FetchResolver } from './FetchResolver.js';
import { BaseFeatureProviderMock, FilteredFeatureProviderMock } from './BaseFeatureProviderMock.js';
import { ExperimentationServiceAutoPolling } from '../../src/tas-client/ExperimentationServiceAutoPolling.js';
import { IExperimentationFilterProvider } from '../../src/contracts/IExperimentationFilterProvider.js';

export class FilteredExperimentationServiceMock extends ExperimentationServiceAutoPolling {
    constructor(protected filterProviders: IExperimentationFilterProvider[]) {
        super(
            new ExperimentationTelemetryMock(),
            filterProviders,
            0,
            'AssignmentContextTelemetryEventName',
            'TelemetryName',
            'StorageKey',
            new KeyValueStorageMock(),
        );
        this.invokeInit();
    }

    public featureProvider: FilteredFeatureProviderMock | undefined;

    protected init(): void {
        // set feature providers to be an empty array.
        this.featureProviders = [];
        this.featureProvider = new FilteredFeatureProviderMock(
            this.telemetry,
            this.filterProviders,
        );
        this.addFeatureProvider(this.featureProvider);

        if (this.assignmentContextTelemetryPropertyName == null) {
            this.assignmentContextTelemetryPropertyName = 'MockAssignmentContextTelemetryProperty';
        }
    }
}
