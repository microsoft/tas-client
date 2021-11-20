/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationTelemetryMock } from './ExperimentationTelemetryMock';
import {
    ExperimentationFilterProviderOneFilterMock,
    ExperimentationFilterProviderTwoFilterMock,
} from './ExperimentationFilterProviderMock';
import { KeyValueStorageMock } from './KeyValueStorageMock';
import { FetchResolver } from './FetchResolver';
import { BaseFeatureProviderMock, FilteredFeatureProviderMock } from './BaseFeatureProviderMock';
import { ExperimentationServiceAutoPolling } from '../../src/tas-client/ExperimentationServiceAutoPolling';
import { IExperimentationFilterProvider } from '../../src/contracts/IExperimentationFilterProvider';

export class FilteredExperimentationServiceMock extends ExperimentationServiceAutoPolling {
    constructor(protected filterProviders: IExperimentationFilterProvider[]) {
        super(
            new ExperimentationTelemetryMock(),
            filterProviders,
            0,
            'FeaturesTelemetryEventName',
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

        if (this.featuresTelemetryPropertyName == null) {
            this.featuresTelemetryPropertyName = 'MockFeaturesTelemetryProperty';
        }
        if (this.assignmentContextTelemetryPropertyName == null) {
            this.assignmentContextTelemetryPropertyName = 'MockAssignmentContextTelemetryProperty';
        }
    }
}
