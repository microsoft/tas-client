/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../contracts/IExperimentationFilterProvider';
import { FetchError, FetchResult, HttpClient } from '../Util/HttpClient';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry';
import { FilteredFeatureProvider } from './FilteredFeatureProvider';
import { FeatureData, ConfigData } from './IFeatureProvider';

export const TASAPI_FETCHERROR_EVENTNAME = 'call-tas-error';
const ERROR_TYPE = 'ErrorType';
/**
 * Feature provider implementation that calls the TAS web service to get the most recent active features.
 */
export class TasApiFeatureProvider extends FilteredFeatureProvider {
    constructor(
        protected httpClient: HttpClient,
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
    ) {
        super(telemetry, filterProviders);
    }

    /**
     * Method that handles fetching of latest data (in this case, flights) from the provider.
     */
    public async fetch(): Promise<FeatureData> {
        // We get the filters that will be sent as headers.
        let filters = this.getFilters();
        let headers: any = {};

        // Filters are handled using Map<string,any> therefore we need to
        // convert these filters into something fetch can take as headers.
        for (let key of filters.keys()) {
            const filterValue = filters.get(key);
            headers[key] = filterValue;
        }

        //webservice call
        let response: FetchResult | undefined;

        try {
            response = await this.httpClient.get({ headers: headers });
        } catch (error) {
            const fetchError = error as FetchError;
            const properties: Map<string, string> = new Map();
            if (fetchError.responseReceived && !fetchError.responseOk) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                properties.set(ERROR_TYPE, 'ServerError');
            } else if (fetchError.responseReceived === false) {
                // The request was made but no response was received
                properties.set(ERROR_TYPE, 'NoResponse');
            } else {
                // Something happened in setting up the request that triggered an Error
                properties.set(ERROR_TYPE, 'GenericError');
            }
            this.telemetry.postEvent(TASAPI_FETCHERROR_EVENTNAME, properties);
        }

        // In case the response fetching failed, throw
        // exception so that the caller exits.
        if (!response) {
            throw Error(TASAPI_FETCHERROR_EVENTNAME);
        }

        // If we have at least one filter, we post it to telemetry event.
        if (filters.keys.length > 0) {
            this.PostEventToTelemetry(headers);
        }

        // Read the response data from the server.
        const responseData = response.data;
        let configs = responseData.Configs;
        let features: string[] = [];
        for (let c of configs) {
            if (!c.Parameters) {
                continue;
            }

            for (let key of Object.keys(c.Parameters)) {
                const featureName = key + (c.Parameters[key] ? '' : 'cf');
                if (!features.includes(featureName)) {
                    features.push(featureName);
                }
            }
        }

        return {
            features,
            assignmentContext: responseData.AssignmentContext,
            configs,
        };
    }
}

export interface TASFeatureData {
    Features: any[];
    Flights: any[];
    Configs: ConfigData[];
    ParameterGroups: any[];
    FlightingVersion: number;
    ImpressionId: string;
    FlightingEnrichments: any;
    AssignmentContext: string;
}
