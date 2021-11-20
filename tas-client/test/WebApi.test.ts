/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyValueStorageMock } from './mocks/KeyValueStorageMock';
import { ExperimentationFilterProviderMock } from './mocks/ExperimentationFilterProviderMock';
import { ExperimentationService } from '../src/tas-client/ExperimentationService';
import { ExperimentationTelemetryMock } from './mocks/ExperimentationTelemetryMock';

/**
 * For this test we want to ensure the polling interval works properly when set.
 */
describe('Web Api Test', () => {
    /**
     * Experimentation service example instantiation.
     */
    let experimentationService = new ExperimentationService({
        telemetry: new ExperimentationTelemetryMock(),
        filterProviders: [new ExperimentationFilterProviderMock()],
        keyValueStorage: new KeyValueStorageMock(),
        storageKey: 'test_features',
        endpoint: 'https://default.exp-tas.com/vscode/ab',
        refetchInterval: 0,
        featuresTelemetryPropertyName: 'FeaturesTelemetryName',
        assignmentContextTelemetryPropertyName: 'AssignmentContextTelemetryName',
        telemetryEventName: 'feature_queried',
    });

    /**
     * Experimentation service without filters.
     */
    let experimentationServiceWithoutFilters = new ExperimentationService({
        telemetry: new ExperimentationTelemetryMock(),
        endpoint: 'https://default.exp-tas.com/vscode/ab',
        featuresTelemetryPropertyName: 'FeaturesTelemetryName',
        assignmentContextTelemetryPropertyName: 'AssignmentContextTelemetryName',
        telemetryEventName: 'event',
    });

    /** 
     * Used to test the TAS endpoint.
     * This is only useful for testing purposes, and not for CI tests, as we don't want to attach an automatic unit
     * test to an actual endpoint.
    
    it('Should be able to fetch flights properly.', async () => {
        let enabled = await experimentationServiceWithoutFilters.isFlightEnabledAsync('pythondeeplearning');
        if (enabled) {
            console.log("It's enabled.");
        } else {
            console.log('not enabled.');
        }
    });
    */
});
