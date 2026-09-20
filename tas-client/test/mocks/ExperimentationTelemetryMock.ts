/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from '../../src/contracts/IExperimentationTelemetry.js';

export class ExperimentationTelemetryMock implements IExperimentationTelemetry {
    public readonly postedEvents: {
        eventName: string;
        args: Map<string, string>;
        sharedProperties: Map<string, string>;
    }[] = [];
    public readonly sharedProperties = new Map<string, string>();

    public postEvent(eventName: string, args: Map<string, string>): void {
        this.postedEvents.push({
            eventName,
            args: new Map(args),
            sharedProperties: new Map(this.sharedProperties),
        });
    }

    public eventsNamed(eventName: string) {
        return this.postedEvents.filter((event) => event.eventName === eventName);
    }

    public setSharedProperty(name: string, value: string): void {
        this.sharedProperties.set(name, value);
    }
}
