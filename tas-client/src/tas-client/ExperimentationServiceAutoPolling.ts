/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentationServiceBase } from './ExperimentationServiceBase.js';
import { IExperimentationTelemetry } from '../contracts/IExperimentationTelemetry.js';
import { PollingService } from './Util/PollingService.js';
import { IExperimentationFilterProvider } from '../contracts/IExperimentationFilterProvider.js';
import { IKeyValueStorage } from '../contracts/IKeyValueStorage.js';
import { FeatureData } from './FeatureProvider/IFeatureProvider.js';

/**
 * Implementation of Feature provider that provides a polling feature, where the source can be re-fetched every x time given.
 */
export abstract class ExperimentationServiceAutoPolling extends ExperimentationServiceBase {
    private pollingService?: PollingService;

    constructor(
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
        protected refreshRateMs: number,
        protected assignmentContextTelemetryPropertyName: string,
        protected telemetryEventName: string,
        protected storageKey?: string,
        protected storage?: IKeyValueStorage,
    ) {
        super(telemetry, assignmentContextTelemetryPropertyName, telemetryEventName, storageKey, storage);
        // Excluding 0 since it allows to turn off the auto polling.
        if (refreshRateMs < 1000 && refreshRateMs !== 0) {
            throw new Error(
                'The minimum refresh rate for polling is 1000 ms (1 second). If you wish to deactivate this auto-polling use value of 0.',
            );
        }

        if (refreshRateMs > 0) {
            this.pollingService = new PollingService(refreshRateMs);
            this.pollingService.OnPollTick(async () => {
                await super.getFeaturesAsync();
            });
        }
    }

    protected init(): void {
        if (this.pollingService) {
            this.pollingService.StartPolling(true);
        } else {
            super.getFeaturesAsync();
        }
    }

    /**
     * Wrapper that will reset the polling intervals whenever the feature data is fetched manually.
     */
    protected async getFeaturesAsync(overrideInMemoryFeatures = false): Promise<FeatureData> {
        if (!this.pollingService) {
            return await super.getFeaturesAsync(overrideInMemoryFeatures);
        } else {
            this.pollingService.StopPolling();
            let result = await super.getFeaturesAsync(overrideInMemoryFeatures);
            this.pollingService.StartPolling();
            return result;
        }
    }
}
