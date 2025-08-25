/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFeatureProvider, FeatureData } from './IFeatureProvider.js';
import { IExperimentationTelemetry } from 'src/contracts/IExperimentationTelemetry.js';

/**
 * Abstract class for Feature Provider Implementation.
 */
export abstract class BaseFeatureProvider implements IFeatureProvider {
    private fetchPromise?: Promise<FeatureData>;
    private isFetching: boolean = false;

    /**
     * @param telemetry The telemetry implementation.
     */
    constructor(protected telemetry: IExperimentationTelemetry) {}

    /**
     * Method that wraps the fetch method in order to re-use the fetch promise if needed.
     * @param headers The headers to be used on the fetch method.
     */
    public async getFeatures(): Promise<FeatureData> {
        if (this.isFetching && this.fetchPromise) {
            return this.fetchPromise;
        }

        this.fetchPromise = this.fetch();
        let features = await this.fetchPromise;
        this.isFetching = false;
        this.fetchPromise = undefined;

        return features;
    }

    /**
     * Fetch method that retrieves asynchronously the required feature data.
     */
    protected abstract fetch(): Promise<FeatureData>;
}
