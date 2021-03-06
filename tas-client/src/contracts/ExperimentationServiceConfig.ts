/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from './IExperimentationTelemetry';
import { IExperimentationFilterProvider } from './IExperimentationFilterProvider';
import { IKeyValueStorage } from './IKeyValueStorage';

/**
 * Options that include the implementations of the Experimentation service.
 */
export interface ExperimentationServiceConfig {
    telemetry: IExperimentationTelemetry;
    endpoint: string;
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
