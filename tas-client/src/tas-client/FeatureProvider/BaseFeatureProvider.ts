/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFeatureProvider, FeatureData } from './IFeatureProvider.js';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry.js';

/**
 * Abstract class for Feature Provider Implementation.
 */
export abstract class BaseFeatureProvider implements IFeatureProvider {
    private fetchPromise?: Promise<FeatureData>;
    private isFetching: boolean = false;

    /**
     * @param telemetry The telemetry implementation.
     */
    constructor(protected telemetry: IExperimentationTelemetry) { }

    /**
     * Method that wraps the fetch method in order to re-use the fetch promise if needed.
     * @param headers The headers to be used on the fetch method.
     */
    public async getFeatures(): Promise<FeatureData> {
        if (this.isFetching && this.fetchPromise) {
            return this.fetchPromise;
        }

        this.isFetching = true;
        this.fetchPromise = this.fetch();
        try {
            return await this.fetchPromise;
        } finally {
            // Reset even if the fetch rejected, so a failed cycle doesn't wedge future fetches.
            this.isFetching = false;
            this.fetchPromise = undefined;
        }
    }

    /**
     * Fetch method that retrieves asynchronously the required feature data.
     */
    protected abstract fetch(): Promise<FeatureData>;
}
