/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from './IExperimentationTelemetry.js';
import { IExperimentationFilterProvider } from './IExperimentationFilterProvider.js';
import { IKeyValueStorage } from './IKeyValueStorage.js';

/**
 * Minimal response shape returned by {@link FetchFn}, matching the subset of the
 * Fetch API the providers need.
 */
export interface IFetchResponse {
    readonly status: number;
    json(): Promise<any>;
}

/** @deprecated Use {@link IFetchResponse}. */
export type IAssignmentsFetchResponse = IFetchResponse;

/**
 * Optional custom transport used for both the legacy endpoint (GET) and the assignments
 * endpoint (POST). When provided via {@link ExperimentationServiceConfig.fetch}, providers
 * use this instead of their built-in HTTP client, so hosts can route requests through their
 * own networking stack (proxy handling, retries, user-agent, etc.). Filters are passed as
 * request headers (legacy) and the assignments body is passed as a JSON string.
 */
export type FetchFn = (
    url: string,
    init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
) => Promise<IFetchResponse>;

/**
 * @deprecated Use {@link FetchFn} via {@link ExperimentationServiceConfig.fetch}, which is
 * used for both the legacy and assignments endpoints. Retained for backward compatibility.
 */
export type AssignmentsFetchFn = (
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<IFetchResponse>;

/**
 * Options that include the implementations of the Experimentation service.
 */
export interface ExperimentationServiceConfig {
    telemetry: IExperimentationTelemetry;
    endpoint: string;
    /**
     * Optional friendly name of the calling extension/host, emitted on the `tas-call`
     * telemetry event so each TAS call can be attributed to its caller.
     */
    extensionName?: string;
    /**
     * Optional custom transport used for both the legacy {@link endpoint} (GET) and the
     * {@link assignmentsEndpoint} (POST). When provided, it is used instead of the built-in
     * HTTP client, letting hosts route requests through their own networking stack (e.g. the
     * VS Code fetcher service) for proxy support. A per-endpoint {@link assignmentsFetch}, if
     * set, takes precedence for the assignments request.
     */
    fetch?: FetchFn;
    /**
     * Optional endpoint for the new TAS assignments API (POST /api/v1/assignments).
     * When set, a request is sent to this endpoint in parallel with the main endpoint and
     * its assignments are merged into the active feature set (new values take precedence
     * for overlapping variables). On failure it contributes nothing and the main endpoint's
     * results are preserved.
     */
    assignmentsEndpoint?: string;
    /**
     * Filter providers used exclusively for the new TAS assignments API
     * ({@link assignmentsEndpoint}). These emit the assignments-API parameter names
     * directly, so the new endpoint never receives the legacy {@link filterProviders}
     * keys. When {@link assignmentsEndpoint} is set but this is omitted, the legacy
     * {@link filterProviders} are used as a fallback.
     */
    assignmentsFilterProviders?: IExperimentationFilterProvider[];
    /**
     * Optional custom transport for the assignments endpoint. When provided, it is used
     * instead of the built-in HTTP client for the {@link assignmentsEndpoint} request.
     */
    assignmentsFetch?: AssignmentsFetchFn;
    /**
     * If there's any specific filter provider for the endpoint filters, it's defined or added into this list.
     */
    filterProviders?: IExperimentationFilterProvider[];
    /**
     * @deprecated This property is no longer used. You can get equivalent information from the assignment context property.
     * A string containing the name for the features telemetry property.
     * This option is implemented in IExperimentation Telemetry.
     * This options posts to the implementation a list of
     * available features for the client, separated by ';'
     */
    featuresTelemetryPropertyName?: string;
    /**
     * A string containing the name for the assignment context telemetry property.
     * This option is implemented in IExperimentation Telemetry.
     * This options posts to the implementation the assignment context.
     */
    assignmentContextTelemetryPropertyName: string;
    /**
     * The name for the telemetry event. This event will be posted every time a flight is queried.
     */
    telemetryEventName: string;
    /**
     * Refetch interval overrides the interval in milliseconds the polling will take in between polls.
     * If set to 0 there will be no polling for this experimentation service.
     */
    refetchInterval?: number;

    /**
     * The key value storage key. Often used as the identifier of the storage.
     * By default it's set to ABExp.Features
     */
    storageKey?: string;

    /**
     * An implemention for key value storage usage.
     */
    keyValueStorage?: IKeyValueStorage;
}
