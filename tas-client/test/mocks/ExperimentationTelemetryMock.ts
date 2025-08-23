/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetry } from '../../src/contracts/IExperimentationTelemetry.js';

export class ExperimentationTelemetryMock implements IExperimentationTelemetry {
    public postedEvents: { eventName: string, args: any, sharedProperties: Map<string, string> }[] = [];
    public postEvent(eventName: string, args: any): void {
        console.log(`Post Event: ${eventName}`);
        console.log(args);
        this.postedEvents.push({ eventName, args, sharedProperties: new Map(this.sharedProperties) });
    }

    public sharedProperties: Map<string, string> = new Map<string, string>();

    public setSharedProperty(name: string, value: string): void {
        this.sharedProperties.set(name, value);
    }
}
