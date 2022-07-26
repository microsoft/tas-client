/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../contracts/IExperimentationFilterProvider';
import { AxiosResponse } from 'axios';
import { AxiosHttpClient } from '../Util/AxiosHttpClient';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry';
import { FilteredFeatureProvider } from './FilteredFeatureProvider';
import { FeatureData, ConfigData } from './IFeatureProvider';

/**
 * Feature provider implementation that calls the TAS web service to get the most recent active features.
 */
export class TasApiFeatureProvider extends FilteredFeatureProvider {
    constructor(
        protected httpClient: AxiosHttpClient,
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
        // convert these filters into something axios can take as headers.
        for (let key of filters.keys()) {
            const filterValue = filters.get(key);
            headers[key] = filterValue;
        }

        //axios webservice call.
        let response: AxiosResponse<TASFeatureData> | undefined;

        
        try {
            /**
             * As mentioned in the axios docs:
             * Axios Promise will handle handle the catch
             * section of promises whenever a request is not succesful.
             * https://axios-http.com/docs/handling_errors
             */
            response = await this.httpClient.get({ headers: headers });
        } catch(error: any) {
            const properties: Map<string, string> = new Map();
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                properties.set("RESPONSE_DATA", error.response.data);
                properties.set("RESPONSE_STATUS", error.response.status);
                properties.set("RESPONSE_HEADERS", error.response.headers);
              } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                // http.ClientRequest in node.js
                properties.set("ERROR_REQUEST", JSON.stringify(error.request));
              } else {
                // Something happened in setting up the request that triggered an Error
                properties.set("ERROR_MESSAGE", error.message);
              }
              properties.set("ERROR_CONFIG", JSON.stringify(error.config));
              this.telemetry.postEvent("tasApiFetchError", properties);
        }

        // In case the response fetchin failed, return 
        // default feature data.
        if (!response){
            return {
                features: [],
                assignmentContext: '',
                configs: []
            };
        }

        // If we have at least one filter, we post it to telemetry event.
        if (filters.keys.length > 0) {
            this.PostEventToTelemetry(headers);
        }


        // Read the response data from the server.
        let responseData = response!.data;
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
            configs
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
