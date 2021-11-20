/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Telemetry for the experimentation service.
 */
export interface IExperimentationTelemetry {
    /**
     * Set shared property for all events.
     * @param name The name of the shared property.
     * @param value The value of the shared property.
     */
    setSharedProperty(name: string, value: string): void;

    /**
     * Posts an event into the telemetry implementation.
     */
    postEvent(eventName: string, props: Map<string, string>): void;
}
