/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../contracts/IExperimentationFilterProvider.js';
import { FetchError, FetchResult, HttpClient } from '../Util/HttpClient.js';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry.js';
import { FetchFn } from '../../contracts/ExperimentationServiceConfig.js';
import { FilteredFeatureProvider } from './FilteredFeatureProvider.js';
import { FeatureData, ConfigData } from './IFeatureProvider.js';

export const TASAPI_FETCHERROR_EVENTNAME = 'call-tas-error';
export const TAS_CALL_EVENTNAME = 'tas-call';
const ERROR_TYPE = 'ErrorType';
/**
 * Feature provider implementation that calls the TAS web service to get the most recent active features.
 */
export class TasApiFeatureProvider extends FilteredFeatureProvider {
    constructor(
        protected httpClient: HttpClient,
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
        protected endpoint?: string,
        protected fetchFn?: FetchFn,
        protected extensionName?: string,
    ) {
        super(telemetry, filterProviders);
    }

    /** Emits a uniform per-call event so callers can confirm a legacy TAS call and its outcome. */
    private postCallTelemetry(outcome: string, assignmentContext: string = ''): void {
        const properties: Map<string, string> = new Map();
        properties.set('callType', 'legacy');
        properties.set('outcome', outcome);
        properties.set('extensionName', this.extensionName ?? '');
        properties.set('assignmentContext', assignmentContext);
        this.telemetry.postEvent(TAS_CALL_EVENTNAME, properties);
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
            if (this.fetchFn && this.endpoint) {
                // Host-provided transport (e.g. VS Code fetcher service) for proxy support.
                const res = await this.fetchFn(this.endpoint, { method: 'GET', headers });
                if (res.status < 200 || res.status > 299) {
                    throw new FetchError('Response not ok', true, false);
                }
                response = { data: await res.json() };
            } else {
                response = await this.httpClient.get({ headers: headers });
            }
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
            this.postCallTelemetry(properties.get(ERROR_TYPE)!);
        }

        // In case the response fetching failed, throw
        // exception so that the caller exits.
        if (!response) {
            throw Error(TASAPI_FETCHERROR_EVENTNAME);
        }

        this.postCallTelemetry('Success', response.data?.AssignmentContext ?? '');

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
