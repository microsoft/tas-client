/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExperimentationTelemetry } from 'tas-client';

export interface RecordedEvent {
    name: string;
    properties: Map<string, string>;
}

export class FakeTelemetry implements IExperimentationTelemetry {
    public readonly events: RecordedEvent[] = [];
    public readonly sharedProperties = new Map<string, string>();
    public readonly sharedPropertyWrites: { name: string; value: string }[] = [];

    public setSharedProperty(name: string, value: string): void {
        this.sharedProperties.set(name, value);
        this.sharedPropertyWrites.push({ name, value });
    }

    public postEvent(name: string, properties: Map<string, string>): void {
        this.events.push({ name, properties: new Map(properties) });
    }

    public eventsNamed(name: string): RecordedEvent[] {
        return this.events.filter((event) => event.name === name);
    }
}
