/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFeatureProvider } from './FeatureProvider/IFeatureProvider';
import { TasApiFeatureProvider } from './FeatureProvider/TasApiFeatureProvider';
import { HttpClient } from './Util/HttpClient';
import { ExperimentationServiceConfig } from '../contracts/ExperimentationServiceConfig';
import { ExperimentationServiceAutoPolling } from './ExperimentationServiceAutoPolling';

/**
 * Experimentation service to provide functionality of A/B experiments:
 * - reading flights;
 * - caching current set of flights;
 * - get answer on if flights are enabled.
 */
export class ExperimentationService extends ExperimentationServiceAutoPolling {
    public static REFRESH_RATE_IN_MINUTES: number = 30;

    protected featureProviders?: IFeatureProvider[];

    constructor(private options: ExperimentationServiceConfig) {
        super(
            options.telemetry,
            options.filterProviders || [], // Defaulted to empty array.
            options.refetchInterval != null
                ? options.refetchInterval
                : // If no fetch interval is provided, refetch functionality is turned off.
                  0,
            options.assignmentContextTelemetryPropertyName,
            options.telemetryEventName,
            options.storageKey,
            options.keyValueStorage,
        );
        this.invokeInit();
    }

    protected init(): void {
        // set feature providers to be an empty array.
        this.featureProviders = [];

        // Add WebApi feature provider.
        this.addFeatureProvider(
            new TasApiFeatureProvider(
                new HttpClient(this.options.endpoint),
                this.telemetry,
                this.filterProviders,
            ),
        );

        // This will start polling the TAS.
        super.init();
    }
}
