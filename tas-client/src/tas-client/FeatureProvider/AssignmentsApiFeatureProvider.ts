/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationFilterProvider } from '../../contracts/IExperimentationFilterProvider.js';
import { FetchError, FetchResult, HttpClient } from '../Util/HttpClient.js';
import { IExperimentationTelemetry } from '../../contracts/IExperimentationTelemetry.js';
import { AssignmentsFetchFn } from '../../contracts/ExperimentationServiceConfig.js';
import { FilteredFeatureProvider } from './FilteredFeatureProvider.js';
import { FeatureData } from './IFeatureProvider.js';

export const ASSIGNMENTS_FETCHERROR_EVENTNAME = 'call-assignments-error';
export const ASSIGNMENTS_VALIDATION_EVENTNAME = 'assignments-validation';
export const TAS_CALL_EVENTNAME = 'tas-call';
const ERROR_TYPE = 'ErrorType';

/**
 * Feature provider that calls the new TAS assignments API (POST /api/v1/assignments)
 * in parallel with the existing TAS provider.
 *
 * Its parsed assignments are merged with the legacy provider's results by the base
 * service: because this provider is registered after the legacy one, variables from the
 * new endpoint override/augment the legacy ones for the same config. On any failure it
 * resolves with empty feature data and never throws, so a problem with the new endpoint
 * cannot wipe out the legacy (authoritative) provider's results.
 */
export class AssignmentsApiFeatureProvider extends FilteredFeatureProvider {
    /**
     * Config id under which the flat `featureVariables` map is exposed. Both VS Code core
     * and the Copilot extension query treatment variables under the `vscode` config.
     */
    private static readonly CONFIG_ID = 'vscode';
    constructor(
        protected httpClient: HttpClient,
        protected telemetry: IExperimentationTelemetry,
        protected filterProviders: IExperimentationFilterProvider[],
        protected endpoint?: string,
        protected fetchFn?: AssignmentsFetchFn,
        protected extensionName?: string,
    ) {
        super(telemetry, filterProviders);
    }

    private static readonly EMPTY_FEATURE_DATA: FeatureData = {
        features: [],
        assignmentContext: '',
        configs: [],
    };

    /**
     * Calls the new assignments API and returns its assignments as feature data to be
     * merged with the legacy provider. Never throws; on any failure it returns empty
     * feature data so the legacy provider's results are preserved.
     */
    public async fetch(): Promise<FeatureData> {
        const userParams = this.buildUserParams();

        // The API requires at least one userParam. If we have none, skip the call.
        if (Object.keys(userParams).length === 0) {
            return AssignmentsApiFeatureProvider.EMPTY_FEATURE_DATA;
        }

        const requestBody: AssignmentRequest = { userParams };

        let responseData: AssignmentResponse;
        try {
            if (this.fetchFn) {
                // Host-provided transport (e.g. VS Code fetcher service).
                const res = await this.fetchFn(this.endpoint!, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
                if (res.status < 200 || res.status > 299) {
                    this.postErrorTelemetry(new FetchError('Response not ok', true, false));
                    return AssignmentsApiFeatureProvider.EMPTY_FEATURE_DATA;
                }
                responseData = (await res.json()) as AssignmentResponse;
            } else {
                const response: FetchResult = await this.httpClient.post({ body: requestBody });
                responseData = response.data as AssignmentResponse;
            }
        } catch (error) {
            this.postErrorTelemetry(error as FetchError);
            return AssignmentsApiFeatureProvider.EMPTY_FEATURE_DATA;
        }

        try {
            const properties: Map<string, string> = new Map();
            properties.set(
                'FeatureVariableCount',
                String(Object.keys(responseData.featureVariables || {}).length),
            );
            properties.set(
                'AssignedVariantCount',
                String((responseData.assignedVariants || []).length),
            );
            properties.set('DataVersion', String(responseData.dataVersion));
            properties.set('AssignmentContext', responseData.assignmentContext || '');
            this.telemetry.postEvent(ASSIGNMENTS_VALIDATION_EVENTNAME, properties);
        } catch {
            // Validation telemetry must never affect feature assignment.
        }

        this.postCallTelemetry('Success', responseData.assignmentContext || '');

        // Merge the new endpoint's assignments into the active feature set.
        return AssignmentsApiFeatureProvider.toFeatureData(responseData);
    }

    /**
     * Maps an assignments-API response into the `FeatureData` shape consumed by the base
     * service. The flat `featureVariables` map is exposed as the parameters of a single
     * `vscode` config so that `getTreatmentVariable('vscode', name)` resolves against it.
     * Truthy-valued variables are also listed as enabled flights. The legacy `cf` suffix
     * convention is intentionally not applied to the new endpoint.
     */
    private static toFeatureData(response: AssignmentResponse): FeatureData {
        const featureVariables = response.featureVariables || {};
        const parameters: { [key: string]: boolean | number | string } = {};
        const features: string[] = [];
        for (const key of Object.keys(featureVariables)) {
            const value = AssignmentsApiFeatureProvider.coerce(featureVariables[key]);
            parameters[key] = value;
            if (value && !features.includes(key)) {
                features.push(key);
            }
        }

        return {
            features,
            assignmentContext: response.assignmentContext || '',
            configs:
                Object.keys(parameters).length > 0
                    ? [{ Id: AssignmentsApiFeatureProvider.CONFIG_ID, Parameters: parameters }]
                    : [],
        };
    }

    /**
     * The assignments API returns all variable values as strings. Coerce `"true"`/`"false"`
     * to booleans and numeric strings to numbers so treatment lookups match the typed
     * values returned by the legacy provider.
     */
    private static coerce(value: string): boolean | number | string {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        if (value !== '' && !isNaN(Number(value))) {
            return Number(value);
        }
        return value;
    }

    /**
     * Builds the userParams map from the configured filter providers. Null/empty values
     * are dropped and the map is capped at 50 entries per the API contract.
     */
    private buildUserParams(): Record<string, string> {
        const filters = this.getFilters();
        const userParams: Record<string, string> = {};
        for (const key of filters.keys()) {
            const value = filters.get(key);
            if (value === undefined || value === null || value === '') {
                continue;
            }
            if (Object.keys(userParams).length >= 50) {
                break;
            }
            userParams[key] = String(value);
        }
        return userParams;
    }

    private postErrorTelemetry(fetchError: FetchError): void {
        const properties: Map<string, string> = new Map();
        let outcome: string;
        if (fetchError.responseReceived && !fetchError.responseOk) {
            outcome = 'ServerError';
        } else if (fetchError.responseReceived === false) {
            outcome = 'NoResponse';
        } else {
            outcome = 'GenericError';
        }
        properties.set(ERROR_TYPE, outcome);
        this.telemetry.postEvent(ASSIGNMENTS_FETCHERROR_EVENTNAME, properties);
        this.postCallTelemetry(outcome);
    }

    /** Emits a uniform per-call event so callers can confirm a new-TAS call and its outcome. */
    private postCallTelemetry(outcome: string, assignmentContext: string = ''): void {
        const properties: Map<string, string> = new Map();
        properties.set('callType', 'assignments');
        properties.set('outcome', outcome);
        properties.set('extensionName', this.extensionName ?? '');
        properties.set('assignmentContext', assignmentContext);
        this.telemetry.postEvent(TAS_CALL_EVENTNAME, properties);
    }
}

/**
 * Request body for POST /api/v1/assignments.
 */
export interface AssignmentRequest {
    /**
     * Key-value pairs for audience filtering and randomization. At least one entry required.
     */
    userParams: Record<string, string>;
    /**
     * Experiment subscription scopes to filter evaluation.
     */
    scopes?: string[];
    /**
     * Variant names to force-assign.
     */
    requiredVariants?: string[];
    /**
     * Variant names to block from assignment.
     */
    blockedVariants?: string[];
}

/**
 * Response body for POST /api/v1/assignments.
 */
export interface AssignmentResponse {
    featureVariables: Record<string, string>;
    assignedVariants: AssignedVariant[];
    dataVersion: number;
    assignmentContext: string;
}

export interface AssignedVariant {
    name: string;
    numberline: string;
    isForced: boolean;
    variantAllocationId: number;
}
