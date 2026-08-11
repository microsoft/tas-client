/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFeatureProvider } from './FeatureProvider/IFeatureProvider.js';
import { TasApiFeatureProvider } from './FeatureProvider/TasApiFeatureProvider.js';
import { AssignmentsApiFeatureProvider } from './FeatureProvider/AssignmentsApiFeatureProvider.js';
import { HttpClient } from './Util/HttpClient.js';
import { ExperimentationServiceConfig } from '../contracts/ExperimentationServiceConfig.js';
import { ExperimentationServiceAutoPolling } from './ExperimentationServiceAutoPolling.js';

/**
 * Experimentation service to provide functionality of A/B experiments:
 * - reading flights;
 * - caching current set of flights;
 * - get answer on if flights are enabled.
 */
export class ExperimentationService extends ExperimentationServiceAutoPolling {
    public static REFRESH_RATE_IN_MINUTES: number = 30;

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
                this.options.endpoint,
                this.options.fetch,
                this.options.extensionName,
            ),
        );

        // If a new assignments endpoint is configured, add a provider that calls the new
        // TAS assignments API in parallel and whose assignments are merged with the legacy
        // provider's results (new values win for overlapping variables). It uses its own
        // filter providers (which emit the new assignments-API parameter names) so the
        // legacy keys never reach it.
        if (this.options.assignmentsEndpoint) {
            this.addFeatureProvider(
                new AssignmentsApiFeatureProvider(
                    new HttpClient(this.options.assignmentsEndpoint),
                    this.telemetry,
                    this.options.assignmentsFilterProviders ?? this.filterProviders,
                    this.options.assignmentsEndpoint,
                    this.options.assignmentsFetch ?? this.options.fetch,
                    this.options.extensionName,
                ),
            );
        }

        // This will start polling the TAS.
        super.init();
    }
}
